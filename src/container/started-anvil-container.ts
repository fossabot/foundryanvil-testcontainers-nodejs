import { pbkdf2Sync } from "node:crypto";
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
  Chain,
  createTestClient,
  defineChain,
  http,
  parseEther,
  PublicActions,
  publicActions,
  TestClient,
  toHex,
  TransactionReceipt,
  Transport,
  WalletActions,
  walletActions,
} from "viem";
import { HDKey } from "viem/accounts";
import { FileExport } from "../flags/flag-store";
import { AnvilConfiguration } from "../options/options-view";
import { Address, AnvilAccount, HexString } from "../types";
import { loadContractAbi, loadContractBytecode } from "./artifacts";
import { readStartedContainerLogSnapshot } from "./container-logs";
import { extractSingleFile } from "./tar";

/** `docker stop` timeout used when a state dump must be written on exit. */
export const DEFAULT_GRACEFUL_STOP_TIMEOUT_MS = 30_000;

/** Polling interval of the viem client. */
export const ANVIL_POLLING_INTERVAL_MS = 100;

/** viem test client (`anvil` mode) with public and wallet actions. */
export type AnvilTestClient = TestClient<"anvil", Transport, Chain, undefined> &
  PublicActions<Transport, Chain, undefined> &
  WalletActions<Chain, undefined>;

/**
 * @internal Client tuned for a local node: no response caching (viem caches
 * e.g. the block number for 4 s by default) and fast polling.
 */
function createAnvilClient(chain: Chain, rpcUrl: string): AnvilTestClient {
  return createTestClient({
    chain,
    mode: "anvil",
    transport: http(rpcUrl),
    cacheTime: 0,
    pollingInterval: ANVIL_POLLING_INTERVAL_MS,
  })
    .extend(publicActions)
    .extend(walletActions);
}

/** @internal */
export interface StartedAnvilContainerDetails {
  readonly rpcUrl: string;
  readonly chainId: number;
  readonly configuration: AnvilConfiguration;
  readonly artifactsDir: string;
}

/** `anvil_nodeInfo` result. */
export interface AnvilNodeInfo {
  currentBlockNumber: HexString;
  currentBlockTimestamp: number;
  currentBlockHash: HexString;
  hardFork: string;
  transactionOrder: string;
  environment: {
    baseFee: HexString;
    chainId: HexString;
    gasLimit: HexString;
    gasPrice: HexString;
  };
  forkConfig: {
    forkUrl?: string;
    forkBlockNumber?: number;
    forkRetryBackoff?: number;
  };
  [key: string]: unknown;
}

/** `anvil_metadata` result. */
export interface AnvilMetadata {
  clientVersion: string;
  chainId: number;
  instanceId: HexString;
  latestBlockNumber: number;
  latestBlockHash: HexString;
  forkedNetwork?: {
    chainId: number;
    forkBlockNumber: number;
    forkBlockHash: HexString;
  };
  snapshots: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * A running anvil node: a chain-aware viem {@link client} plus helpers for
 * accounts, mining, time, fees, state and diagnostics. Anything else is
 * reachable through `client` or {@link rpc}.
 */
export class StartedAnvilContainer extends AbstractStartedContainer {
  private readonly details: StartedAnvilContainerDetails;
  private readonly _chain: Chain;
  private readonly _client: AnvilTestClient;
  private cachedAccounts?: AnvilAccount[];

  /** @internal Created by {@link AnvilContainer.start}. */
  constructor(
    startedTestContainer: StartedTestContainer,
    details: StartedAnvilContainerDetails,
  ) {
    super(startedTestContainer);
    this.details = details;
    const { rpcUrl, chainId } = details;
    this._chain = defineChain({
      id: chainId,
      name: `Anvil (${chainId})`,
      nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
      rpcUrls: { default: { http: [rpcUrl], webSocket: [toWsUrl(rpcUrl)] } },
    });
    this._client = createAnvilClient(this._chain, rpcUrl);
  }

  /** HTTP JSON-RPC URL reachable from the host. */
  public get rpcUrl(): string {
    return this.details.rpcUrl;
  }

  /** WebSocket JSON-RPC URL (same port). */
  public get wsUrl(): string {
    return toWsUrl(this.details.rpcUrl);
  }

  /** Chain id reported by the node. */
  public get chainId(): number {
    return this.details.chainId;
  }

  /** viem `Chain` for this node, for building your own clients. */
  public get chain(): Chain {
    return this._chain;
  }

  /** Configuration anvil was started with. */
  public get configuration(): AnvilConfiguration {
    return this.details.configuration;
  }

  /** viem client bound to the node's actual chain id. */
  public get client(): AnvilTestClient {
    return this._client;
  }

  /**
   * Raw JSON-RPC request, e.g. for `anvil_*` methods viem doesn't wrap.
   * @example await anvil.rpc("anvil_setChainId", [1])
   */
  public rpc<T = unknown>(
    method: string,
    params: readonly unknown[] = [],
  ): Promise<T> {
    return this._client.request({ method, params } as never);
  }

  // -------------------------------------------------------------- accounts

  /** Dev account addresses (`eth_accounts`). */
  public addresses(): Promise<Address[]> {
    return this._client.getAddresses();
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
    return this._client.getBalance({ address });
  }

  /** Sets a balance in wei (`anvil_setBalance`). */
  public setBalance(address: Address, wei: bigint): Promise<void> {
    return this._client.setBalance({ address, value: wei });
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
    return this._client.impersonateAccount({ address });
  }

  /** `anvil_stopImpersonatingAccount`. */
  public stopImpersonating(address: Address): Promise<void> {
    return this._client.stopImpersonatingAccount({ address });
  }

  /**
   * Runs `fn` while `address` is impersonated; always stops impersonating.
   * @example await anvil.withImpersonation(whale, (c) => c.sendTransaction({ account: whale, to, value }))
   */
  public async withImpersonation<T>(
    address: Address,
    fn: (client: AnvilTestClient) => Promise<T>,
  ): Promise<T> {
    await this.impersonate(address);
    try {
      return await fn(this._client);
    } finally {
      await this.stopImpersonating(address);
    }
  }

  /** Toggles impersonation of every sender (`anvil_autoImpersonateAccount`). */
  public setAutoImpersonate(enabled: boolean): Promise<void> {
    return this.rpc<void>("anvil_autoImpersonateAccount", [enabled]);
  }

  // ---------------------------------------------------------- transactions

  /** Sends Ether (decimal string) and waits for the receipt; mines if automine is off. */
  public async sendEthTransaction(
    from: Address,
    to: Address,
    amountEther: string,
  ): Promise<TransactionReceipt> {
    const hash = await this._client.sendTransaction({
      account: from,
      to,
      value: parseEther(amountEther),
    });
    await this.mineIfNeeded();
    return this._client.waitForTransactionReceipt({ hash });
  }

  /** Deploys a contract and waits for the receipt (`contractAddress`); mines if automine is off. */
  public async deployContract(
    abi: Abi | readonly unknown[],
    bytecode: HexString,
    account: Address,
    args: readonly unknown[] = [],
  ): Promise<TransactionReceipt> {
    const hash = await this._client.deployContract({
      abi: abi as Abi,
      bytecode,
      account,
      args,
    });
    await this.mineIfNeeded();
    return this._client.waitForTransactionReceipt({ hash });
  }

  // ------------------------------------------------------- mining and time

  /** Mines `blocks` (default 1), optionally `intervalSeconds` apart (`anvil_mine`). */
  public mine(blocks = 1, intervalSeconds?: number): Promise<void> {
    return this._client.mine({ blocks, interval: intervalSeconds });
  }

  /** `anvil_getAutomine`. */
  public getAutomine(): Promise<boolean> {
    return this._client.getAutomine();
  }

  /** `evm_setAutomine`. */
  public setAutomine(enabled: boolean): Promise<void> {
    return this._client.setAutomine(enabled);
  }

  /** Interval mining; 0 disables it (`evm_setIntervalMining`). */
  public setIntervalMining(seconds: number): Promise<void> {
    return this._client.setIntervalMining({ interval: seconds });
  }

  /** Advances time for the next block (`evm_increaseTime`). */
  public increaseTime(seconds: number): Promise<unknown> {
    return this._client.increaseTime({ seconds });
  }

  /** Timestamp (seconds or `Date`) of the next block (`evm_setNextBlockTimestamp`). */
  public setNextBlockTimestamp(
    timestamp: number | bigint | Date,
  ): Promise<void> {
    const seconds =
      timestamp instanceof Date
        ? BigInt(Math.floor(timestamp.getTime() / 1000))
        : BigInt(timestamp);
    return this._client.setNextBlockTimestamp({ timestamp: seconds });
  }

  /** `anvil_setMinGasPrice` (wei). */
  public setMinGasPrice(wei: bigint): Promise<void> {
    return this._client.setMinGasPrice({ gasPrice: wei });
  }

  /** `anvil_setNextBlockBaseFeePerGas` (wei). */
  public setNextBlockBaseFeePerGas(wei: bigint): Promise<void> {
    return this._client.setNextBlockBaseFeePerGas({ baseFeePerGas: wei });
  }

  /** `evm_setBlockGasLimit`. */
  public setBlockGasLimit(gasLimit: bigint): Promise<void> {
    return this._client.setBlockGasLimit({ gasLimit });
  }

  // ----------------------------------------------------------------- state

  /** `evm_snapshot`; returns the id for {@link revert}. */
  public snapshot(): Promise<HexString> {
    return this._client.snapshot();
  }

  /** `evm_revert`; a snapshot can be reverted to once. */
  public revert(id: HexString): Promise<void> {
    return this._client.revert({ id });
  }

  /** Runs `fn` on a snapshot and always reverts — isolates tests sharing a node. */
  public async withSnapshot<T>(
    fn: (client: AnvilTestClient) => Promise<T>,
  ): Promise<T> {
    const id = await this.snapshot();
    try {
      return await fn(this._client);
    } finally {
      await this.revert(id);
    }
  }

  /**
   * Reusable snapshot for cheap per-test isolation on one shared node:
   * `restore()` reverts and re-snapshots (a snapshot is consumed on revert).
   * Milliseconds per test instead of a container per test.
   * @example const base = await anvil.checkpoint(); afterEach(() => base.restore());
   */
  public async checkpoint(): Promise<{ restore(): Promise<void> }> {
    let id = await this.snapshot();
    return {
      restore: async () => {
        await this.revert(id);
        id = await this.snapshot();
      },
    };
  }

  /** Full chain state as hex (`anvil_dumpState`). */
  public dumpState(): Promise<HexString> {
    return this._client.dumpState();
  }

  /** Writes the state as JSON (the `--load-state` format); creates parent directories. */
  public async dumpStateToFile(hostPath: string): Promise<void> {
    const target = path.resolve(hostPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, decodeStateDump(await this.dumpState()));
  }

  /** `anvil_loadState` with hex from {@link dumpState}. */
  public loadState(state: HexString): Promise<void> {
    return this._client.loadState({ state });
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
    return this.rpc<AnvilNodeInfo>("anvil_nodeInfo");
  }

  /** `anvil_metadata`. */
  public metadata(): Promise<AnvilMetadata> {
    return this.rpc<AnvilMetadata>("anvil_metadata");
  }

  /** `anvil_setLoggingEnabled`. */
  public setLoggingEnabled(enabled: boolean): Promise<void> {
    return this._client.setLoggingEnabled(enabled);
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

  /**
   * Stops the container. With a host-path state dump configured, anvil gets
   * `SIGTERM` and up to `timeout` (default {@link DEFAULT_GRACEFUL_STOP_TIMEOUT_MS})
   * to write it; the file is copied to the host before removal.
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

  private async mineIfNeeded(): Promise<void> {
    if (!(await this.getAutomine().catch(() => true))) await this.mine(1);
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

/**
 * @internal Keys of anvil's dev accounts (`${derivationPath}${index}`). The
 * BIP-39 seed is computed once with native PBKDF2 and the parent node derived
 * once – ~40× faster than per-account `mnemonicToAccount`.
 */
export function deriveAccountKeys(
  mnemonic: string,
  derivationPath: string,
  count: number,
): HexString[] {
  const seed = pbkdf2Sync(
    mnemonic.normalize("NFKD"),
    "mnemonic",
    2048,
    64,
    "sha512",
  );
  const master = HDKey.fromMasterSeed(seed);
  const parent = derivationPath.endsWith("/")
    ? master.derive(derivationPath.slice(0, -1))
    : undefined;
  return Array.from({ length: count }, (_, index) =>
    toHex(
      (parent
        ? parent.deriveChild(index)
        : master.derive(`${derivationPath}${index}`)
      ).privateKey!,
    ),
  );
}

/** @internal Private keys from anvil's "Private Keys" banner, in index order. */
export function parsePrivateKeysFromBanner(
  text: string,
): HexString[] | undefined {
  const start = text.indexOf("Private Keys");
  if (start === -1) return undefined;
  const keys: HexString[] = [];
  for (const [, index, key] of text
    .slice(start)
    .matchAll(/\((\d+)\)\s+(0x[0-9a-fA-F]{64})/g)) {
    if (Number(index) !== keys.length) break;
    keys.push(key as HexString);
  }
  return keys.length > 0 ? keys : undefined;
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

function toWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, "ws");
}
