import * as fs from "node:fs";
import * as path from "node:path";
import {
  GenericContainer,
  StartedTestContainer,
  WaitStrategy,
} from "testcontainers";
import type { Account } from "viem";
import {
  type TestClientConfiguration,
  TestClientOptions,
} from "../client/test-client-options";
import {
  AnvilConfigurationError,
  AnvilStartupError,
  AnvilTestClientConfigurationError,
} from "../errors";
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
 * configuration and a pre-configured viem test client
 * ({@link withTestClient}). `start()` validates both, copies input files,
 * starts anvil and waits for JSON-RPC. All `GenericContainer` builders remain
 * available (`withStartupTimeout`, `withNetwork`, …).
 *
 * `TAccount` is the test client's default account type (see
 * {@link withTestClient}).
 *
 * @example
 * const anvil = await new AnvilContainer(new AnvilOptions().mining.withNoMining())
 *   .withTestClient((client) => client.withAccount(0))
 *   .start();
 * await anvil.confirm(anvil.testClient.sendTransaction({ to: bob, value: parseEther("1") }));
 * await anvil.stop();
 */
export class AnvilContainer<
  TAccount extends Account | undefined = undefined,
> extends GenericContainer {
  private readonly options: AnvilOptions;
  private clientOptions: TestClientOptions<TAccount> = new TestClientOptions();
  private clientConfiguration?: TestClientConfiguration;
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

  /** Test client settings this container uses. */
  public get testClientOptions(): TestClientOptions<TAccount> {
    return this.clientOptions;
  }

  /**
   * Configures the test client exposed as `StartedAnvilContainer.testClient`:
   * transport, polling, timeouts, retries, batching, default account and
   * chain metadata. Validated against the anvil options before start.
   * @example new AnvilContainer(options).withTestClient((c) => c.withAccount(0).withPollingInterval(50))
   */
  public withTestClient<A extends Account | undefined>(
    options:
      | TestClientOptions<A>
      | ((options: TestClientOptions) => TestClientOptions<A>),
  ): AnvilContainer<A> {
    const resolved =
      typeof options === "function"
        ? options(new TestClientOptions())
        : options;
    if (!(resolved instanceof TestClientOptions)) {
      throw new AnvilTestClientConfigurationError(
        "withTestClient",
        "expected TestClientOptions or a function returning them (did the callback forget to return?)",
      );
    }
    const self = this as unknown as AnvilContainer<A>;
    self.clientOptions = resolved;
    self.clientConfiguration = undefined;
    return self;
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
   * Validates the anvil and test client options and applies entrypoint,
   * command, port, file copies and wait strategy. Called by {@link start};
   * idempotent; needs no Docker.
   * @throws AnvilConfigurationError (incl. AnvilTestClientConfigurationError)
   */
  public prepare(): AnvilConfiguration {
    const configuration = this.options.build();
    this.clientConfiguration = this.clientOptions.build(configuration);
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
   * Starts the prepared container and waits for the wait strategy (Docker via
   * Testcontainers). Extension point for other runtimes, e.g. a local anvil
   * binary in tests without Docker: return any `StartedTestContainer` whose
   * `getHost()` / `getMappedPort(port)` reach anvil's JSON-RPC once it is
   * ready (run `this.prepare()` for the validated command line). Validation,
   * chain id resolution, test client setup and error handling stay the same.
   * Stop-time file exports (`--dump-state`, `--state`) additionally need
   * Docker to remove the stopped container.
   */
  protected startRuntime(): Promise<StartedTestContainer> {
    return super.start();
  }

  /**
   * Starts anvil, waits until it serves JSON-RPC and sets up the test client.
   * @throws AnvilConfigurationError for invalid options (before anything starts).
   * @throws AnvilStartupError when anvil exits or never gets ready (includes command and logs).
   */
  public override async start(): Promise<StartedAnvilContainer<TAccount>> {
    const configuration =
      this.configuration && this.clientConfiguration
        ? this.configuration
        : this.prepare();
    const testClient = this.clientConfiguration;
    let started: StartedTestContainer;
    try {
      started = await this.startRuntime();
    } catch (error: unknown) {
      if (error instanceof AnvilStartupError) throw error;
      throw new AnvilStartupError(
        `Failed to start the anvil container: ${message(error)}\nCommand: ${configuration.command.join(" ")}`,
        { command: configuration.command, cause: error },
      );
    }
    try {
      const rpcUrl = `http://${started.getHost()}:${started.getMappedPort(configuration.port)}`;
      const anvil = new StartedAnvilContainer<TAccount>(started, {
        rpcUrl,
        // Reuse the readiness probe's answer instead of another round trip.
        chainId:
          configuration.chainId ??
          this.readyStrategy?.chainId ??
          (await fetchChainId(rpcUrl)),
        configuration,
        artifactsDir: this.artifactsDir,
        testClient,
      });
      return await anvil.initialize();
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
