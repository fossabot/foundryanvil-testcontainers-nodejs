import {
  type Account,
  type Address,
  type Chain,
  type Hex,
  isAddress,
  type LocalAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AnvilTestClientConfigurationError } from "../errors";
import type { AnvilFlag } from "../flags/registry";
import type { AnvilConfiguration } from "../options/options-view";
import { deriveAccountKeys } from "./keys";

/** Transport used by the test client. */
export type TestClientTransport = "http" | "webSocket";

/** Polling interval of the test client by default (ms). */
export const DEFAULT_POLLING_INTERVAL_MS = 100;
/** Request timeout of the test client by default (ms, viem's default). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
/** Retries of failed requests by default (viem's default). */
export const DEFAULT_RETRY_COUNT = 3;
/** Base retry delay by default (ms, viem's default; exponential backoff). */
export const DEFAULT_RETRY_DELAY_MS = 150;
/** Canonical Multicall3 address (deployed on most networks, e.g. when forking). */
export const MULTICALL3_ADDRESS: Address =
  "0xcA11bde05977b3631167028862bE2a173976CA11";

/** JSON-RPC batching of the HTTP transport. */
export interface TestClientBatchOptions {
  /** Max requests per batch (viem default 1000). */
  readonly batchSize?: number;
  /** Max ms to wait for more requests (viem default 0). */
  readonly wait?: number;
}

/** Chain metadata overrides. The id and RPC URLs always come from the node. */
export interface TestClientChainOverrides {
  /** Chain name (default `Anvil (<chain id>)`). */
  readonly name?: string;
  /** Native currency (default Ether, 18 decimals). */
  readonly nativeCurrency?: Chain["nativeCurrency"];
  /** Well-known contracts, e.g. `multicall3` for `client.multicall()`. */
  readonly contracts?: Chain["contracts"];
  /** Block explorers, e.g. for links in error messages. */
  readonly blockExplorers?: Chain["blockExplorers"];
  /** Marks the chain as a testnet. */
  readonly testnet?: boolean;
}

/** Default account of the test client (hoisted into every action). */
export type TestClientAccountSpec =
  /** Dev account by index; anvil signs (`node`) or the key signs locally (`local`). */
  | {
      readonly kind: "index";
      readonly index: number;
      readonly signing: "node" | "local";
    }
  /** Any address signed by anvil; `impersonate` unlocks it at startup. */
  | {
      readonly kind: "address";
      readonly address: Address;
      readonly impersonate: boolean;
    }
  /** A viem local account (private key) that signs locally. */
  | { readonly kind: "local"; readonly account: LocalAccount };

/** Validated, frozen result of {@link TestClientOptions.build}. */
export interface TestClientConfiguration {
  /** {@link TestClientOptions.withTransport}. */
  readonly transport: TestClientTransport;
  /** {@link TestClientOptions.withPollingInterval} (ms). */
  readonly pollingInterval: number;
  /** {@link TestClientOptions.withCacheTime} (ms). */
  readonly cacheTime: number;
  /** {@link TestClientOptions.withTimeout} (ms). */
  readonly timeout: number;
  /** {@link TestClientOptions.withRetries} count. */
  readonly retryCount: number;
  /** {@link TestClientOptions.withRetries} base delay (ms). */
  readonly retryDelay: number;
  /** {@link TestClientOptions.withBatch}; `false` when off. */
  readonly batch: false | TestClientBatchOptions;
  /** {@link TestClientOptions.withAccount} / {@link TestClientOptions.withLocalAccount}. */
  readonly account?: TestClientAccountSpec;
  /** {@link TestClientOptions.withChain} overrides. */
  readonly chain: TestClientChainOverrides;
}

interface Settings {
  transport: TestClientTransport;
  pollingInterval: number;
  cacheTime: number;
  timeout: number;
  retryCount: number;
  retryDelay: number;
  batch: false | TestClientBatchOptions;
  account?: TestClientAccountSpec;
  chain: TestClientChainOverrides;
}

function show(value: unknown): string {
  if (typeof value === "bigint") return `${value}n`;
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

function integer(
  setting: string,
  value: unknown,
  label: string,
  min: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min
  ) {
    throw new AnvilTestClientConfigurationError(
      setting,
      `${label} must be an integer ≥ ${min}, received ${show(value)}`,
    );
  }
  return value;
}

function accountIndex(setting: string, value: number): number {
  return integer(setting, value, "the dev account index", 0);
}

function isLocalAccount(value: unknown): value is LocalAccount {
  const account = value as Partial<LocalAccount> | null;
  return (
    typeof account === "object" &&
    account !== null &&
    account.type === "local" &&
    typeof account.address === "string"
  );
}

/**
 * Fluent, validated configuration of the viem test client that
 * {@link StartedAnvilContainer.testClient} exposes. Setters validate
 * immediately; {@link AnvilContainer.prepare} additionally checks the
 * settings against the anvil flags before anything starts.
 *
 * The type parameter tracks whether a default account is configured, so
 * `testClient.sendTransaction({ to, value })` only compiles without an
 * explicit `account` when there is one.
 *
 * @example
 * new AnvilContainer(options).withTestClient((client) =>
 *   client.withAccount(0).withTransport("webSocket").withPollingInterval(50));
 */
export class TestClientOptions<
  TAccount extends Account | undefined = undefined,
> {
  /** Type-only marker of the default account; not present at runtime. */
  declare readonly __account: TAccount;
  private readonly settings: Settings;

  constructor() {
    this.settings = {
      transport: "http",
      pollingInterval: DEFAULT_POLLING_INTERVAL_MS,
      cacheTime: 0,
      timeout: DEFAULT_REQUEST_TIMEOUT_MS,
      retryCount: DEFAULT_RETRY_COUNT,
      retryDelay: DEFAULT_RETRY_DELAY_MS,
      batch: false,
      chain: {},
    };
  }

  /** `http` (default) or `webSocket` (needed for `eth_subscribe`-based watchers). */
  public withTransport(transport: TestClientTransport): this {
    if (transport !== "http" && transport !== "webSocket") {
      throw new AnvilTestClientConfigurationError(
        "withTransport",
        `expected "http" or "webSocket", received ${show(transport)}`,
      );
    }
    this.settings.transport = transport;
    return this;
  }

  /** Polling interval of watchers and receipt waits in ms (default 100). */
  public withPollingInterval(ms: number): this {
    this.settings.pollingInterval = integer(
      "withPollingInterval",
      ms,
      "the polling interval",
      1,
    );
    return this;
  }

  /**
   * How long viem may reuse cached results such as the block number, in ms
   * (default 0: a local node changes instantly).
   */
  public withCacheTime(ms: number): this {
    this.settings.cacheTime = integer("withCacheTime", ms, "the cache time", 0);
    return this;
  }

  /** Timeout of one JSON-RPC request in ms (default 10 000). */
  public withTimeout(ms: number): this {
    this.settings.timeout = integer("withTimeout", ms, "the timeout", 1);
    return this;
  }

  /** Retries of failed requests and the base delay in ms (defaults 3 / 150; exponential backoff). */
  public withRetries(count: number, delayMs?: number): this {
    // Validate both before applying either: setters are all-or-nothing.
    const retryCount = integer("withRetries", count, "the retry count", 0);
    const retryDelay =
      delayMs === undefined
        ? this.settings.retryDelay
        : integer("withRetries", delayMs, "the retry delay", 0);
    this.settings.retryCount = retryCount;
    this.settings.retryDelay = retryDelay;
    return this;
  }

  /** JSON-RPC batching (HTTP only): `true`, options, or `false` to disable (default). */
  public withBatch(batch: boolean | TestClientBatchOptions = true): this {
    if (typeof batch === "boolean") {
      this.settings.batch = batch ? {} : false;
      return this;
    }
    if (typeof batch !== "object" || batch === null) {
      throw new AnvilTestClientConfigurationError(
        "withBatch",
        `expected a boolean or { batchSize?, wait? }, received ${show(batch)}`,
      );
    }
    const result: { batchSize?: number; wait?: number } = {};
    if (batch.batchSize !== undefined) {
      result.batchSize = integer("withBatch", batch.batchSize, "batchSize", 1);
    }
    if (batch.wait !== undefined) {
      result.wait = integer("withBatch", batch.wait, "wait", 0);
    }
    this.settings.batch = result;
    return this;
  }

  /**
   * Default account signed **by anvil** (`eth_sendTransaction`), so actions
   * need no `account` argument.
   *
   * - `number`: dev account index (checked against `--accounts`);
   * - `Address`: any address; `{ impersonate: true }` unlocks it at startup
   *   (not needed for dev accounts or with `account.autoImpersonate()`).
   */
  public withAccount(
    account: number | Address,
    options: { impersonate?: boolean } = {},
  ): TestClientOptions<Account> {
    if (typeof account === "number") {
      this.settings.account = {
        kind: "index",
        index: accountIndex("withAccount", account),
        signing: "node",
      };
    } else if (typeof account === "string" && isAddress(account)) {
      this.settings.account = {
        kind: "address",
        address: account,
        impersonate: options.impersonate === true,
      };
    } else {
      throw new AnvilTestClientConfigurationError(
        "withAccount",
        `expected a dev account index or a 20-byte address, received ${show(account)}`,
      );
    }
    return this as unknown as TestClientOptions<Account>;
  }

  /**
   * Default account that **signs locally** (`eth_sendRawTransaction`), like
   * a real wallet: a dev account index (key derived from the mnemonic or read
   * from anvil's banner), a 32-byte private key or a viem `LocalAccount`.
   */
  public withLocalAccount(
    account: number | Hex | LocalAccount,
  ): TestClientOptions<Account> {
    if (typeof account === "number") {
      this.settings.account = {
        kind: "index",
        index: accountIndex("withLocalAccount", account),
        signing: "local",
      };
    } else if (typeof account === "string") {
      if (!/^0x[0-9a-fA-F]{64}$/.test(account)) {
        throw new AnvilTestClientConfigurationError(
          "withLocalAccount",
          `expected a 0x-prefixed 32-byte private key, received a ${account.length}-character string`,
        );
      }
      this.settings.account = {
        kind: "local",
        account: privateKeyToAccount(account),
      };
    } else if (isLocalAccount(account)) {
      this.settings.account = { kind: "local", account };
    } else {
      throw new AnvilTestClientConfigurationError(
        "withLocalAccount",
        `expected a dev account index, a private key or a viem LocalAccount, received ${show(account)}`,
      );
    }
    return this as unknown as TestClientOptions<Account>;
  }

  /** Removes the default account (the default). */
  public withoutAccount(): TestClientOptions<undefined> {
    delete this.settings.account;
    return this as unknown as TestClientOptions<undefined>;
  }

  /**
   * Chain metadata (merged with earlier calls): name, native currency,
   * contracts, block explorers. The chain id and RPC URLs always come from
   * the running node.
   */
  public withChain(overrides: TestClientChainOverrides): this {
    if (typeof overrides !== "object" || overrides === null) {
      throw new AnvilTestClientConfigurationError(
        "withChain",
        `expected an object, received ${show(overrides)}`,
      );
    }
    for (const key of ["id", "rpcUrls"]) {
      if (key in overrides) {
        throw new AnvilTestClientConfigurationError(
          "withChain",
          `"${key}" is derived from the running node and cannot be overridden` +
            (key === "id"
              ? "; set it with evm.withChainId() or testClient.setChainId()"
              : ""),
        );
      }
    }
    if (
      overrides.name !== undefined &&
      (typeof overrides.name !== "string" || overrides.name.trim() === "")
    ) {
      throw new AnvilTestClientConfigurationError(
        "withChain",
        `name must be a non-empty string, received ${show(overrides.name)}`,
      );
    }
    const { contracts, ...rest } = overrides;
    this.settings.chain = {
      ...this.settings.chain,
      ...rest,
      ...(contracts
        ? { contracts: { ...this.settings.chain.contracts, ...contracts } }
        : {}),
    };
    return this;
  }

  /**
   * Registers Multicall3 for `client.multicall()` (default: the canonical
   * address, present on forks of most networks; on a fresh node deploy it or
   * `setCode` it first).
   */
  public withMulticall3(
    address: Address = MULTICALL3_ADDRESS,
    blockCreated?: number,
  ): this {
    if (!isAddress(address)) {
      throw new AnvilTestClientConfigurationError(
        "withMulticall3",
        `expected a 20-byte address, received ${show(address)}`,
      );
    }
    return this.withChain({
      contracts: {
        multicall3: {
          address,
          ...(blockCreated === undefined
            ? {}
            : {
                blockCreated: integer(
                  "withMulticall3",
                  blockCreated,
                  "blockCreated",
                  0,
                ),
              }),
        },
      },
    });
  }

  /** Independent copy. */
  public clone(): TestClientOptions<TAccount> {
    const copy = new TestClientOptions<TAccount>();
    Object.assign(copy.settings, {
      ...this.settings,
      chain: { ...this.settings.chain },
    });
    return copy;
  }

  /**
   * Validates and freezes the settings. With the anvil `configuration`, it
   * also checks them against the flags (called by `AnvilContainer.prepare()`
   * before the container starts).
   * @throws AnvilTestClientConfigurationError
   */
  public build(configuration?: AnvilConfiguration): TestClientConfiguration {
    const { settings } = this;
    if (settings.batch !== false && settings.transport !== "http") {
      throw new AnvilTestClientConfigurationError(
        "withBatch",
        'JSON-RPC batching is only supported by the "http" transport; remove withBatch() or use withTransport("http")',
      );
    }
    if (configuration) validateAgainstAnvil(settings, configuration);
    return Object.freeze({
      ...settings,
      batch: settings.batch === false ? false : Object.freeze(settings.batch),
      chain: Object.freeze({ ...settings.chain }),
    });
  }
}

function validateAgainstAnvil(
  settings: Settings,
  configuration: AnvilConfiguration,
): void {
  const { account } = settings;
  if (!account || account.kind === "local") return;
  const setting = accountSetting(account);

  if (account.kind === "index") {
    if (account.index >= configuration.accounts) {
      throw new AnvilTestClientConfigurationError(
        setting,
        `dev account ${account.index} does not exist: anvil is configured with ${configuration.accounts} account(s) ` +
          `(account.withAccounts()); use an index from 0 to ${configuration.accounts - 1} or raise --accounts`,
        { flag: "--accounts", relatedFlags: ["--accounts"] },
      );
    }
    if (
      account.signing === "local" &&
      configuration.mnemonic === undefined &&
      configuration.quiet
    ) {
      const source: AnvilFlag =
        configuration.flags["--mnemonic-seed-unsafe"] !== undefined
          ? "--mnemonic-seed-unsafe"
          : "--mnemonic-random";
      throw new AnvilTestClientConfigurationError(
        setting,
        `cannot sign locally for dev account ${account.index}: its private key is unknown because the mnemonic ` +
          `is generated (${source}) and --quiet hides anvil's key banner. Remove logs.quiet(), use ` +
          `account.withMnemonic(), or use withAccount(${account.index}) to let anvil sign.`,
        { flag: "--quiet", relatedFlags: ["--quiet", source] },
      );
    }
    return;
  }

  // An address anvil must sign for without impersonation: it has to be a dev account.
  if (
    account.impersonate ||
    configuration.flags["--auto-impersonate"] !== undefined ||
    configuration.mnemonic === undefined
  ) {
    return;
  }
  const wanted = account.address.toLowerCase();
  const isDevAccount = deriveAccountKeys(
    configuration.mnemonic,
    configuration.derivationPath,
    configuration.accounts,
  ).some((key) => privateKeyToAccount(key).address.toLowerCase() === wanted);
  if (!isDevAccount) {
    throw new AnvilTestClientConfigurationError(
      setting,
      `anvil cannot sign for ${account.address}: it is not one of the ${configuration.accounts} dev accounts. ` +
        `Use withAccount(address, { impersonate: true }), enable account.autoImpersonate(), ` +
        `or withLocalAccount(privateKey).`,
      { relatedFlags: ["--auto-impersonate"] },
    );
  }
}

function accountSetting(account: TestClientAccountSpec): string {
  return account.kind === "index" && account.signing === "local"
    ? "withLocalAccount"
    : "withAccount";
}
