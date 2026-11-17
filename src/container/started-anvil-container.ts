import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import {
  AbstractStartedContainer,
  getContainerRuntimeClient,
  StartedTestContainer,
  StopOptions,
  StoppedTestContainer,
} from "testcontainers";
import {
  Abi,
  type Account,
  type Chain,
  getAddress,
  type Hash,
  parseEther,
  toHex,
  TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type {
  AnvilResetParameters,
  ConfirmTransactionParameters,
} from "../client/anvil-actions";
import { AnvilCheats } from "../client/cheats";
import { deriveAccountKeys, parsePrivateKeysFromBanner } from "../client/keys";
import {
  DEFAULT_POLLING_INTERVAL_MS,
  type TestClientAccountSpec,
  type TestClientConfiguration,
  TestClientOptions,
} from "../client/test-client-options";
import {
  type AnvilTestClient,
  createAnvilChain,
  createAnvilTestClient,
  DEFAULT_TEST_CLIENT_CONFIGURATION,
  toWsUrl,
} from "../client/test-client";
import type { AnvilMetadata, AnvilNodeInfo } from "../client/types";
import {
  type Duration,
  durationToSeconds,
  type Timestamp,
  timestampToSeconds,
} from "../client/units";
import { AnvilTestClientError } from "../errors";
import { FileExport } from "../flags/flag-store";
import { AnvilConfiguration } from "../options/options-view";
import { Address, AnvilAccount, HexString } from "../types";
import { loadContractAbi, loadContractBytecode } from "./artifacts";
import { readStartedContainerLogSnapshot } from "./container-logs";
import { extractSingleFile } from "./tar";

export type { AnvilTestClient } from "../client/test-client";
export type { AnvilMetadata, AnvilNodeInfo } from "../client/types";
export { deriveAccountKeys, parsePrivateKeysFromBanner };

/** `docker stop` timeout used when a state dump must be written on exit. */
export const DEFAULT_GRACEFUL_STOP_TIMEOUT_MS = 30_000;

/** Polling interval of the test client by default (alias of `DEFAULT_POLLING_INTERVAL_MS`). */
export const ANVIL_POLLING_INTERVAL_MS = DEFAULT_POLLING_INTERVAL_MS;

/** @internal */
export interface StartedAnvilContainerDetails {
  readonly rpcUrl: string;
  readonly chainId: number;
  readonly configuration: AnvilConfiguration;
  readonly artifactsDir: string;
  /** Validated test client settings (defaults when omitted). */
  readonly testClient?: TestClientConfiguration;
}

/** A snapshot that can be restored any number of times (see {@link StartedAnvilContainer.checkpoint}). */
export interface AnvilCheckpoint {
  /** Id of the current underlying `evm_snapshot`. */
  readonly id: HexString;
  /** Reverts to the checkpoint and re-arms it. */
  restore(): Promise<void>;
}

/** Who a client from {@link StartedAnvilContainer.testClientFor} acts as. */
export type TestClientAccountInput = Address | Account | { address: Address };

/**
 * A running anvil node with a pre-configured viem test client:
 *
 * - {@link testClient}: every viem test, public and wallet action plus
 *   anvil extras, bound to the node's chain (see `TestClientOptions`);
 * - {@link cheats}: fluent, awaitable chains of state manipulations;
 * - helpers for accounts, transactions, mining, time, fees, snapshots,
 *   state files and diagnostics.
 *
 * `TAccount` is the type of the configured default account (`undefined`
 * when none), which decides whether actions require an `account` argument.
 */
export class StartedAnvilContainer<
  TAccount extends Account | undefined = undefined,
> extends AbstractStartedContainer {
  private readonly details: StartedAnvilContainerDetails;
  private readonly clientConfiguration: TestClientConfiguration;
  private readonly _chain: Chain;
  private _testClient: AnvilTestClient<TAccount>;
  private readonly webSocketClients = new Set<{
    transport: { getRpcClient?: () => Promise<{ close(): void }> };
  }>();
  private stopped = false;
  private cachedAccounts?: AnvilAccount[];

  /** @internal Created by {@link AnvilContainer.start}. */
  constructor(
    startedTestContainer: StartedTestContainer,
    details: StartedAnvilContainerDetails,
  ) {
    super(startedTestContainer);
    this.details = details;
    this.clientConfiguration =
      details.testClient ?? DEFAULT_TEST_CLIENT_CONFIGURATION;
    this._chain = createAnvilChain(
      details.chainId,
      details.rpcUrl,
      this.clientConfiguration.chain,
    );
    const spec = this.clientConfiguration.account;
    this._testClient = this.buildClient(this.clientConfiguration, {
      account:
        spec?.kind === "local"
          ? spec.account
          : spec?.kind === "address"
            ? spec.address
            : undefined,
    });
  }

  /**
   * @internal Finishes startup: copies `--config-out`, impersonates and
   * resolves the configured default account. Called by `AnvilContainer.start()`.
   */
  public async initialize(): Promise<this> {
    await this.exportFiles("start");
    const spec = this.clientConfiguration.account;
    if (spec?.kind === "address" && spec.impersonate) {
      await this.impersonate(spec.address);
    }
    if (spec?.kind === "index") {
      this._testClient = this.buildClient(this.clientConfiguration, {
        account: await this.resolveAccount(spec),
      });
    }
    return this;
  }

  /** HTTP JSON-RPC URL reachable from the host. */
  public get rpcUrl(): string {
    return this.details.rpcUrl;
  }

  /** WebSocket JSON-RPC URL (same port). */
  public get wsUrl(): string {
    return toWsUrl(this.details.rpcUrl);
  }

  /** Chain id of the node (follows `setChainId()`). */
  public get chainId(): number {
    return this._chain.id;
  }

  /** viem `Chain` for this node, for building your own clients. */
  public get chain(): Chain {
    return this._chain;
  }

  /** Configuration anvil was started with. */
  public get configuration(): AnvilConfiguration {
    return this.details.configuration;
  }

  /** Test client settings in effect (see `AnvilContainer.withTestClient`). */
  public get testClientConfiguration(): TestClientConfiguration {
    return this.clientConfiguration;
  }

  /**
   * The pre-configured viem test client: all test actions (`mode: "anvil"`),
   * public and wallet actions, and {@link AnvilActions}.
   * @example await anvil.testClient.setCode({ address, bytecode })
   */
  public get testClient(): AnvilTestClient<TAccount> {
    return this._testClient;
  }

  /** Same as {@link testClient} (kept for compatibility). */
  public get client(): AnvilTestClient<TAccount> {
    return this._testClient;
  }

  /**
   * A new fluent, awaitable chain of state manipulations on {@link testClient}.
   * Each access starts a new chain; nothing runs until it is awaited.
   * @example await anvil.cheats.setBalanceEther(alice, 100).increaseTime({ days: 1 }).mine()
   */
  public get cheats(): AnvilCheats<TAccount> {
    return new AnvilCheats(this._testClient);
  }

  /**
   * A test client (same settings) acting as `account`: an address anvil
   * signs for (dev account or impersonated) or a viem `LocalAccount`.
   * @example await anvil.testClientFor(bob).writeContract({ address, abi, functionName: "approve", args })
   */
  public testClientFor(
    account: TestClientAccountInput,
  ): AnvilTestClient<Account> {
    const resolved =
      typeof account === "string" || "type" in account
        ? account
        : account.address;
    return this.buildClient<Account>(this.clientConfiguration, {
      account: resolved,
    });
  }

  /**
   * A new test client with its own settings, e.g. a WebSocket client next to
   * the default HTTP one. Validated against the node's configuration.
   * @throws AnvilTestClientConfigurationError
   */
  public async createTestClient<A extends Account | undefined = undefined>(
    options:
      | TestClientOptions<A>
      | ((options: TestClientOptions) => TestClientOptions<A>),
  ): Promise<AnvilTestClient<A>> {
    const resolved =
      typeof options === "function"
        ? options(new TestClientOptions())
        : options;
    const configuration = resolved.build(this.configuration);
    const spec = configuration.account;
    if (spec?.kind === "address" && spec.impersonate) {
      await this.impersonate(spec.address);
    }
    return this.buildClient<A>(configuration, {
      account: spec ? await this.resolveAccount(spec) : undefined,
    });
  }

  /**
   * Raw JSON-RPC request, e.g. for methods viem doesn't wrap.
   * @example await anvil.rpc("anvil_setChainId", [1])
   */
  public rpc<T = unknown>(
    method: string,
    params: readonly unknown[] = [],
  ): Promise<T> {
    return this._testClient.request({ method, params } as never);
  }

  // -------------------------------------------------------------- accounts

  /**
   * Dev account addresses (`eth_accounts`), checksummed. Always asks the
   * node (viem's `getAddresses()` returns only the local default account).
   */
  public async addresses(): Promise<Address[]> {
    const addresses = await this.rpc<Address[]>("eth_accounts");
    return addresses.map((address) => getAddress(address));
  }

  /**
   * Dev accounts with private keys: derived when the mnemonic is known,
   * otherwise parsed from anvil's startup banner (needs logs enabled).
   */
  public async accounts(): Promise<AnvilAccount[]> {
    if (this.cachedAccounts) return this.cachedAccounts;
    const addresses = await this.addresses();
    const keys = this.deriveKeys(addresses.length) ?? (await this.parseKeys());
    this.cachedAccounts = addresses.map((address, index) => ({
      index,
      address,
      privateKey: keys?.[index],
    }));
    return this.cachedAccounts;
  }

  /** Balance in wei. */
  public getBalance(address: Address): Promise<bigint> {
    return this._testClient.getBalance({ address });
  }

  /** Sets a balance in wei (`anvil_setBalance`). */
  public setBalance(address: Address, wei: bigint): Promise<void> {
    return this._testClient.setBalance({ address, value: wei });
  }

  /** Sets a balance in Ether, e.g. `"1.5"`. */
  public setBalanceEther(
    address: Address,
    ether: string | number,
  ): Promise<void> {
    return this.setBalance(address, parseEther(String(ether)));
  }

  /** Send transactions from `address` without its key (`anvil_impersonateAccount`). */
  public impersonate(address: Address): Promise<void> {
    return this._testClient.impersonateAccount({ address });
  }

  /** `anvil_stopImpersonatingAccount`. */
  public stopImpersonating(address: Address): Promise<void> {
    return this._testClient.stopImpersonatingAccount({ address });
  }

  /**
   * Runs `fn` while `address` is impersonated, with a client acting as it;
   * always stops impersonating.
   * @example await anvil.withImpersonation(whale, (c) => c.sendTransaction({ account: whale, to, value }))
   */
  public async withImpersonation<T>(
    address: Address,
    fn: (client: AnvilTestClient<TAccount>) => Promise<T>,
  ): Promise<T> {
    await this.impersonate(address);
    try {
      return await fn(this._testClient);
    } finally {
      await this.stopImpersonating(address);
    }
  }

  /** Toggles impersonation of every sender (`anvil_autoImpersonateAccount`). */
  public setAutoImpersonate(enabled: boolean): Promise<void> {
    return this._testClient.setAutoImpersonate(enabled);
  }

  // ---------------------------------------------------------- transactions

  /** Sends Ether (decimal string) and waits for the receipt; mines if automine is off. */
  public async sendEthTransaction(
    from: Address,
    to: Address,
    amountEther: string,
  ): Promise<TransactionReceipt> {
    const hash = await this._testClient.sendTransaction({
      account: from,
      to,
      value: parseEther(amountEther),
    } as never);
    return this.confirm(hash, { throwOnRevert: false });
  }

  /** Deploys a contract and waits for the receipt (`contractAddress`); mines if automine is off. */
  public async deployContract(
    abi: Abi | readonly unknown[],
    bytecode: HexString,
    account: Address,
    args: readonly unknown[] = [],
  ): Promise<TransactionReceipt> {
    const hash = await this._testClient.deployContract({
      abi: abi as Abi,
      bytecode,
      account,
      args,
    } as never);
    return this.confirm(hash, { throwOnRevert: false });
  }

  /**
   * Waits for a transaction's receipt, mining a block first when automine is
   * off; throws {@link AnvilTransactionRevertedError} (with the revert reason
   * when recoverable) unless `throwOnRevert: false`.
   * @example const receipt = await anvil.confirm(anvil.testClient.writeContract({ … }))
   */
  public async confirm(
    hash: Hash | Promise<Hash>,
    options: Omit<ConfirmTransactionParameters, "hash"> = {},
  ): Promise<TransactionReceipt> {
    return this._testClient.confirmTransaction({
      ...options,
      hash: await hash,
    });
  }

  // ------------------------------------------------------- mining and time

  /** Mines `blocks` (default 1), optionally `intervalSeconds` apart (`anvil_mine`). */
  public mine(blocks = 1, intervalSeconds?: Duration): Promise<void> {
    return this._testClient.mine({
      blocks,
      interval:
        intervalSeconds === undefined
          ? undefined
          : Number(durationToSeconds(intervalSeconds, "mine")),
    });
  }

  /** `anvil_getAutomine`. */
  public getAutomine(): Promise<boolean> {
    return this._testClient.getAutomine();
  }

  /** `evm_setAutomine`. */
  public setAutomine(enabled: boolean): Promise<void> {
    return this._testClient.setAutomine(enabled);
  }

  /** Interval mining; 0 disables it (`evm_setIntervalMining`). */
  public setIntervalMining(seconds: Duration): Promise<void> {
    return this._testClient.setIntervalMining({
      interval: Number(durationToSeconds(seconds, "setIntervalMining")),
    });
  }

  /**
   * Advances time for the next block (`evm_increaseTime`): seconds or
   * `{ days: 7 }`. Resolves to the total time offset in seconds.
   */
  public async increaseTime(duration: Duration): Promise<number> {
    const offset = await this._testClient.increaseTime({
      seconds: Number(durationToSeconds(duration, "increaseTime")),
    });
    return Number(offset);
  }

  /** Timestamp (seconds or `Date`) of the next block (`evm_setNextBlockTimestamp`). */
  public setNextBlockTimestamp(timestamp: Timestamp): Promise<void> {
    return this._testClient.setNextBlockTimestamp({
      timestamp: timestampToSeconds(timestamp, "setNextBlockTimestamp"),
    });
  }

  /** Timestamp of the latest block, in seconds. */
  public async latestTimestamp(): Promise<bigint> {
    return (await this._testClient.getBlock()).timestamp;
  }

  /** Gas price the node suggests (`eth_gasPrice`) in wei (`anvil_setMinGasPrice`; pre-London hardforks only). */
  public setMinGasPrice(wei: bigint): Promise<void> {
    return this._testClient.setMinGasPrice({ gasPrice: wei });
  }

  /** `anvil_setNextBlockBaseFeePerGas` (wei). */
  public setNextBlockBaseFeePerGas(wei: bigint): Promise<void> {
    return this._testClient.setNextBlockBaseFeePerGas({ baseFeePerGas: wei });
  }

  /** `evm_setBlockGasLimit`. */
  public setBlockGasLimit(gasLimit: bigint): Promise<void> {
    return this._testClient.setBlockGasLimit({ gasLimit });
  }

  // ----------------------------------------------------------------- state

  /** `evm_snapshot`; returns the id for {@link revert}. */
  public snapshot(): Promise<HexString> {
    return this._testClient.snapshot();
  }

  /**
   * `evm_revert`; a snapshot can be reverted to once. Throws
   * {@link AnvilTestClientError} `SNAPSHOT_NOT_FOUND` for unknown or used ids
   * (anvil only answers `false`).
   */
  public revert(id: HexString): Promise<void> {
    return this._testClient.revert({ id });
  }

  /**
   * Runs `fn` on a snapshot and always reverts — isolates tests sharing a
   * node. When `fn` throws, its error wins over a failing revert.
   */
  public async withSnapshot<T>(
    fn: (client: AnvilTestClient<TAccount>) => Promise<T>,
  ): Promise<T> {
    const id = await this.snapshot();
    let result: T;
    try {
      result = await fn(this._testClient);
    } catch (error: unknown) {
      await this.revert(id).catch(() => undefined);
      throw error;
    }
    await this.revert(id);
    return result;
  }

  /**
   * Reusable snapshot for cheap per-test isolation on one shared node:
   * `restore()` reverts and re-snapshots (a snapshot is consumed on revert).
   * Milliseconds per test instead of a container per test.
   * @example const base = await anvil.checkpoint(); afterEach(() => base.restore());
   */
  public async checkpoint(): Promise<AnvilCheckpoint> {
    let id = await this.snapshot();
    return {
      get id() {
        return id;
      },
      restore: async () => {
        await this.revert(id);
        id = await this.snapshot();
      },
    };
  }

  /**
   * `anvil_reset`: without options a non-forked node returns to genesis and
   * a forked node re-forks at its current fork block, discarding local
   * changes; `{ blockNumber }` re-forks at another block, `{ jsonRpcUrl }`
   * (re-)forks from a URL. Discards all snapshots and checkpoints.
   */
  public reset(options?: AnvilResetParameters): Promise<void> {
    return this._testClient.reset(options);
  }

  /** Full chain state as hex (`anvil_dumpState`). */
  public dumpState(): Promise<HexString> {
    return this._testClient.dumpState();
  }

  /** Writes the state as JSON (the `--load-state` format); creates parent directories. */
  public async dumpStateToFile(hostPath: string): Promise<void> {
    const target = path.resolve(hostPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, decodeStateDump(await this.dumpState()));
  }

  /** `anvil_loadState` with hex from {@link dumpState}. */
  public async loadState(state: HexString): Promise<void> {
    await this._testClient.loadState({ state });
  }

  /** Loads a JSON state file (`--dump-state`, {@link dumpStateToFile}) or raw dump hex. */
  public loadStateFromFile(hostPath: string): Promise<void> {
    const content = fs.readFileSync(path.resolve(hostPath));
    const text = content.toString("utf8").trim();
    return this.loadState(
      /^0x[0-9a-fA-F]*$/.test(text) ? (text as HexString) : toHex(content),
    );
  }

  // ------------------------------------------------------------ diagnostics

  /** `anvil_nodeInfo`. */
  public nodeInfo(): Promise<AnvilNodeInfo> {
    return this._testClient.getNodeInfo();
  }

  /** `anvil_metadata`. */
  public metadata(): Promise<AnvilMetadata> {
    return this._testClient.getMetadata();
  }

  /** `anvil_setLoggingEnabled`. */
  public setLoggingEnabled(enabled: boolean): Promise<void> {
    return this._testClient.setLoggingEnabled(enabled);
  }

  /** Container logs so far, optionally the last `tail` lines. */
  public async logText(tail?: number): Promise<string> {
    return readStartedContainerLogSnapshot(this.startedTestContainer, tail);
  }

  /** ABI from the artifacts dir (see `AnvilContainer.withArtifactsDir`). */
  public contractAbi(location: string): Abi {
    return loadContractAbi(location, this.details.artifactsDir);
  }

  /** Bytecode from the artifacts dir. */
  public contractBytecode(location: string): HexString {
    return loadContractBytecode(location, this.details.artifactsDir);
  }

  // -------------------------------------------------------------- lifecycle

  /** `true` once {@link stop} was called; the test clients then reject every request. */
  public get isStopped(): boolean {
    return this.stopped;
  }

  /**
   * Stops the container. With a host-path state dump configured, anvil gets
   * `SIGTERM` and up to `timeout` (default {@link DEFAULT_GRACEFUL_STOP_TIMEOUT_MS})
   * to write it; the file is copied to the host before removal. Test clients
   * are closed and reject later requests with `CONTAINER_STOPPED`.
   */
  public override async stop(
    options: Partial<StopOptions> = {},
  ): Promise<StoppedTestContainer> {
    const exportsOnStop = this.configuration.fileExports.filter(
      (t) => t.when === "stop",
    );
    if (exportsOnStop.length === 0) return super.stop(options);

    const stopped = await super.stop({
      timeout: DEFAULT_GRACEFUL_STOP_TIMEOUT_MS,
      ...options,
      remove: false,
    });
    try {
      for (const transfer of exportsOnStop)
        await copyFromContainer(stopped, transfer);
    } finally {
      if (options.remove ?? true)
        await this.removeStoppedContainer(
          stopped,
          options.removeVolumes ?? true,
        );
    }
    return stopped;
  }

  /** @internal Marks the clients unusable and closes WebSocket connections. */
  protected override async containerStopping(): Promise<void> {
    this.stopped = true;
    const clients = [...this.webSocketClients];
    this.webSocketClients.clear();
    await Promise.all(
      clients.map(async ({ transport }) => {
        try {
          (await transport.getRpcClient?.())?.close();
        } catch {
          // Closing a socket that never connected is best effort.
        }
      }),
    );
  }

  /** @internal Copies the container → host files due at `when`. */
  public async exportFiles(when: FileExport["when"]): Promise<void> {
    for (const transfer of this.configuration.fileExports) {
      if (transfer.when === when) await copyFromContainer(this, transfer);
    }
  }

  /** Removes a container stopped with `remove: false`; overridable for non-Docker runtimes. */
  protected async removeStoppedContainer(
    stopped: StoppedTestContainer,
    removeVolumes: boolean,
  ): Promise<void> {
    const client = await getContainerRuntimeClient();
    await client.container.remove(client.container.getById(stopped.getId()), {
      removeVolumes,
    });
  }

  private buildClient<A extends Account | undefined>(
    configuration: TestClientConfiguration,
    { account }: { account?: Account | Address },
  ): AnvilTestClient<A> {
    const client = createAnvilTestClient<A>({
      chain: this._chain,
      rpcUrl: this.details.rpcUrl,
      configuration,
      account: account as Account | undefined,
      assertUsable: () => this.assertUsable(),
      hooks: {
        onChainIdChanged: (chainId) => this.updateChainId(chainId),
        onReset: () => this.syncChainId(),
      },
    });
    if (configuration.transport === "webSocket") {
      this.webSocketClients.add(client as never);
    }
    return client;
  }

  private async resolveAccount(
    spec: TestClientAccountSpec,
  ): Promise<Account | Address> {
    if (spec.kind === "local") return spec.account;
    if (spec.kind === "address") return spec.address;
    if (spec.signing === "node") {
      const addresses = await this.addresses();
      const address = addresses[spec.index];
      if (!address) {
        throw new AnvilTestClientError(
          "ACCOUNT_UNAVAILABLE",
          `Default account ${spec.index} does not exist: the node has ${addresses.length} dev account(s).`,
        );
      }
      return address;
    }
    const key = (await this.accounts())[spec.index]?.privateKey;
    if (!key) {
      throw new AnvilTestClientError(
        "ACCOUNT_UNAVAILABLE",
        `The private key of dev account ${spec.index} is unknown (generated mnemonic and no key banner in the logs); ` +
          `use withAccount(${spec.index}) to let anvil sign instead.`,
      );
    }
    return privateKeyToAccount(key);
  }

  private assertUsable(): void {
    if (this.stopped) {
      throw new AnvilTestClientError(
        "CONTAINER_STOPPED",
        `The anvil node at ${this.details.rpcUrl} has been stopped, so its test client cannot be used anymore. ` +
          "Run requests before stop() / afterAll and await every promise in your tests.",
      );
    }
  }

  private updateChainId(chainId: number): void {
    const chain = this._chain as { id: number; name: string };
    if (chain.name === `Anvil (${chain.id})`) chain.name = `Anvil (${chainId})`;
    chain.id = chainId;
  }

  private async syncChainId(): Promise<void> {
    this.updateChainId(await this._testClient.getChainId());
  }

  private deriveKeys(count: number): HexString[] | undefined {
    const { mnemonic, derivationPath } = this.configuration;
    return mnemonic === undefined
      ? undefined
      : deriveAccountKeys(mnemonic, derivationPath, count);
  }

  private async parseKeys(): Promise<HexString[] | undefined> {
    if (this.configuration.quiet) return undefined;
    return parsePrivateKeysFromBanner(await this.logText().catch(() => ""));
  }
}

/** @internal `anvil_dumpState` hex (gzip or plain JSON) → JSON bytes for `--load-state`. */
export function decodeStateDump(state: HexString): Buffer {
  const bytes = Buffer.from(state.slice(2), "hex");
  return bytes[0] === 0x1f && bytes[1] === 0x8b
    ? zlib.gunzipSync(bytes)
    : bytes;
}

async function copyFromContainer(
  source: {
    copyArchiveFromContainer(path: string): Promise<NodeJS.ReadableStream>;
  },
  transfer: FileExport,
): Promise<void> {
  let archive: NodeJS.ReadableStream;
  try {
    archive = await source.copyArchiveFromContainer(transfer.containerPath);
  } catch (error: unknown) {
    throw new Error(
      `Could not copy ${transfer.flag} output "${transfer.containerPath}" out of the container (anvil did not write it?): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const file = await extractSingleFile(archive);
  fs.mkdirSync(path.dirname(transfer.hostPath), { recursive: true });
  fs.writeFileSync(transfer.hostPath, file.content);
}
