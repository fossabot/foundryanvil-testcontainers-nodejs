---
title: Flag rules
description: Conflicts and dependencies between anvil flags, enforced before anything starts.
---

- **Conflicts** throw `AnvilConfigurationError` when the second flag is set;
  swap with `unset()`.
- **Dependencies** are checked by `validate()` / `build()` / `start()`.
- `OpHardfork` needs `--optimism`; `Hardfork` conflicts with it.

Generated from the flag registry:

<!-- generated:flag-rules -->
| Flag | Set by | Conflicts with | Requires | Note |
|---|---|---|---|---|
| `--block-time` | `mining.withBlockTime()`, `mining.withMixedMining()` | `--no-mining` |  |  |
| `--dump-state` | `state.withDumpState()` | `--init`, `--state` |  |  |
| `--init` | `state.withInit()` | `--dump-state`, `--load-state`, `--preserve-historical-states`, `--state` |  |  |
| `--load-state` | `state.withLoadState()` | `--init`, `--state` |  |  |
| `--mnemonic` | `account.withMnemonic()` | `--mnemonic-random`, `--mnemonic-seed-unsafe` |  |  |
| `--max-persisted-states` | `state.withMaxPersistedStates()` | `--prune-history` |  |  |
| `--mixed-mining` | `mining.withMixedMining()` |  | `--block-time` | Stricter than anvil: anvil's parser skips this requirement when --no-mining is present; mixed mining without a block time is meaningless, so --block-time is always required. |
| `--mnemonic-random` | `account.withRandomMnemonic()` | `--mnemonic`, `--mnemonic-seed-unsafe` |  |  |
| `--mnemonic-seed-unsafe` | `account.withMnemonicSeedUnsafe()` | `--mnemonic`, `--mnemonic-random` |  |  |
| `--no-mining` | `mining.withNoMining()` | `--block-time` |  |  |
| `--preserve-historical-states` | `state.withPreserveHistoricalStates()` | `--init` | one of `--dump-state`, `--state` | Stricter than anvil: anvil accepts the flag without a dump target, where it has no effect. |
| `--prune-history` | `state.withPruneHistory()` | `--max-persisted-states` |  |  |
| `--state-interval` | `state.withStateInterval()` |  | one of `--dump-state`, `--state` | Stricter than anvil: anvil accepts the flag without a dump target, where it has no effect. |
| `--state` | `state.withState()` | `--dump-state`, `--init`, `--load-state` |  |  |
| `--color` | `logs.withColor()` | `--json` |  |  |
| `--json` | `logs.jsonLogFormat()` | `--color`, `--md`, `--quiet` |  |  |
| `--md` | `logs.withMarkdownFormat()` | `--json` |  |  |
| `--quiet` | `logs.quiet()` | `--json`, `--verbosity` |  |  |
| `--verbosity` | `logs.verboseLogs()` | `--quiet` |  |  |
| `--allow-origin` | `server.withAllowOrigin()` | `--no-cors` |  |  |
| `--no-cors` | `server.noCors()` | `--allow-origin` |  |  |
| `--compute-units-per-second` | `fork.withComputeUnitsPerSecond()` |  | `--fork-url` |  |
| `--fork-block-number` | `fork.withForkBlockNumber()`, `fork.withForkUrl()` | `--fork-transaction-hash` | `--fork-url` |  |
| `--fork-chain-id` | `fork.withForkChainId()` |  | `--fork-url`; one of `--fork-block-number`, `--fork-transaction-hash` |  |
| `--fork-header` | `fork.withForkHeader()`, `fork.withForkHeaders()` |  | `--fork-url` |  |
| `--fork-retry-backoff` | `fork.withForkRetryBackoff()` |  | `--fork-url` |  |
| `--fork-transaction-hash` | `fork.withForkTransactionHash()` | `--fork-block-number` | `--fork-url` |  |
| `--no-rate-limit` | `fork.noRateLimit()` |  | `--fork-url` |  |
| `--no-storage-caching` | `fork.noStorageCaching()` |  | `--fork-url` |  |
| `--retries` | `fork.withRetries()` |  | `--fork-url` |  |
| `--timeout` | `fork.withTimeout()` |  | `--fork-url` |  |
| `--code-size-limit` | `evm.withCodeSizeLimit()` | `--disable-code-size-limit` |  |  |
| `--disable-block-gas-limit` | `evm.disableBlockGasLimit()` | `--gas-limit` |  |  |
| `--disable-code-size-limit` | `evm.disableCodeSizeLimit()` | `--code-size-limit` |  |  |
| `--gas-limit` | `evm.withGasLimit()` | `--disable-block-gas-limit` |  |  |
| `--celo` | `network.withCelo()` | `--optimism` |  |  |
| `--optimism` | `network.withOptimism()` | `--celo` |  |  |
<!-- /generated -->

"Stricter than anvil": anvil accepts the combination but ignores it. Every rule
is verified against the real binary.

Tasks: [Catch misconfiguration in unit tests](../tasks/test-suites/catch-misconfiguration.md).
