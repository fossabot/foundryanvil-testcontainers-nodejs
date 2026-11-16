import * as fs from "node:fs";
import * as path from "node:path";
import {
  GenericContainer,
  StartedTestContainer,
  WaitStrategy,
} from "testcontainers";
import { AnvilConfigurationError, AnvilStartupError } from "../errors";
import { AnvilOptions } from "../options/anvil-options";
import {
  ANVIL_EXECUTABLE,
  AnvilConfiguration,
  DEFAULT_CHAIN_ID,
} from "../options/options-view";
import { DEFAULT_ARTIFACTS_DIR } from "./artifacts";
import { StartedAnvilContainer } from "./started-anvil-container";
import { AnvilReadyWaitStrategy, probeJsonRpc } from "./wait-strategy";

/** Default image; any image with `anvil` on its `PATH` works. */
export const DEFAULT_ANVIL_IMAGE = "ghcr.io/foundry-rs/foundry:v1.6.0-rc1";

/**
 * Testcontainers module running anvil with an {@link AnvilOptions}
 * configuration. `start()` validates the options, copies input files, starts
 * anvil and waits for JSON-RPC. All `GenericContainer` builders remain
 * available (`withStartupTimeout`, `withNetwork`, …).
 *
 * @example
 * const anvil = await new AnvilContainer(new AnvilOptions().mining.withNoMining()).start();
 * const [alice, bob] = await anvil.addresses();
 * await anvil.sendEthTransaction(alice, bob, "1");
 * await anvil.stop();
 */
export class AnvilContainer extends GenericContainer {
  private readonly options: AnvilOptions;
  private artifactsDir = path.resolve(DEFAULT_ARTIFACTS_DIR);
  private customWaitStrategy = false;
  private readyStrategy?: AnvilReadyWaitStrategy;
  private configuration?: AnvilConfiguration;
  private readonly registeredCopies = new Set<string>();

  constructor(
    options: AnvilOptions = new AnvilOptions(),
    image: string = DEFAULT_ANVIL_IMAGE,
  ) {
    super(image);
    if (
      typeof (options as Partial<AnvilOptions> | null)?.build !== "function"
    ) {
      throw new TypeError(
        "AnvilContainer expects an AnvilOptions instance as first argument",
      );
    }
    this.options = options;
  }

  /** Options this container was created with. */
  public get anvilOptions(): AnvilOptions {
    return this.options;
  }

  /** Base directory for `contractAbi()` / `contractBytecode()` (default `<cwd>/test/artifacts`). */
  public withArtifactsDir(directory: string): this {
    if (typeof directory !== "string" || directory.trim().length === 0) {
      throw new TypeError("withArtifactsDir() requires a non-empty directory");
    }
    this.artifactsDir = path.resolve(directory);
    return this;
  }

  /** Replaces the default {@link AnvilReadyWaitStrategy} (rarely needed). */
  public override withWaitStrategy(waitStrategy: WaitStrategy): this {
    this.customWaitStrategy = true;
    return super.withWaitStrategy(waitStrategy);
  }

  /**
   * Validates the options and applies entrypoint, command, port, file copies
   * and wait strategy. Called by {@link start}; idempotent; needs no Docker.
   */
  public prepare(): AnvilConfiguration {
    const configuration = this.options.build();
    const filesToCopy = [];
    for (const transfer of configuration.fileImports) {
      const exists = fs.existsSync(transfer.hostPath);
      if (!exists && transfer.required) {
        throw new AnvilConfigurationError(
          `${transfer.flag} points to "${transfer.hostPath}" but the file does not exist on the host`,
          { flag: transfer.flag },
        );
      }
      if (exists && fs.statSync(transfer.hostPath).isDirectory()) {
        throw new AnvilConfigurationError(
          `${transfer.flag} points to "${transfer.hostPath}" which is a directory; a file is required`,
          { flag: transfer.flag },
        );
      }
      const key = `${transfer.hostPath}→${transfer.containerPath}`;
      if (exists && !this.registeredCopies.has(key)) {
        this.registeredCopies.add(key);
        // --state files are rewritten by anvil, so keep them writable for any user.
        filesToCopy.push({
          source: transfer.hostPath,
          target: transfer.containerPath,
          mode: transfer.required ? 0o644 : 0o666,
        });
      }
    }
    if (filesToCopy.length > 0) this.withCopyFilesToContainer(filesToCopy);

    this.withEntrypoint([ANVIL_EXECUTABLE]);
    this.withCommand([...configuration.args]);
    this.withExposedPorts(configuration.port);
    if (!this.customWaitStrategy) {
      this.readyStrategy = new AnvilReadyWaitStrategy(
        configuration.port,
        configuration.command,
      );
      super.withWaitStrategy(this.readyStrategy);
    }
    this.configuration = configuration;
    return configuration;
  }

  /**
   * Starts anvil and waits until it serves JSON-RPC.
   * @throws AnvilConfigurationError for invalid options.
   * @throws AnvilStartupError when anvil exits or never gets ready (includes command and logs).
   */
  public override async start(): Promise<StartedAnvilContainer> {
    const configuration = this.configuration ?? this.prepare();
    let started: StartedTestContainer;
    try {
      started = await super.start();
    } catch (error: unknown) {
      if (error instanceof AnvilStartupError) throw error;
      throw new AnvilStartupError(
        `Failed to start the anvil container: ${message(error)}\nCommand: ${configuration.command.join(" ")}`,
        { command: configuration.command, cause: error },
      );
    }
    try {
      const rpcUrl = `http://${started.getHost()}:${started.getMappedPort(configuration.port)}`;
      const anvil = new StartedAnvilContainer(started, {
        rpcUrl,
        // Reuse the readiness probe's answer instead of another round trip.
        chainId:
          configuration.chainId ??
          this.readyStrategy?.chainId ??
          (await fetchChainId(rpcUrl)),
        configuration,
        artifactsDir: this.artifactsDir,
      });
      await anvil.exportFiles("start");
      return anvil;
    } catch (error: unknown) {
      await started.stop().catch(() => undefined);
      throw new AnvilStartupError(
        `anvil started but could not be initialised: ${message(error)}`,
        {
          command: configuration.command,
          cause: error,
        },
      );
    }
  }
}

async function fetchChainId(rpcUrl: string): Promise<number> {
  const result = (await probeJsonRpc(rpcUrl, "eth_chainId", 10_000))?.result;
  const parsed = typeof result === "string" ? Number.parseInt(result, 16) : NaN;
  return Number.isFinite(parsed) ? parsed : DEFAULT_CHAIN_ID;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
