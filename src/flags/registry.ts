/**
 * Registry of every anvil CLI flag: value kind, aliases, conflicts and
 * requirements. Single source of truth for the fluent API, the renderer, the
 * validator and the tests (which verify it against the real anvil parser).
 *
 * @packageDocumentation
 */

/** Help section in `anvil --help`. */
export type FlagCategory =
  | "General"
  | "Display options"
  | "Server options"
  | "Fork config"
  | "Environment config"
  | "EVM options"
  | "Networks";

/**
 * Rendering style: `boolean` (`--no-mining`), `value` (`--accounts 10`),
 * `optional-value` (`--ipc[=path]`), `multi-value` (repeatable) or `count` (`-vvv`).
 */
export type FlagValueKind =
  "boolean" | "value" | "optional-value" | "multi-value" | "count";

/** Canonical (long-form) anvil flag. */
export type AnvilFlag =
  | "--accounts"
  | "--block-time"
  | "--balance"
  | "--config-out"
  | "--derivation-path"
  | "--dump-state"
  | "--hardfork"
  | "--init"
  | "--ipc"
  | "--threads"
  | "--load-state"
  | "--mnemonic"
  | "--max-persisted-states"
  | "--mixed-mining"
  | "--mnemonic-random"
  | "--mnemonic-seed-unsafe"
  | "--no-mining"
  | "--number"
  | "--order"
  | "--port"
  | "--preserve-historical-states"
  | "--prune-history"
  | "--state-interval"
  | "--slots-in-an-epoch"
  | "--state"
  | "--timestamp"
  | "--transaction-block-keeper"
  | "--color"
  | "--json"
  | "--md"
  | "--quiet"
  | "--verbosity"
  | "--allow-origin"
  | "--cache-path"
  | "--host"
  | "--no-cors"
  | "--no-request-size-limit"
  | "--compute-units-per-second"
  | "--fork-url"
  | "--fork-block-number"
  | "--fork-chain-id"
  | "--fork-header"
  | "--fork-retry-backoff"
  | "--fork-transaction-hash"
  | "--no-rate-limit"
  | "--no-storage-caching"
  | "--retries"
  | "--timeout"
  | "--block-base-fee-per-gas"
  | "--chain-id"
  | "--code-size-limit"
  | "--disable-block-gas-limit"
  | "--disable-code-size-limit"
  | "--disable-min-priority-fee"
  | "--gas-limit"
  | "--gas-price"
  | "--auto-impersonate"
  | "--disable-console-log"
  | "--disable-default-create2-deployer"
  | "--disable-pool-balance-checks"
  | "--memory-limit"
  | "--print-traces"
  | "--steps-tracing"
  | "--celo"
  | "--optimism";

/** Metadata of one anvil flag. */
export interface FlagSpec {
  /** Canonical long form, e.g. `--accounts`. */
  readonly flag: AnvilFlag;
  /** Short forms / aliases accepted by anvil (never rendered). */
  readonly aliases: readonly string[];
  readonly category: FlagCategory;
  readonly kind: FlagValueKind;
  /** Mutually exclusive flags (symmetric). */
  readonly conflicts: readonly AnvilFlag[];
  /** Flags that must also be set. */
  readonly requires: readonly AnvilFlag[];
  /** At least one of these must also be set. */
  readonly requiresAnyOf: readonly AnvilFlag[];
  /** One-line description from `anvil --help`. */
  readonly description: string;
  /** Fluent methods setting the flag, e.g. `account.withAccounts()`. */
  readonly methods: readonly string[];
  /** Why the library enforces more than anvil's parser for this flag, if it does. */
  readonly stricterThanAnvil?: string;
  /** Owned by the container (`--host`, always `0.0.0.0`); not configurable. */
  readonly managed: boolean;
}

type Optional =
  | "aliases"
  | "conflicts"
  | "requires"
  | "requiresAnyOf"
  | "managed"
  | "stricterThanAnvil";
type FlagSpecInput = Omit<FlagSpec, Optional> &
  Partial<Pick<FlagSpec, Optional>>;

const RAW_SPECS: readonly FlagSpecInput[] = [
  // ---------------------------------------------------------------- General
  {
    flag: "--accounts",
    aliases: ["-a"],
    category: "General",
    kind: "value",
    description: "Number of dev accounts to generate and configure.",
    methods: ["account.withAccounts()"],
  },
  {
    flag: "--block-time",
    aliases: ["-b", "--blockTime"],
    category: "General",
    kind: "value",
    conflicts: ["--no-mining"],
    description: "Block time in seconds for interval mining.",
    methods: ["mining.withBlockTime()", "mining.withMixedMining()"],
  },
  {
    flag: "--balance",
    category: "General",
    kind: "value",
    description: "The balance of every dev account in Ether.",
    methods: ["account.withBalance()"],
  },
  {
    flag: "--config-out",
    category: "General",
    kind: "value",
    description: "Writes output of `anvil` as json to user-specified file.",
    methods: ["state.withConfigOut()"],
  },
  {
    flag: "--derivation-path",
    category: "General",
    kind: "value",
    description: "Sets the derivation path of the child key to be derived.",
    methods: ["account.withDerivationPath()"],
  },
  {
    flag: "--dump-state",
    category: "General",
    kind: "value",
    conflicts: ["--init", "--state"],
    description:
      "Dump the state and block environment of chain on exit to the given file.",
    methods: ["state.withDumpState()"],
  },
  {
    flag: "--hardfork",
    category: "General",
    kind: "value",
    description: "The EVM hardfork to use.",
    methods: ["evm.withHardfork()"],
  },
  {
    flag: "--init",
    category: "General",
    kind: "value",
    conflicts: [
      "--state",
      "--dump-state",
      "--load-state",
      "--preserve-historical-states",
    ],
    description:
      "Initialize the genesis block with the given `genesis.json` file.",
    methods: ["state.withInit()"],
  },
  {
    flag: "--ipc",
    aliases: ["--ipcpath"],
    category: "General",
    kind: "optional-value",
    description:
      "Launch an ipc server at the given path or default path = `/tmp/anvil.ipc`.",
    methods: ["server.withIpc()"],
  },
  {
    flag: "--threads",
    aliases: ["-j", "--jobs"],
    category: "General",
    kind: "value",
    description:
      "Number of threads to use. Specifying 0 defaults to the number of logical cores.",
    methods: ["server.withThreads()"],
  },
  {
    flag: "--load-state",
    category: "General",
    kind: "value",
    conflicts: ["--init", "--state"],
    description: "Initialize the chain from a previously saved state snapshot.",
    methods: ["state.withLoadState()"],
  },
  {
    flag: "--mnemonic",
    aliases: ["-m"],
    category: "General",
    kind: "value",
    conflicts: ["--mnemonic-random", "--mnemonic-seed-unsafe"],
    description: "BIP39 mnemonic phrase used for generating accounts.",
    methods: ["account.withMnemonic()"],
  },
  {
    flag: "--max-persisted-states",
    category: "General",
    kind: "value",
    conflicts: ["--prune-history"],
    description: "Max number of states to persist on disk.",
    methods: ["state.withMaxPersistedStates()"],
  },
  {
    flag: "--mixed-mining",
    category: "General",
    kind: "boolean",
    requires: ["--block-time"],
    stricterThanAnvil:
      "anvil's parser skips this requirement when --no-mining is present; mixed mining without a block time is meaningless, so --block-time is always required.",
    description:
      "Enable mixed mining (interval mining plus on-demand/automine).",
    methods: ["mining.withMixedMining()"],
  },
  {
    flag: "--mnemonic-random",
    category: "General",
    kind: "optional-value",
    conflicts: ["--mnemonic", "--mnemonic-seed-unsafe"],
    description:
      "Automatically generates a BIP39 mnemonic phrase, and derives accounts from it.",
    methods: ["account.withRandomMnemonic()"],
  },
  {
    flag: "--mnemonic-seed-unsafe",
    category: "General",
    kind: "value",
    conflicts: ["--mnemonic", "--mnemonic-random"],
    description: "Generates a BIP39 mnemonic phrase from a given seed.",
    methods: ["account.withMnemonicSeedUnsafe()"],
  },
  {
    flag: "--no-mining",
    aliases: ["--no-mine"],
    category: "General",
    kind: "boolean",
    conflicts: ["--block-time"],
    description:
      "Disable auto and interval mining, and mine on demand instead.",
    methods: ["mining.withNoMining()"],
  },
  {
    flag: "--number",
    category: "General",
    kind: "value",
    description: "The number of the genesis block.",
    methods: ["mining.withBlockNumber()"],
  },
  {
    flag: "--order",
    category: "General",
    kind: "value",
    description: "How transactions are sorted in the mempool.",
    methods: ["state.withOrder()"],
  },
  {
    flag: "--port",
    aliases: ["-p"],
    category: "General",
    kind: "value",
    description: "Port number to listen on.",
    methods: ["server.withPort()"],
  },
  {
    flag: "--preserve-historical-states",
    category: "General",
    kind: "boolean",
    conflicts: ["--init"],
    requiresAnyOf: ["--dump-state", "--state"],
    stricterThanAnvil:
      "anvil accepts the flag without a dump target, where it has no effect.",
    description: "Preserve historical state snapshots when dumping the state.",
    methods: ["state.withPreserveHistoricalStates()"],
  },
  {
    flag: "--prune-history",
    category: "General",
    kind: "optional-value",
    conflicts: ["--max-persisted-states"],
    description:
      "Don't keep full chain history. If a number argument is specified, at most this number of states is kept in memory.",
    methods: ["state.withPruneHistory()"],
  },
  {
    flag: "--state-interval",
    aliases: ["-s"],
    category: "General",
    kind: "value",
    requiresAnyOf: ["--dump-state", "--state"],
    stricterThanAnvil:
      "anvil accepts the flag without a dump target, where it has no effect.",
    description:
      "Interval in seconds at which the state and block environment is to be dumped to disk.",
    methods: ["state.withStateInterval()"],
  },
  {
    flag: "--slots-in-an-epoch",
    category: "General",
    kind: "value",
    description: "Slots in an epoch.",
    methods: ["mining.withSlotsInAnEpoch()"],
  },
  {
    flag: "--state",
    category: "General",
    kind: "value",
    conflicts: ["--init", "--dump-state", "--load-state"],
    description: "This is an alias for both --load-state and --dump-state.",
    methods: ["state.withState()"],
  },
  {
    flag: "--timestamp",
    category: "General",
    kind: "value",
    description: "The timestamp of the genesis block.",
    methods: ["state.withTimestamp()"],
  },
  {
    flag: "--transaction-block-keeper",
    category: "General",
    kind: "value",
    description: "Number of blocks with transactions to keep in memory.",
    methods: ["state.withTransactionBlockKeeper()"],
  },
  // --------------------------------------------------------- Display options
  {
    flag: "--color",
    category: "Display options",
    kind: "value",
    conflicts: ["--json"],
    description: "The color of the log messages.",
    methods: ["logs.withColor()"],
  },
  {
    flag: "--json",
    category: "Display options",
    kind: "boolean",
    conflicts: ["--quiet", "--color", "--md"],
    description: "Format log messages as JSON.",
    methods: ["logs.jsonLogFormat()"],
  },
  {
    flag: "--md",
    category: "Display options",
    kind: "boolean",
    conflicts: ["--json"],
    description: "Format log messages as Markdown.",
    methods: ["logs.withMarkdownFormat()"],
  },
  {
    flag: "--quiet",
    aliases: ["-q"],
    category: "Display options",
    kind: "boolean",
    conflicts: ["--verbosity", "--json"],
    description: "Do not print log messages.",
    methods: ["logs.quiet()"],
  },
  {
    flag: "--verbosity",
    aliases: ["-v"],
    category: "Display options",
    kind: "count",
    conflicts: ["--quiet"],
    description: "Verbosity level of the log messages.",
    methods: ["logs.verboseLogs()"],
  },
  // ---------------------------------------------------------- Server options
  {
    flag: "--allow-origin",
    category: "Server options",
    kind: "value",
    conflicts: ["--no-cors"],
    description: "The cors `allow_origin` header.",
    methods: ["server.withAllowOrigin()"],
  },
  {
    flag: "--cache-path",
    category: "Server options",
    kind: "value",
    description:
      "Path to the cache directory where persisted states are stored.",
    methods: ["server.withCachePath()"],
  },
  {
    flag: "--host",
    category: "Server options",
    kind: "value",
    description: "The hosts the server will listen on.",
    methods: [],
    managed: true,
  },
  {
    flag: "--no-cors",
    category: "Server options",
    kind: "boolean",
    conflicts: ["--allow-origin"],
    description: "Disable CORS.",
    methods: ["server.noCors()"],
  },
  {
    flag: "--no-request-size-limit",
    category: "Server options",
    kind: "boolean",
    description: "Disable the default request body size limit.",
    methods: ["server.noRequestSizeLimit()"],
  },
  // -------------------------------------------------------------- Fork config
  {
    flag: "--compute-units-per-second",
    aliases: ["--cups"],
    category: "Fork config",
    kind: "value",
    requires: ["--fork-url"],
    description:
      "Sets the number of assumed available compute units per second for this provider.",
    methods: ["fork.withComputeUnitsPerSecond()"],
  },
  {
    flag: "--fork-url",
    aliases: ["-f", "--rpc-url"],
    category: "Fork config",
    kind: "value",
    description:
      "Fetch state over a remote endpoint instead of starting from an empty state.",
    methods: ["fork.withForkUrl()"],
  },
  {
    flag: "--fork-block-number",
    category: "Fork config",
    kind: "value",
    requires: ["--fork-url"],
    conflicts: ["--fork-transaction-hash"],
    description:
      "Fetch state from a specific block number over a remote endpoint.",
    methods: ["fork.withForkBlockNumber()", "fork.withForkUrl()"],
  },
  {
    flag: "--fork-chain-id",
    category: "Fork config",
    kind: "value",
    requires: ["--fork-url"],
    requiresAnyOf: ["--fork-block-number", "--fork-transaction-hash"],
    description:
      "Specify chain id to skip fetching it from remote endpoint (offline-start mode).",
    methods: ["fork.withForkChainId()"],
  },
  {
    flag: "--fork-header",
    category: "Fork config",
    kind: "multi-value",
    requires: ["--fork-url"],
    description:
      'Headers to use for the rpc client, e.g. "User-Agent: test-agent".',
    methods: ["fork.withForkHeader()", "fork.withForkHeaders()"],
  },
  {
    flag: "--fork-retry-backoff",
    category: "Fork config",
    kind: "value",
    requires: ["--fork-url"],
    description: "Initial retry backoff on encountering errors.",
    methods: ["fork.withForkRetryBackoff()"],
  },
  {
    flag: "--fork-transaction-hash",
    category: "Fork config",
    kind: "value",
    requires: ["--fork-url"],
    conflicts: ["--fork-block-number"],
    description:
      "Fetch state from after a specific transaction hash has been applied over a remote endpoint.",
    methods: ["fork.withForkTransactionHash()"],
  },
  {
    flag: "--no-rate-limit",
    aliases: ["--no-rpc-rate-limit"],
    category: "Fork config",
    kind: "boolean",
    requires: ["--fork-url"],
    description: "Disables rate limiting for this node's provider.",
    methods: ["fork.noRateLimit()"],
  },
  {
    flag: "--no-storage-caching",
    category: "Fork config",
    kind: "boolean",
    requires: ["--fork-url"],
    description: "Explicitly disables the use of RPC caching.",
    methods: ["fork.noStorageCaching()"],
  },
  {
    flag: "--retries",
    category: "Fork config",
    kind: "value",
    requires: ["--fork-url"],
    description:
      "Number of retry requests for spurious networks (timed out requests).",
    methods: ["fork.withRetries()"],
  },
  {
    flag: "--timeout",
    category: "Fork config",
    kind: "value",
    requires: ["--fork-url"],
    description:
      "Timeout in ms for requests sent to remote JSON-RPC server in forking mode.",
    methods: ["fork.withTimeout()"],
  },
  // ------------------------------------------------------- Environment config
  {
    flag: "--block-base-fee-per-gas",
    aliases: ["--base-fee"],
    category: "Environment config",
    kind: "value",
    description: "The base fee in a block.",
    methods: ["evm.withBlockBaseFeePerGas()"],
  },
  {
    flag: "--chain-id",
    aliases: ["--chain"],
    category: "Environment config",
    kind: "value",
    description: "The chain ID.",
    methods: ["evm.withChainId()"],
  },
  {
    flag: "--code-size-limit",
    category: "Environment config",
    kind: "value",
    conflicts: ["--disable-code-size-limit"],
    description: "EIP-170: Contract code size limit in bytes.",
    methods: ["evm.withCodeSizeLimit()"],
  },
  {
    flag: "--disable-block-gas-limit",
    aliases: ["--no-gas-limit"],
    category: "Environment config",
    kind: "boolean",
    conflicts: ["--gas-limit"],
    description: "Disable the `call.gas_limit <= block.gas_limit` constraint.",
    methods: ["evm.disableBlockGasLimit()"],
  },
  {
    flag: "--disable-code-size-limit",
    category: "Environment config",
    kind: "boolean",
    conflicts: ["--code-size-limit"],
    description: "Disable EIP-170: Contract code size limit.",
    methods: ["evm.disableCodeSizeLimit()"],
  },
  {
    flag: "--disable-min-priority-fee",
    aliases: ["--no-priority-fee"],
    category: "Environment config",
    kind: "boolean",
    description: "Disable the enforcement of a minimum suggested priority fee.",
    methods: ["evm.disableMinPriorityFee()"],
  },
  {
    flag: "--gas-limit",
    aliases: ["--block-gas-limit"],
    category: "Environment config",
    kind: "value",
    conflicts: ["--disable-block-gas-limit"],
    description: "The block gas limit.",
    methods: ["evm.withGasLimit()"],
  },
  {
    flag: "--gas-price",
    category: "Environment config",
    kind: "value",
    description: "The gas price.",
    methods: ["evm.withGasPrice()"],
  },
  // ------------------------------------------------------------- EVM options
  {
    flag: "--auto-impersonate",
    aliases: ["--auto-unlock"],
    category: "EVM options",
    kind: "boolean",
    description: "Enables automatic impersonation on startup.",
    methods: ["evm.autoImpersonate()", "account.autoImpersonate()"],
  },
  {
    flag: "--disable-console-log",
    aliases: ["--no-console-log"],
    category: "EVM options",
    kind: "boolean",
    description: "Disable printing of `console.log` invocations to stdout.",
    methods: ["logs.disableConsoleLog()"],
  },
  {
    flag: "--disable-default-create2-deployer",
    aliases: ["--no-create2"],
    category: "EVM options",
    kind: "boolean",
    description: "Disable the default create2 deployer.",
    methods: ["evm.disableDefaultCreate2Deployer()"],
  },
  {
    flag: "--disable-pool-balance-checks",
    category: "EVM options",
    kind: "boolean",
    description: "Disable pool balance checks.",
    methods: ["evm.disablePoolBalanceChecks()"],
  },
  {
    flag: "--memory-limit",
    category: "EVM options",
    kind: "value",
    description: "The memory limit per EVM execution in bytes.",
    methods: ["evm.withMemoryLimit()"],
  },
  {
    flag: "--print-traces",
    aliases: ["--enable-trace-printing"],
    category: "EVM options",
    kind: "boolean",
    description:
      "Enable printing of traces for executed transactions and `eth_call` to stdout.",
    methods: ["evm.withPrintTraces()"],
  },
  {
    flag: "--steps-tracing",
    aliases: ["--tracing"],
    category: "EVM options",
    kind: "boolean",
    description:
      "Enable steps tracing used for debug calls returning geth-style traces.",
    methods: ["evm.withStepsTracing()"],
  },
  // ---------------------------------------------------------------- Networks
  {
    flag: "--celo",
    category: "Networks",
    kind: "boolean",
    conflicts: ["--optimism"],
    description: "Enable Celo network features.",
    methods: ["network.withCelo()"],
  },
  {
    flag: "--optimism",
    category: "Networks",
    kind: "boolean",
    description: "Enable Optimism network features.",
    methods: ["network.withOptimism()"],
  },
];

function buildRegistry(): ReadonlyMap<AnvilFlag, FlagSpec> {
  // Conflicts are declared once and made symmetric here.
  const conflicts = new Map<AnvilFlag, Set<AnvilFlag>>(
    RAW_SPECS.map((spec) => [spec.flag, new Set<AnvilFlag>()]),
  );
  for (const spec of RAW_SPECS) {
    for (const other of spec.conflicts ?? []) {
      conflicts.get(spec.flag)!.add(other);
      conflicts.get(other)!.add(spec.flag);
    }
  }
  const registry = new Map<AnvilFlag, FlagSpec>();
  for (const spec of RAW_SPECS) {
    if (registry.has(spec.flag))
      throw new Error(`Duplicate flag in registry: ${spec.flag}`);
    registry.set(
      spec.flag,
      Object.freeze({
        ...spec,
        aliases: Object.freeze([...(spec.aliases ?? [])]),
        conflicts: Object.freeze([...conflicts.get(spec.flag)!].sort()),
        requires: Object.freeze([...(spec.requires ?? [])]),
        requiresAnyOf: Object.freeze([...(spec.requiresAnyOf ?? [])]),
        methods: Object.freeze([...spec.methods]),
        managed: spec.managed ?? false,
      }),
    );
  }
  return registry;
}

/** Every flag keyed by its canonical long form. */
export const ANVIL_FLAGS: ReadonlyMap<AnvilFlag, FlagSpec> = buildRegistry();

/** Every flag in `anvil --help` order. */
export const ANVIL_FLAG_LIST: readonly FlagSpec[] = Object.freeze([
  ...ANVIL_FLAGS.values(),
]);

/** Returns the spec of a flag; throws for unknown flags. */
export function getFlagSpec(flag: AnvilFlag): FlagSpec {
  const spec = ANVIL_FLAGS.get(flag);
  if (!spec) throw new Error(`Unknown anvil flag: ${String(flag)}`);
  return spec;
}

/** Type guard for canonical flags. */
export function isAnvilFlag(value: string): value is AnvilFlag {
  return ANVIL_FLAGS.has(value as AnvilFlag);
}

/** Flags configured by a fluent group, e.g. `groupFlags("account")`. */
export function groupFlags(group: string): readonly AnvilFlag[] {
  return Object.freeze(
    ANVIL_FLAG_LIST.filter((spec) =>
      spec.methods.some((method) => method.startsWith(`${group}.`)),
    ).map((spec) => spec.flag),
  );
}
