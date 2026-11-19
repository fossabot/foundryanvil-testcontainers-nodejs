/**
 * `--no-docker` runtime: runs the anvil command line that `AnvilContainer`
 * builds as a local process instead of a container.
 *
 * It plugs into the library's public extension point
 * (`AnvilContainer.startRuntime()`), so option and test-client validation,
 * chain id resolution, the pre-configured test client and error handling are
 * exactly the library's. LOCAL TESTING ONLY: CI should run the examples in
 * Docker (`npm run test:e2e`).
 */
import { ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { Readable } from "node:stream";
import {
  AnvilConfiguration,
  AnvilContainer,
  AnvilStartupError,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import type {
  StartedTestContainer,
  StopOptions,
  StoppedTestContainer,
} from "testcontainers";
import type { Account } from "viem";
import { resolveAnvilBinary } from "../../scripts/anvil-binary.cjs";

const HOST = "127.0.0.1";

/** A free TCP port on the loopback interface. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, HOST, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Rewrites the container command line for a local process: binds to the
 * loopback interface on `port` and maps container file paths to local ones.
 */
export function localizeArgs(
  args: readonly string[],
  port: number,
  files: ReadonlyMap<string, string>,
): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--host" || arg === "--port") {
      index++; // replaced below
    } else if (files.has(arg)) {
      result.push(files.get(arg)!);
    } else if (arg.startsWith("--") && arg.includes("=")) {
      const [flag, ...rest] = arg.split("=");
      const value = rest.join("=");
      result.push(files.has(value) ? `${flag}=${files.get(value)}` : arg);
    } else {
      result.push(arg);
    }
  }
  return ["--host", HOST, "--port", String(port), ...result];
}

const running = new Set<ChildProcess>();
process.once("exit", () => running.forEach((child) => child.kill("SIGKILL")));

/** A local anvil process behind the `StartedTestContainer` interface. */
class LocalAnvilProcess implements StartedTestContainer {
  private output = "";
  private exitCode: number | null = null;
  private readonly exited: Promise<void>;
  private readonly child: ChildProcess;

  constructor(
    private readonly command: readonly string[],
    private readonly containerPort: number,
    private readonly port: number,
    private readonly workDir: string,
  ) {
    this.child = spawn(command[0], command.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
    });
    running.add(this.child);
    const append = (chunk: Buffer) => (this.output += chunk.toString());
    this.child.stdout?.on("data", append);
    this.child.stderr?.on("data", append);
    this.exited = new Promise((resolve) => {
      const done = (code: number) => {
        this.exitCode = code;
        running.delete(this.child);
        resolve();
      };
      this.child.once("close", (code, signal) =>
        done(code ?? (signal ? 128 : 1)),
      );
      this.child.once("error", (error) => {
        this.output += `\n${error.message}`;
        done(127);
      });
    });
  }

  /** Waits for JSON-RPC; fails fast with anvil's output when it exits. */
  public async waitUntilReady(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.exitCode !== null) {
        throw this.startupError(
          `anvil exited with code ${this.exitCode} before becoming ready`,
        );
      }
      try {
        const response = await fetch(`http://${HOST}:${this.port}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}',
          signal: AbortSignal.timeout(1_000),
        });
        if (response.ok) return;
      } catch {
        // Not listening yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 5)); // anvil boots in ~50–150 ms
    }
    await this.stop();
    throw this.startupError(
      `anvil did not answer JSON-RPC within ${timeoutMs} ms`,
    );
  }

  public async stop(
    options?: Partial<StopOptions>,
  ): Promise<StoppedTestContainer> {
    if (this.exitCode === null) {
      this.child.kill("SIGTERM");
      const killer = setTimeout(
        () => this.child.kill("SIGKILL"),
        options?.timeout ?? 5_000,
      );
      await this.exited;
      clearTimeout(killer);
    }
    fs.rmSync(this.workDir, { recursive: true, force: true });
    return {
      getId: () => this.getId(),
      copyArchiveFromContainer: () =>
        this.unsupported("copyArchiveFromContainer"),
    };
  }

  /** Used by `StartedAnvilContainer.logText()` and anvil key banner parsing. */
  public getLogSnapshot(tail?: number): string {
    if (tail === undefined) return this.output;
    return `${this.output.trimEnd().split("\n").slice(-tail).join("\n")}\n`;
  }

  public logs(): Promise<Readable> {
    return Promise.resolve(Readable.from([this.output]));
  }

  public getHost(): string {
    return HOST;
  }

  public getMappedPort(port: number | string): number {
    const requested =
      typeof port === "number" ? port : Number(port.split("/")[0]);
    if (requested !== this.containerPort) {
      throw new Error(
        `No port mapping for ${port} (anvil listens on ${this.containerPort})`,
      );
    }
    return this.port;
  }

  public getFirstMappedPort(): number {
    return this.port;
  }

  public getId(): string {
    return `local-anvil-${this.child.pid ?? "unknown"}`;
  }

  public getName(): string {
    return this.getId();
  }

  public getHostname(): string {
    return os.hostname();
  }

  public getLabels(): Record<string, string> {
    return {};
  }

  public getNetworkNames(): string[] {
    return [];
  }

  public getNetworkId(): string {
    return "";
  }

  public getIpAddress(): string {
    return HOST;
  }

  public restart(): Promise<void> {
    return this.unsupported("restart");
  }

  public commit(): Promise<string> {
    return this.unsupported("commit");
  }

  public exec(): Promise<never> {
    return this.unsupported("exec");
  }

  public copyArchiveFromContainer(): Promise<NodeJS.ReadableStream> {
    return this.unsupported("copyArchiveFromContainer");
  }

  public copyArchiveToContainer(): Promise<void> {
    return this.unsupported("copyArchiveToContainer");
  }

  public copyFilesToContainer(): Promise<void> {
    return this.unsupported("copyFilesToContainer");
  }

  public copyDirectoriesToContainer(): Promise<void> {
    return this.unsupported("copyDirectoriesToContainer");
  }

  public copyContentToContainer(): Promise<void> {
    return this.unsupported("copyContentToContainer");
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.stop();
  }

  private unsupported(method: string): Promise<never> {
    return Promise.reject(
      new Error(`${method}() is not supported by the local anvil runtime`),
    );
  }

  private startupError(reason: string): AnvilStartupError {
    const logs = this.getLogSnapshot(40).trim();
    return new AnvilStartupError(
      `${reason}.\nCommand: ${this.command.join(" ")}\nOutput (tail):\n${logs}`,
      { command: this.command, logs },
    );
  }
}

/** Starts the configuration as a local process (files are copied to a temp dir). */
async function startLocal(
  configuration: AnvilConfiguration,
  timeoutMs: number,
): Promise<StartedTestContainer> {
  if (configuration.fileExports.length > 0) {
    const flags = configuration.fileExports
      .map((transfer) => transfer.flag)
      .join(", ");
    throw new Error(
      `${flags} (files copied out of the container) are not supported by the local anvil runtime; ` +
        "use StartedAnvilContainer.dumpStateToFile() instead, or run in Docker.",
    );
  }
  const binary = resolveAnvilBinary();
  if (!binary) {
    throw new Error(
      "No local anvil binary: run `npm install` (the @foundry-rs/anvil devDependency ships one), " +
        "install Foundry (`foundryup`) or set ANVIL_BINARY.",
    );
  }
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "anvil-example-"));
  const files = new Map<string, string>();
  for (const transfer of configuration.fileImports) {
    const local = path.join(workDir, path.basename(transfer.containerPath));
    files.set(transfer.containerPath, local);
    if (fs.existsSync(transfer.hostPath))
      fs.copyFileSync(transfer.hostPath, local);
  }
  const port = await freePort();
  const anvil = new LocalAnvilProcess(
    [binary.path, ...localizeArgs(configuration.args, port, files)],
    configuration.port,
    port,
    workDir,
  );
  await anvil.waitUntilReady(timeoutMs);
  return anvil;
}

// #region local-container
/**
 * An `AnvilContainer` that runs anvil as a local process. Same API, same
 * validation and the same started node type, without Docker.
 */
export class LocalAnvilContainer<
  TAccount extends Account | undefined = undefined,
> extends AnvilContainer<TAccount> {
  protected override startRuntime(): Promise<StartedTestContainer> {
    return startLocal(this.prepare(), this.startupTimeoutMs ?? 60_000);
  }
}
// #endregion local-container
