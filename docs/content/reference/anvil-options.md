---
title: AnvilOptions
description: Every anvil flag by option group, with methods, aliases and rules.
---

Every anvil flag, by group. Samples: [quick start](../get-started/quick-start.md),
[compose and inspect options](../tasks/configure/compose-options.md).

- Groups (`.account`, `.evm`, …) share one configuration and chain freely.
- Setters throw `AnvilConfigurationError` at once; dependencies are checked by
  `validate()` / `build()` / `start()`.
- Boolean setters take `enabled = true`; numeric ones `number | bigint`.
- `reset()` removes a group's flags.

Lists are *generated* from the flag registry; descriptions are anvil's.

## Account

<!-- generated:flags:account -->
- `withAccounts()` → `--accounts` (`-a`)\
  Number of dev accounts to generate and configure.
- `withBalance()` → `--balance`\
  The balance of every dev account in Ether.
- `withDerivationPath()` → `--derivation-path`\
  Sets the derivation path of the child key to be derived.
- `withMnemonic()` → `--mnemonic` (`-m`)\
  BIP39 mnemonic phrase used for generating accounts.\
  **Rules:** ⟂ `--mnemonic-random`, `--mnemonic-seed-unsafe`.
- `withRandomMnemonic()` → `--mnemonic-random`\
  Automatically generates a BIP39 mnemonic phrase, and derives accounts from it.\
  **Rules:** ⟂ `--mnemonic`, `--mnemonic-seed-unsafe`.
- `withMnemonicSeedUnsafe()` → `--mnemonic-seed-unsafe`\
  Generates a BIP39 mnemonic phrase from a given seed.\
  **Rules:** ⟂ `--mnemonic`, `--mnemonic-random`.
- `autoImpersonate()` → `--auto-impersonate` (`--auto-unlock`)\
  Enables automatic impersonation on startup.
<!-- /generated -->

Balance in whole Ether; one mnemonic source at a time.

## EVM

<!-- generated:flags:evm -->
- `withHardfork()` → `--hardfork`\
  The EVM hardfork to use.
- `withBlockBaseFeePerGas()` → `--block-base-fee-per-gas` (`--base-fee`)\
  The base fee in a block.
- `withChainId()` → `--chain-id` (`--chain`)\
  The chain ID.
- `withCodeSizeLimit()` → `--code-size-limit`\
  EIP-170: Contract code size limit in bytes.\
  **Rules:** ⟂ `--disable-code-size-limit`.
- `disableBlockGasLimit()` → `--disable-block-gas-limit` (`--no-gas-limit`)\
  Disable the `call.gas_limit <= block.gas_limit` constraint.\
  **Rules:** ⟂ `--gas-limit`.
- `disableCodeSizeLimit()` → `--disable-code-size-limit`\
  Disable EIP-170: Contract code size limit.\
  **Rules:** ⟂ `--code-size-limit`.
- `disableMinPriorityFee()` → `--disable-min-priority-fee` (`--no-priority-fee`)\
  Disable the enforcement of a minimum suggested priority fee.
- `withGasLimit()` → `--gas-limit` (`--block-gas-limit`)\
  The block gas limit.\
  **Rules:** ⟂ `--disable-block-gas-limit`.
- `withGasPrice()` → `--gas-price`\
  The gas price.
- `autoImpersonate()` → `--auto-impersonate` (`--auto-unlock`)\
  Enables automatic impersonation on startup.
- `disableDefaultCreate2Deployer()` → `--disable-default-create2-deployer` (`--no-create2`)\
  Disable the default create2 deployer.
- `disablePoolBalanceChecks()` → `--disable-pool-balance-checks`\
  Disable pool balance checks.
- `withMemoryLimit()` → `--memory-limit`\
  The memory limit per EVM execution in bytes.
- `withPrintTraces()` → `--print-traces` (`--enable-trace-printing`)\
  Enable printing of traces for executed transactions and `eth_call` to stdout.
- `withStepsTracing()` → `--steps-tracing` (`--tracing`)\
  Enable steps tracing used for debug calls returning geth-style traces.
<!-- /generated -->

Fees in wei, limits in gas or bytes; `OpHardfork` needs `network.withOptimism()`.

## Fork

<!-- generated:flags:fork -->
- `withComputeUnitsPerSecond()` → `--compute-units-per-second` (`--cups`)\
  Sets the number of assumed available compute units per second for this provider.\
  **Rules:** needs `--fork-url`.
- `withForkUrl()` → `--fork-url` (`-f`, `--rpc-url`)\
  Fetch state over a remote endpoint instead of starting from an empty state.
- `withForkBlockNumber()`, `withForkUrl()` → `--fork-block-number`\
  Fetch state from a specific block number over a remote endpoint.\
  **Rules:** ⟂ `--fork-transaction-hash`; needs `--fork-url`.
- `withForkChainId()` → `--fork-chain-id`\
  Specify chain id to skip fetching it from remote endpoint (offline-start mode).\
  **Rules:** needs `--fork-url`; needs one of `--fork-block-number`, `--fork-transaction-hash`.
- `withForkHeader()`, `withForkHeaders()` → `--fork-header`\
  Headers to use for the rpc client, e.g. "User-Agent: test-agent".\
  **Rules:** needs `--fork-url`.
- `withForkRetryBackoff()` → `--fork-retry-backoff`\
  Initial retry backoff on encountering errors.\
  **Rules:** needs `--fork-url`.
- `withForkTransactionHash()` → `--fork-transaction-hash`\
  Fetch state from after a specific transaction hash has been applied over a remote endpoint.\
  **Rules:** ⟂ `--fork-block-number`; needs `--fork-url`.
- `noRateLimit()` → `--no-rate-limit` (`--no-rpc-rate-limit`)\
  Disables rate limiting for this node's provider.\
  **Rules:** needs `--fork-url`.
- `noStorageCaching()` → `--no-storage-caching`\
  Explicitly disables the use of RPC caching.\
  **Rules:** needs `--fork-url`.
- `withRetries()` → `--retries`\
  Number of retry requests for spurious networks (timed out requests).\
  **Rules:** needs `--fork-url`.
- `withTimeout()` → `--timeout`\
  Timeout in ms for requests sent to remote JSON-RPC server in forking mode.\
  **Rules:** needs `--fork-url`.
<!-- /generated -->

Every option needs `withForkUrl()`; URLs resolve inside the container
(`host.docker.internal` for the host). Negative blocks are relative to the
latest; times in ms. `withForkTransactionHash()` forks *before* the
transaction ([tested](../tasks/forking/fork-a-chain.md#choose-the-fork-point)),
despite anvil's description.

## Mining

<!-- generated:flags:mining -->
- `withBlockTime()`, `withMixedMining()` → `--block-time` (`-b`, `--blockTime`)\
  Block time in seconds for interval mining.\
  **Rules:** ⟂ `--no-mining`.
- `withMixedMining()` → `--mixed-mining`\
  Enable mixed mining (interval mining plus on-demand/automine).\
  **Rules:** needs `--block-time`.
- `withNoMining()` → `--no-mining` (`--no-mine`)\
  Disable auto and interval mining, and mine on demand instead.\
  **Rules:** ⟂ `--block-time`.
- `withBlockNumber()` → `--number`\
  The number of the genesis block.
- `withSlotsInAnEpoch()` → `--slots-in-an-epoch`\
  Slots in an epoch.
<!-- /generated -->

`withAutoMining()` removes the other mining modes (automine is the default).

## Logs

<!-- generated:flags:logs -->
- `withColor()` → `--color`\
  The color of the log messages.\
  **Rules:** ⟂ `--json`.
- `jsonLogFormat()` → `--json`\
  Format log messages as JSON.\
  **Rules:** ⟂ `--color`, `--md`, `--quiet`.
- `withMarkdownFormat()` → `--md`\
  Format log messages as Markdown.\
  **Rules:** ⟂ `--json`.
- `quiet()` → `--quiet` (`-q`)\
  Do not print log messages.\
  **Rules:** ⟂ `--json`, `--verbosity`.
- `verboseLogs()` → `--verbosity` (`-v`)\
  Verbosity level of the log messages.\
  **Rules:** ⟂ `--quiet`.
- `disableConsoleLog()` → `--disable-console-log` (`--no-console-log`)\
  Disable printing of `console.log` invocations to stdout.
<!-- /generated -->

`quiet()` doesn't affect readiness, but hides the keys of random mnemonics.

## Network

<!-- generated:flags:network -->
- `withCelo()` → `--celo`\
  Enable Celo network features.\
  **Rules:** ⟂ `--optimism`.
- `withOptimism()` → `--optimism`\
  Enable Optimism network features.\
  **Rules:** ⟂ `--celo`.
<!-- /generated -->

## Server

<!-- generated:flags:server -->
- `withIpc()` → `--ipc` (`--ipcpath`)\
  Launch an ipc server at the given path or default path = `/tmp/anvil.ipc`.
- `withThreads()` → `--threads` (`-j`, `--jobs`)\
  Number of threads to use. Specifying 0 defaults to the number of logical cores.
- `withPort()` → `--port` (`-p`)\
  Port number to listen on.
- `withAllowOrigin()` → `--allow-origin`\
  The cors `allow_origin` header.\
  **Rules:** ⟂ `--no-cors`.
- `withCachePath()` → `--cache-path`\
  Path to the cache directory where persisted states are stored.
- `noCors()` → `--no-cors`\
  Disable CORS.\
  **Rules:** ⟂ `--allow-origin`.
- `noRequestSizeLimit()` → `--no-request-size-limit`\
  Disable the default request body size limit.
<!-- /generated -->

Ports and paths are inside the container; the host port is mapped.

## State

<!-- generated:flags:state -->
- `withConfigOut()` → `--config-out`\
  Writes output of `anvil` as json to user-specified file.
- `withDumpState()` → `--dump-state`\
  Dump the state and block environment of chain on exit to the given file.\
  **Rules:** ⟂ `--init`, `--state`.
- `withInit()` → `--init`\
  Initialize the genesis block with the given `genesis.json` file.\
  **Rules:** ⟂ `--dump-state`, `--load-state`, `--preserve-historical-states`, `--state`.
- `withLoadState()` → `--load-state`\
  Initialize the chain from a previously saved state snapshot.\
  **Rules:** ⟂ `--init`, `--state`.
- `withMaxPersistedStates()` → `--max-persisted-states`\
  Max number of states to persist on disk.\
  **Rules:** ⟂ `--prune-history`.
- `withOrder()` → `--order`\
  How transactions are sorted in the mempool.
- `withPreserveHistoricalStates()` → `--preserve-historical-states`\
  Preserve historical state snapshots when dumping the state.\
  **Rules:** ⟂ `--init`; needs one of `--dump-state`, `--state`.
- `withPruneHistory()` → `--prune-history`\
  Don't keep full chain history. If a number argument is specified, at most this number of states is kept in memory.\
  **Rules:** ⟂ `--max-persisted-states`.
- `withStateInterval()` → `--state-interval` (`-s`)\
  Interval in seconds at which the state and block environment is to be dumped to disk.\
  **Rules:** needs one of `--dump-state`, `--state`.
- `withState()` → `--state`\
  This is an alias for both --load-state and --dump-state.\
  **Rules:** ⟂ `--dump-state`, `--init`, `--load-state`.
- `withTimestamp()` → `--timestamp`\
  The timestamp of the genesis block.
- `withTransactionBlockKeeper()` → `--transaction-block-keeper`\
  Number of blocks with transactions to keep in memory.
<!-- /generated -->

File options take host paths (copied in / out) or `containerPath("/abs")`.

## Managed flags

Set by the container:

<!-- generated:managed-flags -->
- `--host`: The hosts the server will listen on.
<!-- /generated -->

## Composition and inspection

On `AnvilOptions` and every group:

| Member | Description |
|---|---|
| `account`, `evm`, `fork`, `mining`, `logs`, `network`, `server`, `state` | the option groups (same configuration) |
| `clone()` | independent deep copy (flags, file transfers, extra args) |
| `apply(...presets)` | runs `(options: AnvilOptions) => unknown` presets |
| `root()` | the `AnvilOptions` view of this configuration |
| `unset(...flags)` | removes flags (and their file transfers); no-op when absent |
| `reset()` | groups only: removes the group's flags |
| `withExtraArgs(...args)` | raw arguments for flags newer than the library; known flags are rejected |
| `has(flag)` / `get(flag)` | whether a flag is set / its raw value |
| `flags()` | configured flags in canonical order (without managed flags) |
| `toArgs()` / `entryPoint` / `toCommand()` / `toJSON()` | rendered arguments, `["anvil", …]`, a shell-quoted command line, `{ command, flags }` |
| `problems()` | every dependency problem, without throwing |
| `validate()` | throws one `AnvilConfigurationError` listing every problem |
| `build()` | validates and returns a frozen `AnvilConfiguration` |

Arguments render in `anvil --help` order. `AnvilConfiguration` has `args`,
`command`, `port`, `chainId`, `accounts`, `mnemonic`, `derivationPath`,
`quiet`, `forking`, `fileImports` (`FileImport`), `fileExports`
(`FileExport`) and `flags` (`FlagValue` by `AnvilFlag`).

Tasks: [Compose and inspect options](../tasks/configure/compose-options.md),
[Catch misconfiguration](../tasks/test-suites/catch-misconfiguration.md).
