import {
  BoundPorts,
  ContainerRuntimeClient,
  getContainerRuntimeClient,
  WaitStrategy,
} from "testcontainers";
import { AnvilStartupError } from "../errors";
import { readContainerLogSnapshot } from "./container-logs";

/** Container handle passed to wait strategies. */
export type RuntimeContainer = Parameters<WaitStrategy["waitUntilReady"]>[0];

/** @internal Last `tail` log lines of a container; never throws. */
export async function tailContainerLogs(
  client: ContainerRuntimeClient,
  container: RuntimeContainer,
  tail = 60,
): Promise<string | undefined> {
  try {
    const dockerContainer = client.container.getById(container.id);
    return (await readContainerLogSnapshot(dockerContainer, tail)).trim();
  } catch {
    return undefined;
  }
}

/** @internal Parsed JSON-RPC response body, or `undefined` if not (yet) answering. */
export async function probeJsonRpc(
  url: string,
  method: string,
  timeoutMs: number,
): Promise<{ result?: unknown; error?: unknown } | undefined> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = response.ok ? await response.json() : undefined;
    return typeof body === "object" && body !== null ? body : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Ready when `eth_chainId` succeeds. Unlike log matching this works with any
 * log settings (`--quiet`, `--json`, …), and it fails immediately with
 * anvil's output if the process exits.
 */
export class AnvilReadyWaitStrategy implements WaitStrategy {
  /** Testcontainers' default startup timeout. */
  public static readonly DEFAULT_STARTUP_TIMEOUT_MS = 60_000;

  /** `eth_chainId` reported by the successful readiness probe. */
  public chainId?: number;
  private pollIntervalMs = 50;
  private requestTimeoutMs = 2_000;
  private startupTimeoutMs = AnvilReadyWaitStrategy.DEFAULT_STARTUP_TIMEOUT_MS;
  private startupTimeoutSet = false;

  /**
   * @param port Container port anvil listens on.
   * @param command Command line, for error messages.
   */
  constructor(
    private readonly port: number,
    private readonly command: readonly string[] = ["anvil"],
  ) {}

  public withStartupTimeout(startupTimeoutMs: number): this {
    this.startupTimeoutMs = startupTimeoutMs;
    this.startupTimeoutSet = true;
    return this;
  }

  public isStartupTimeoutSet(): boolean {
    return this.startupTimeoutSet;
  }

  public getStartupTimeout(): number {
    return this.startupTimeoutMs;
  }

  /** Delay between probes (default 50 ms). */
  public withPollInterval(ms: number): this {
    this.pollIntervalMs = ms;
    return this;
  }

  /** Timeout of one probe (default 2 s). */
  public withRequestTimeout(ms: number): this {
    this.requestTimeoutMs = ms;
    return this;
  }

  public async waitUntilReady(
    container: RuntimeContainer,
    boundPorts: BoundPorts,
  ): Promise<void> {
    const client = await getContainerRuntimeClient();
    const url = `http://${client.info.containerRuntime.host}:${boundPorts.getBinding(this.port)}`;
    const deadline = Date.now() + this.startupTimeoutMs;
    const command = `Command: ${this.command.join(" ")}`;

    while (Date.now() < deadline) {
      // Probe first: the success path needs no Docker API call.
      const result = (
        await probeJsonRpc(url, "eth_chainId", this.requestTimeoutMs)
      )?.result;
      if (result !== undefined) {
        const chainId =
          typeof result === "string" ? Number.parseInt(result, 16) : NaN;
        this.chainId = Number.isFinite(chainId) ? chainId : undefined;
        return;
      }
      const state = (await client.container.inspect(container)).State;
      if (state.Status === "exited" || state.Status === "dead") {
        const logs = await tailContainerLogs(client, container);
        throw new AnvilStartupError(
          `anvil exited with code ${state.ExitCode} before becoming ready.\n${command}\n${formatLogs(logs)}`,
          { command: this.command, logs },
        );
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }

    const logs = await tailContainerLogs(client, container);
    throw new AnvilStartupError(
      `anvil did not answer JSON-RPC requests on port ${this.port} within ${this.startupTimeoutMs} ms.\n${command}\n${formatLogs(logs)}`,
      { command: this.command, logs },
    );
  }
}

function formatLogs(logs: string | undefined): string {
  return logs ? `Container logs (tail):\n${logs}` : "Container logs: <none>";
}
