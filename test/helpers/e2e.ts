/**
 * Mode-agnostic entry points for the e2e suite. Tests never branch on the
 * mode themselves: they call `startAnvil()` / `runCliBatch()`, which use
 * Docker (default, required in CI/CD) or a local anvil binary
 * (`pnpm test:e2e --no-docker`, local testing only).
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { GenericContainer, Network, Wait } from "testcontainers";
import type { Account } from "viem";
import {
  AnvilContainer,
  AnvilOptions,
  DEFAULT_ANVIL_IMAGE,
  StartedAnvilContainer,
} from "../../src";
import { probeJsonRpc } from "../../src/container/wait-strategy";
import { freePort, requireAnvilBinary, startLocalAnvil } from "./local-anvil";
import { E2E_MODE } from "./runtime";

export { E2E_ENABLED, E2E_MODE, describeE2E } from "./runtime";

/** Absolute paths of the e2e fixtures. */
export const FIXTURES = {
  /** A state dump written by anvil 1.6.0-rc1 (`--dump-state`). */
  state: path.resolve(__dirname, "..", "fixtures", "state.json"),
  /** A minimal geth-style genesis file. */
  genesis: path.resolve(__dirname, "..", "fixtures", "genesis.json"),
};

/**
 * Starts anvil with the given options in the active e2e mode.
 */
export function startAnvil(
  options: AnvilOptions = new AnvilOptions(),
  settings: { startupTimeoutMs?: number } = {},
): Promise<StartedAnvilContainer> {
  return startContainer(new AnvilContainer(options), settings);
}

/**
 * Starts a configured `AnvilContainer` (anvil + test client options) in the
 * active e2e mode: `container.start()` in Docker mode, a local process with
 * the same validation and test client setup in `--no-docker` mode.
 */
export function startContainer<TAccount extends Account | undefined>(
  container: AnvilContainer<TAccount>,
  settings: { startupTimeoutMs?: number } = {},
): Promise<StartedAnvilContainer<TAccount>> {
  if (E2E_MODE === "local") {
    return startLocalAnvil(container, settings);
  }
  if (settings.startupTimeoutMs)
    container.withStartupTimeout(settings.startupTimeoutMs);
  return container.start();
}

/**
 * Starts an upstream node and a second node forking it, reachable in both
 * modes: Docker containers share a network (the fork URL uses the upstream's
 * alias), local processes use the loopback URL.
 */
export async function startForkPair(
  forkOptions: (forkUrl: string) => AnvilOptions,
  prepareUpstream: (upstream: StartedAnvilContainer) => Promise<void> = () =>
    Promise.resolve(),
): Promise<{
  upstream: StartedAnvilContainer;
  fork: StartedAnvilContainer;
  forkUrl: string;
  stop(): Promise<void>;
}> {
  if (E2E_MODE === "local") {
    const upstream = await startContainer(new AnvilContainer());
    const fork = await prepareUpstream(upstream)
      .then(() =>
        startContainer(new AnvilContainer(forkOptions(upstream.rpcUrl))),
      )
      .catch(async (error: unknown) => {
        await upstream.stop();
        throw error;
      });
    return {
      upstream,
      fork,
      forkUrl: upstream.rpcUrl,
      stop: async () => {
        await fork.stop();
        await upstream.stop();
      },
    };
  }
  const network = await new Network().start();
  const forkUrl = "http://upstream:8545";
  const upstream = await new AnvilContainer()
    .withNetwork(network)
    .withNetworkAliases("upstream")
    .start();
  const fork = await prepareUpstream(upstream)
    .then(() =>
      new AnvilContainer(forkOptions(forkUrl)).withNetwork(network).start(),
    )
    .catch(async (error: unknown) => {
      await upstream.stop();
      await network.stop();
      throw error;
    });
  return {
    upstream,
    fork,
    forkUrl,
    stop: async () => {
      await fork.stop();
      await upstream.stop();
      await network.stop();
    },
  };
}

/** `useAnvil()`-compatible startable for the active e2e mode. */
export function startable<TAccount extends Account | undefined>(
  container: AnvilContainer<TAccount>,
  settings: { startupTimeoutMs?: number } = {},
): { start(): Promise<StartedAnvilContainer<TAccount>> } {
  return { start: () => startContainer(container, settings) };
}

/**
 * A raw anvil invocation used to compare the library's rules with anvil's own
 * behaviour (bypassing all library validation).
 *
 * - `parse` – runs only anvil's argument parser (`<args> completions bash`),
 *   which validates every `clap` rule and value and exits immediately.
 * - `boot`  – actually starts the node; success means it was still running
 *   after the boot window.
 */
export interface CliCase {
  readonly args: readonly string[];
  readonly mode: "parse" | "boot";
  /**
   * Files that must exist at the given absolute paths (container paths in
   * Docker mode; remapped into a temp dir in local mode).
   */
  readonly files?: Readonly<Record<string, string>>;
}

export interface CliResult {
  /** Process exit code; `undefined` when the node booted (still running). */
  readonly exitCode?: number;
  /** `true` for boot cases that were still running after the boot window. */
  readonly booted: boolean;
  /** First line of the error output. */
  readonly error: string;
}

/** Boot window of the Docker-mode script (no HTTP client in the image). */
const BOOT_WINDOW_SECONDS = 2;
/** Local boot cases: max time to answer JSON-RPC. */
const BOOT_TIMEOUT_MS = 15_000;
const BOOT_CONCURRENCY = 8;

function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE = /\u001b\[[0-9;]*m/g;

function firstErrorLine(output: string): string {
  const lines = output
    .split("\n")
    .map((line) => line.replace(ANSI_ESCAPE, "").trim())
    .filter(Boolean);
  return lines.find((line) => /error/i.test(line)) ?? lines[0] ?? "";
}

/**
 * Boot case: start anvil on a free port and wait until it answers JSON-RPC
 * (stricter and much faster than a fixed boot window).
 */
async function bootLocally(
  binary: string,
  args: readonly string[],
): Promise<CliResult> {
  const port = await freePort();
  const portIndex = args.indexOf("--port");
  const finalArgs =
    portIndex === -1
      ? [...args, "--port", String(port)]
      : args.map((arg, index) =>
          index === portIndex + 1 ? String(port) : arg,
        );
  const child = spawn(binary, finalArgs, { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
  let exitCode: number | undefined;
  const closed = new Promise<void>((resolve) =>
    child.once("close", (code) => {
      exitCode = code ?? 1;
      resolve();
    }),
  );
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (exitCode === undefined && Date.now() < deadline) {
    if (
      (await probeJsonRpc(`http://127.0.0.1:${port}`, "eth_chainId", 500))
        ?.result !== undefined
    ) {
      child.kill("SIGKILL");
      await closed;
      return { booted: true, error: "" };
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (exitCode === undefined) {
    child.kill("SIGKILL");
    await closed;
    return {
      exitCode: 124,
      booted: false,
      error: `did not answer JSON-RPC within ${BOOT_TIMEOUT_MS} ms`,
    };
  }
  return { exitCode, booted: false, error: firstErrorLine(output) };
}

/** Runs a generated script with `sh` and parses its results. */
async function runScript(
  cases: readonly CliCase[],
  anvil: string,
  tmpDir: string,
  extraEnv: Record<string, string> = {},
): Promise<CliResult[]> {
  const scriptPath = path.join(tmpDir, "cases.sh");
  fs.writeFileSync(scriptPath, buildCliScript(cases, anvil));
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("sh", [scriptPath], {
      env: { ...process.env, CLI_TMP: tmpDir, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
    child.once("error", reject);
    child.once("close", () => resolve(out));
  });
  return parseCliOutput(output, cases);
}

/**
 * Local runner. Parse cases run through the same shell script as Docker mode,
 * split across one `sh` per CPU: Node's `spawn` blocks its thread until the
 * child's `execve` of the 34 MB binary completes, so spawning from Node
 * serialises; parallel shells scale. Boot cases use {@link bootLocally}.
 */
async function runLocalBatch(cases: readonly CliCase[]): Promise<CliResult[]> {
  const binary = requireAnvilBinary();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "anvil-cli-"));
  try {
    // Map every absolute /tmp path used by the cases into a private directory.
    const pathMap = new Map<string, string>();
    const mapPath = (target: string) => {
      if (!pathMap.has(target))
        pathMap.set(target, path.join(workDir, target.replace(/[\\/]/g, "_")));
      return pathMap.get(target)!;
    };
    for (const testCase of cases) {
      for (const [target, source] of Object.entries(testCase.files ?? {})) {
        const local = mapPath(target);
        if (!fs.existsSync(local)) fs.copyFileSync(source, local);
      }
    }
    const mapArg = (arg: string) => {
      const eq = arg.startsWith("--") ? arg.indexOf("=") : -1;
      const value = eq > 0 ? arg.slice(eq + 1) : arg;
      if (!value.startsWith("/tmp/")) return arg;
      return eq > 0 ? `${arg.slice(0, eq)}=${mapPath(value)}` : mapPath(value);
    };
    const mapped = cases.map((testCase) => ({
      ...testCase,
      args: testCase.args.map(mapArg),
    }));

    const results: CliResult[] = new Array<CliResult>(cases.length);
    const parse = mapped
      .map((c, i) => [c, i] as const)
      .filter(([c]) => c.mode === "parse");
    const boot = mapped
      .map((c, i) => [c, i] as const)
      .filter(([c]) => c.mode === "boot");

    const shells = Math.max(1, os.cpus().length);
    const chunkSize = Math.ceil(parse.length / shells);
    const parseRuns = Array.from({ length: shells }, async (_, shell) => {
      const chunk = parse.slice(shell * chunkSize, (shell + 1) * chunkSize);
      if (chunk.length === 0) return;
      const dir = fs.mkdtempSync(path.join(workDir, "sh-"));
      const chunkResults = await runScript(
        chunk.map(([c]) => c),
        shellQuote(binary),
        dir,
      );
      chunk.forEach(([, index], k) => (results[index] = chunkResults[k]));
    });

    let next = 0;
    const bootRuns = Array.from({ length: BOOT_CONCURRENCY }, async () => {
      while (next < boot.length) {
        const [testCase, index] = boot[next++];
        results[index] = await bootLocally(binary, testCase.args);
      }
    });

    await Promise.all([...parseRuns, ...bootRuns]);
    return results;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/** Number of boot cases run concurrently inside the shell script. */
const SCRIPT_BOOT_PARALLELISM = 8;

/**
 * Generates the POSIX shell script used to run a CLI batch inside the anvil
 * image (Docker mode). Parse cases run sequentially (they exit within
 * milliseconds); boot cases run in parallel groups. Each case prints one
 * `@@CASE <index> <exit code> <first error line>` line.
 *
 * @param anvil Command used to invoke anvil (`anvil` inside the image).
 */
export function buildCliScript(
  cases: readonly CliCase[],
  anvil = "anvil",
): string {
  const lines = [
    "#!/bin/sh",
    "set +e",
    "TMP=${CLI_TMP:-/tmp}",
    // Fallback for images without coreutils/busybox `timeout`.
    'if [ -n "$CLI_NO_TIMEOUT" ] || ! command -v timeout >/dev/null 2>&1; then',
    '  timeout() { s=$1; shift; "$@" & p=$!; ( sleep "$s"; kill -9 $p 2>/dev/null ) & w=$!; wait $p; c=$?; kill $w 2>/dev/null; [ $c -eq 137 ] && return 124; return $c; }',
    "fi",
    'report() { echo "@@CASE $1 $2 $(grep -i -m1 error "$TMP/anvil-cli-err-$1" 2>/dev/null | tr -d \'\\r\')"; rm -f "$TMP/anvil-cli-err-$1"; }',
  ];
  let running = 0;
  cases.forEach((testCase, index) => {
    const args = testCase.args.map(shellQuote).join(" ");
    const err = `"$TMP/anvil-cli-err-${index}"`;
    if (testCase.mode === "parse") {
      lines.push(
        `${anvil} ${args} completions bash >/dev/null 2>${err}; report ${index} $?`,
      );
      return;
    }
    lines.push(
      `( timeout ${BOOT_WINDOW_SECONDS} ${anvil} ${args} >${err} 2>&1; report ${index} $? ) &`,
    );
    running++;
    if (running === SCRIPT_BOOT_PARALLELISM) {
      lines.push("wait");
      running = 0;
    }
  });
  lines.push("wait", 'echo "@@DONE"');
  return lines.join("\n");
}

/**
 * Parses the output of {@link buildCliScript}.
 */
export function parseCliOutput(
  output: string,
  cases: readonly CliCase[],
): CliResult[] {
  const results: CliResult[] = new Array<CliResult>(cases.length);
  for (const match of output.matchAll(/^@@CASE (\d+) (\d+) ?(.*)$/gm)) {
    const index = Number(match[1]);
    const exitCode = Number(match[2]);
    const booted = cases[index].mode === "boot" && exitCode === 124;
    results[index] = booted
      ? { booted: true, error: "" }
      : { exitCode, booted: false, error: match[3].trim() };
  }
  const missing = cases.length - results.filter(Boolean).length;
  if (missing > 0 || !output.includes("@@DONE")) {
    throw new Error(
      `CLI batch incomplete (${missing} results missing). Output tail:\n${output.slice(-2000)}`,
    );
  }
  return results;
}

async function runDockerBatch(cases: readonly CliCase[]): Promise<CliResult[]> {
  const files = new Map<string, string>();
  for (const testCase of cases) {
    for (const [target, source] of Object.entries(testCase.files ?? {})) {
      files.set(target, source);
    }
  }

  const container = await new GenericContainer(DEFAULT_ANVIL_IMAGE)
    .withEntrypoint(["/bin/sh"])
    .withCommand(["/tmp/anvil-cli-cases.sh"])
    .withCopyContentToContainer([
      {
        content: buildCliScript(cases),
        target: "/tmp/anvil-cli-cases.sh",
        mode: 0o755,
      },
    ])
    .withCopyFilesToContainer(
      [...files].map(([target, source]) => ({ source, target, mode: 0o644 })),
    )
    .withWaitStrategy(Wait.forOneShotStartup())
    .withStartupTimeout(900_000)
    .start();
  try {
    const stream = await container.logs();
    let output = "";
    await new Promise<void>((resolve, reject) => {
      stream
        .on("data", (chunk: Buffer | string) => (output += String(chunk)))
        .on("end", resolve)
        .on("error", reject);
    });
    return parseCliOutput(output, cases);
  } finally {
    await container.stop();
  }
}

/**
 * Runs a CLI batch through the Docker-mode shell script, but on the host with
 * the local binary. Used in `--no-docker` mode to verify the script that CI
 * executes inside the container.
 */
export async function runScriptBatchLocally(
  cases: readonly CliCase[],
  settings: { forceTimeoutFallback?: boolean } = {},
): Promise<CliResult[]> {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "anvil-cli-script-"));
  try {
    return await runScript(cases, shellQuote(requireAnvilBinary()), workDir, {
      CLI_NO_TIMEOUT: settings.forceTimeoutFallback ? "1" : "",
    });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Runs raw anvil invocations in the active e2e mode.
 */
export function runCliBatch(cases: readonly CliCase[]): Promise<CliResult[]> {
  return E2E_MODE === "local" ? runLocalBatch(cases) : runDockerBatch(cases);
}
