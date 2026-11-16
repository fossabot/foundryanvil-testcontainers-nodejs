/**
 * `--no-docker` support for the e2e suite: runs the configuration produced by
 * `AnvilOptions` against a **local anvil binary** instead of a container.
 *
 * LOCAL TESTING ONLY. CI/CD (e.g. GitHub Actions) has Docker available and
 * must use the default Docker mode, which exercises the real Testcontainers
 * lifecycle (image, entrypoint, port mapping, file copies, graceful stop).
 *
 * The runner mimics the container faithfully enough for the e2e tests to use
 * the very same `StartedAnvilContainer` API:
 *
 * - the validated command line from `AnvilContainer.prepare()` is used, with
 *   `--host` rewritten to `127.0.0.1` and `--port` to a free host port
 *   (`getMappedPort(<configured port>)` returns that host port),
 * - container file paths are mapped into a private temp directory, host input
 *   files are copied there and outputs are read back from there,
 * - readiness uses the same JSON-RPC probe and fails fast with anvil's
 *   output when the process exits,
 * - `stop()` sends SIGTERM (so `--dump-state` is written) and escalates to
 *   SIGKILL after the timeout, like `docker stop`.
 */
import { ChildProcess, spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { Readable } from "node:stream";
import {
  CommitOptions,
  ExecOptions,
  ExecResult,
  RestartOptions,
  StartedTestContainer,
  StopOptions,
  StoppedTestContainer,
} from "testcontainers";
import {
  AnvilContainer,
  AnvilOptions,
  AnvilStartupError,
  StartedAnvilContainer,
} from "../../src";
import { probeJsonRpc } from "../../src/container/wait-strategy";
import { resolveAnvilBinary as resolveBinary } from "../../scripts/anvil-binary.cjs";
import { buildTar } from "./tar";

const LOCAL_HOST = "127.0.0.1";

/**
 * Locates the anvil binary: `ANVIL_BINARY`, then the bundled
 * `@foundry-rs/anvil` devDependency, then `anvil` on the `PATH`, then
 * `~/.foundry/bin/anvil` (see `scripts/anvil-binary.cjs`).
 *
 * @returns The absolute path, or `undefined` when no binary was found.
 */
export function resolveAnvilBinary(): string | undefined {
  return resolveBinary(process.env, path.resolve(__dirname, "..", ".."))?.path;
}

/** Resolves the binary or throws an actionable error. */
export function requireAnvilBinary(): string {
  const binary = resolveAnvilBinary();
  if (!binary) {
    throw new Error(
      "--no-docker mode needs a local anvil binary. Run `pnpm install` (the @foundry-rs/anvil devDependency ships one), " +
        "install Foundry (https://getfoundry.sh: `foundryup`), or point ANVIL_BINARY at an anvil executable.",
    );
  }
  return binary;
}

/** `anvil --version` first line, e.g. `anvil Version: 1.6.0-v1.6.0-rc1`. */
export function anvilVersion(binary: string): string {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8" });
  return (result.stdout || result.stderr || "unknown").split("\n")[0].trim();
}

/** Asks the OS for a free TCP port on the loopback interface. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, LOCAL_HOST, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

const liveProcesses = new Set<ChildProcess>();
process.once("exit", () => {
  for (const child of liveProcesses) child.kill("SIGKILL");
});

/**
 * A local anvil process exposed through the `StartedTestContainer` interface.
 */
export class LocalAnvilProcess implements StartedTestContainer {
  private readonly child: ChildProcess;
  private output = "";
  private exitCode: number | null = null;
  private readonly exited: Promise<void>;
  private readonly stoppedContainer: StoppedTestContainer;

  constructor(
    public readonly binary: string,
    public readonly args: readonly string[],
    private readonly containerPort: number,
    private readonly hostPort: number,
    private readonly pathMap: ReadonlyMap<string, string>,
    public readonly workDir: string,
  ) {
    this.child = spawn(binary, [...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    liveProcesses.add(this.child);
    const append = (chunk: Buffer) => (this.output += chunk.toString());
    this.child.stdout?.on("data", append);
    this.child.stderr?.on("data", append);
    this.exited = new Promise((resolve) => {
      this.child.once("close", (code, signal) => {
        this.exitCode = code ?? (signal ? 128 : 1);
        liveProcesses.delete(this.child);
        resolve();
      });
      this.child.once("error", (error) => {
        this.output += `\n${error.message}`;
        this.exitCode = 127;
        liveProcesses.delete(this.child);
        resolve();
      });
    });
    this.stoppedContainer = {
      getId: () => this.getId(),
      copyArchiveFromContainer: (target: string) =>
        this.copyArchiveFromContainer(target),
    };
  }

  /** Full command line for error messages. */
  public get commandLine(): string {
    return [this.binary, ...this.args].join(" ");
  }

  /** Whether the process has exited. */
  public get hasExited(): boolean {
    return this.exitCode !== null;
  }

  /** Waits until anvil answers JSON-RPC, failing fast when it exits. */
  public async waitUntilReady(timeoutMs: number): Promise<void> {
    const url = `http://${LOCAL_HOST}:${this.hostPort}`;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.hasExited) {
        throw new AnvilStartupError(
          `anvil exited with code ${this.exitCode} before becoming ready.\nCommand: ${this.commandLine}\nOutput (tail):\n${this.tail(60)}`,
          { command: [this.binary, ...this.args], logs: this.tail(60) },
        );
      }
      const body = await probeJsonRpc(url, "eth_chainId", 1_000);
      if (body && body.result !== undefined) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await this.terminate(0);
    throw new AnvilStartupError(
      `anvil did not answer JSON-RPC requests within ${timeoutMs} ms.\nCommand: ${this.commandLine}\nOutput (tail):\n${this.tail(60)}`,
      { command: [this.binary, ...this.args], logs: this.tail(60) },
    );
  }

  /** SIGTERM, then SIGKILL after `timeoutMs` (0 = immediately), like `docker stop -t`. */
  public async terminate(timeoutMs: number): Promise<void> {
    if (this.hasExited) return;
    this.child.kill("SIGTERM");
    const killer = setTimeout(
      () => this.child.kill("SIGKILL"),
      Math.max(timeoutMs, 0),
    );
    await this.exited;
    clearTimeout(killer);
  }

  /** Removes the private working directory. */
  public cleanup(): void {
    fs.rmSync(this.workDir, { recursive: true, force: true });
  }

  private tail(lines: number): string {
    return this.output.trimEnd().split("\n").slice(-lines).join("\n");
  }

  // ------------------------------------------------ StartedTestContainer API

  public async stop(
    options?: Partial<StopOptions>,
  ): Promise<StoppedTestContainer> {
    await this.terminate(options?.timeout ?? 0);
    if (options?.remove ?? true) this.cleanup();
    return this.stoppedContainer;
  }

  public async restart(_options?: Partial<RestartOptions>): Promise<void> {
    return Promise.reject(
      new Error("restart() is not supported in --no-docker mode"),
    );
  }

  public commit(_options: CommitOptions): Promise<string> {
    return Promise.reject(
      new Error("commit() is not supported in --no-docker mode"),
    );
  }

  public getHost(): string {
    return LOCAL_HOST;
  }

  public getHostname(): string {
    return os.hostname();
  }

  public getFirstMappedPort(): number {
    return this.hostPort;
  }

  public getMappedPort(port: number | `${number}/${"tcp" | "udp"}`): number {
    const requested =
      typeof port === "number" ? port : Number(port.split("/")[0]);
    if (requested !== this.containerPort) {
      throw new Error(
        `No port mapping for ${port} (anvil listens on ${this.containerPort})`,
      );
    }
    return this.hostPort;
  }

  public getName(): string {
    return `local-anvil-${this.child.pid ?? "unknown"}`;
  }

  public getLabels(): Record<string, string> {
    return {};
  }

  public getId(): string {
    return `local-anvil-${this.child.pid ?? "unknown"}`;
  }

  public getNetworkNames(): string[] {
    return [];
  }

  public getNetworkId(_networkName: string): string {
    return "";
  }

  public getIpAddress(_networkName: string): string {
    return LOCAL_HOST;
  }

  public copyArchiveFromContainer(
    target: string,
  ): Promise<NodeJS.ReadableStream> {
    const local = this.pathMap.get(target) ?? target;
    if (!fs.existsSync(local)) {
      return Promise.reject(
        new Error(`no such file: ${target} (local: ${local})`),
      );
    }
    return Promise.resolve(
      Readable.from([buildTar(path.basename(target), fs.readFileSync(local))]),
    );
  }

  public copyArchiveToContainer(): Promise<void> {
    return Promise.reject(
      new Error(
        "copyArchiveToContainer() is not supported in --no-docker mode",
      ),
    );
  }

  public copyDirectoriesToContainer(): Promise<void> {
    return Promise.reject(
      new Error(
        "copyDirectoriesToContainer() is not supported in --no-docker mode",
      ),
    );
  }

  public copyFilesToContainer(): Promise<void> {
    return Promise.reject(
      new Error("copyFilesToContainer() is not supported in --no-docker mode"),
    );
  }

  public copyContentToContainer(): Promise<void> {
    return Promise.reject(
      new Error(
        "copyContentToContainer() is not supported in --no-docker mode",
      ),
    );
  }

  public exec(
    _command: string | string[],
    _opts?: Partial<ExecOptions>,
  ): Promise<ExecResult> {
    return Promise.reject(
      new Error("exec() is not supported in --no-docker mode"),
    );
  }

  public logs(opts?: { since?: number; tail?: number }): Promise<Readable> {
    const text =
      opts?.tail !== undefined ? `${this.tail(opts.tail)}\n` : this.output;
    return Promise.resolve(Readable.from([text]));
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.stop();
  }
}

/**
 * `StartedAnvilContainer` backed by a local process: removal after a graceful
 * stop deletes the private working directory instead of a Docker container.
 */
class LocalStartedAnvilContainer extends StartedAnvilContainer {
  constructor(
    private readonly local: LocalAnvilProcess,
    details: ConstructorParameters<typeof StartedAnvilContainer>[1],
  ) {
    super(local, details);
  }

  protected override removeStoppedContainer(): Promise<void> {
    this.local.cleanup();
    return Promise.resolve();
  }
}

/**
 * Rewrites the container command line for a local process.
 *
 * @internal exported for tests
 */
export function localizeArgs(
  args: readonly string[],
  hostPort: number,
  pathMap: ReadonlyMap<string, string>,
): string[] {
  const result: string[] = [];
  let sawPort = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--host") {
      result.push(arg, LOCAL_HOST);
      index++;
    } else if (arg === "--port") {
      result.push(arg, String(hostPort));
      sawPort = true;
      index++;
    } else if (pathMap.has(arg)) {
      result.push(pathMap.get(arg)!);
    } else if (arg.startsWith("--") && arg.includes("=")) {
      const [flag, ...rest] = arg.split("=");
      const value = rest.join("=");
      result.push(pathMap.has(value) ? `${flag}=${pathMap.get(value)}` : arg);
    } else {
      result.push(arg);
    }
  }
  if (!sawPort) result.push("--port", String(hostPort));
  return result;
}

/**
 * Starts anvil locally with the configuration described by `options` and
 * returns the same `StartedAnvilContainer` API the Docker mode returns.
 */
export async function startLocalAnvil(
  options: AnvilOptions,
  settings: { startupTimeoutMs?: number; artifactsDir?: string } = {},
): Promise<StartedAnvilContainer> {
  // Same validation (options + host files) as the Docker path.
  const configuration = new AnvilContainer(options).prepare();
  const binary = requireAnvilBinary();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "anvil-local-"));
  const hostPort = await freePort();

  const pathMap = new Map<string, string>();
  for (const transfer of [
    ...configuration.fileImports,
    ...configuration.fileExports,
  ]) {
    pathMap.set(
      transfer.containerPath,
      path.join(workDir, path.basename(transfer.containerPath)),
    );
  }
  for (const transfer of configuration.fileImports) {
    if (fs.existsSync(transfer.hostPath)) {
      fs.copyFileSync(transfer.hostPath, pathMap.get(transfer.containerPath)!);
    }
  }

  const args = localizeArgs(configuration.args, hostPort, pathMap);
  const local = new LocalAnvilProcess(
    binary,
    args,
    configuration.port,
    hostPort,
    pathMap,
    workDir,
  );
  try {
    await local.waitUntilReady(settings.startupTimeoutMs ?? 60_000);
    const rpcUrl = `http://${LOCAL_HOST}:${hostPort}`;
    let chainId = configuration.chainId;
    if (chainId === undefined) {
      const body = await probeJsonRpc(rpcUrl, "eth_chainId", 5_000);
      chainId =
        typeof body?.result === "string"
          ? Number.parseInt(body.result, 16)
          : 31337;
    }
    const started = new LocalStartedAnvilContainer(local, {
      rpcUrl,
      chainId,
      configuration,
      artifactsDir:
        settings.artifactsDir ??
        path.resolve(process.cwd(), "test", "artifacts"),
    });
    await started.exportFiles("start");
    return started;
  } catch (error) {
    await local.terminate(0);
    local.cleanup();
    throw error;
  }
}
