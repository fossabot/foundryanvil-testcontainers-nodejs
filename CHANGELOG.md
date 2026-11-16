# Changelog

## 0.3.0

Complete, type-safe coverage of every Foundry Anvil CLI flag with a redesigned
fluent API, reliable startup handling and host/container file transfer.

### Added

- Flag registry (`ANVIL_FLAGS`, `ANVIL_FLAG_LIST`, `getFlagSpec`) describing all
  65 anvil flags, their aliases, value kinds, conflicts and dependencies, plus
  `stricterThanAnvil` notes where the library is deliberately stricter. The
  test-suite verifies it against `anvil --help`, the README and the real
  anvil parser.
- New options: `server.withPort()`, `mining.withAutoMining()`,
  `fork.withForkHeaders()`, `fork.withForkUrl(url, blockNumber)` (incl. the
  `url@block` shorthand), `account.autoImpersonate()`, `OpHardfork`,
  `Hardfork.Osaka`.
- Composition helpers: `clone()`, `apply(...presets)`, `unset(...flags)`,
  `<group>.reset()`, `root()`, `withExtraArgs()`.
- Validation: `validate()`, `problems()`, `build()` (immutable
  `AnvilConfiguration`), `toCommand()`, `toJSON()`, `has()`, `get()`, `flags()`.
- Eager conflict detection mirroring anvil's `clap` rules (mnemonic sources,
  mining modes, state sources, CORS, fork origin, limits, logging, hardforks)
  and dependency validation (fork options require `--fork-url`, etc.).
- Host ⇄ container file handling for `--load-state`, `--init`, `--state`,
  `--dump-state` and `--config-out`; `containerPath()` for image-provided files.
- `AnvilReadyWaitStrategy`: JSON-RPC readiness probe with immediate failure
  (and anvil's error output) when the process exits.
- `AnvilConfigurationError` and `AnvilStartupError`.
- `StartedAnvilContainer`: `wsUrl`, `chainId`, `chain`, `configuration`,
  `rpc()`, `accounts()` (with private keys), `getBalance()`, `setBalance()`,
  `setBalanceEther()`, `impersonate()`, `stopImpersonating()`,
  `withImpersonation()`, `setAutoImpersonate()`, `mine()`, `getAutomine()`,
  `setAutomine()`, `setIntervalMining()`, `increaseTime()`,
  `setNextBlockTimestamp()`, `setMinGasPrice()`, `setNextBlockBaseFeePerGas()`,
  `setBlockGasLimit()`, `snapshot()`, `revert()`, `withSnapshot()`,
  `dumpState()`, `dumpStateToFile()`, `loadState()`, `loadStateFromFile()`,
  `nodeInfo()`, `metadata()`, `setLoggingEnabled()`, `logText()`.
- `AnvilContainer.withArtifactsDir()`, `prepare()`; standalone
  `loadContractAbi()` / `loadContractBytecode()`.
- Graceful `stop()` that lets anvil write state dumps and copies them to the
  host.

### Performance

- `accounts()` derives keys ~40× faster (native PBKDF2 seed computed once,
  parent HD node derived once): 10 accounts in ~20 ms instead of ~700 ms.
- Startup: readiness is probed every 50 ms (was 250 ms), probes before any
  Docker `inspect`, and reuses the probe's `eth_chainId` answer instead of a
  second round trip.
- New `checkpoint()`: a snapshot that can be restored repeatedly, for
  millisecond per-test isolation on a shared node.
- Unit suite: cold 43 s → 11 s, warm 20 s → 8 s (`@swc/jest`, batched bulk
  assertions). e2e (`--no-docker`): 103 s → ~20 s (parallel shell batches,
  JSON-RPC boot detection, parallel files, shorter waits).

### Cleanup

- Removed unused `ts-jest`, `@eslint/eslintrc`, `scripts/get-block-number.ts`,
  the unused UniswapV2Router test artifacts and dead `FlagStore` methods.
- `anvil --help` reference moved to `test/fixtures/anvil-help.txt`.
- CI matrix aligned with `engines` (Node 22, 24).
- Shared Docker detection (`scripts/docker-runtime.cjs`) for the e2e launcher
  and test helpers.

### Package size & footprint

- Published tarball 250.6 KB → 57.9 KB; unpacked 1.1 MB → 210 KB. Only
  `dist/` is published (no `src/`, no declaration maps).
- JS bundles are comment/whitespace-stripped after `tsdx build`
  (`scripts/compact-dist.mjs`); names are not mangled so stack traces stay
  readable. 159 KB → 55 KB per format.
- Terse JSDoc: type declarations 93.6 KB → 40.5 KB per format, with every
  flag, default, conflict and requirement still documented.
- `viem/chains` is no longer imported (it loads 696 chain definitions):
  library load −5.3 MB heap (25.4 → 20.1 MB) and ~15% faster.
- Internal `FlagStore` no longer leaks into the public types; validation
  labels and group flag lists are derived from the registry; new exports
  `groupFlags()` and `OptionsGroup`.
- README trimmed to the consumer reference (37 KB → 14 KB); contributor docs
  moved to `CONTRIBUTING.md`.

### Testing

- `pnpm test:e2e` (renamed from `test:integration`) runs the end-to-end suite
  in Docker – the mode CI/CD must use. `pnpm test:e2e --no-docker` runs the
  same suite against a local anvil binary for machines without Docker and
  prints a warning that it is meant for local testing only.
- `@foundry-rs/anvil` devDependency (pinned to the default image's version,
  `1.6.0-rc1`) so `--no-docker` works out of the box; its download-fallback
  postinstall is explicitly ignored (`ignoredBuiltDependencies`).
- New CLI parity e2e suite: every single flag and every flag pair is checked
  against the real anvil argument parser; every flag, every hardfork and a
  maximal configuration are booted; runtime hardfork rules are confirmed.
- Fixtures: a state dump written by anvil 1.6.0-rc1 and a minimal genesis file.

### Fixed

- All `AnvilOptions` instances shared one mutable argument array, so flags
  leaked between instances.
- Values starting with `-` (e.g. negative fork block numbers) were mis-parsed
  as flags when flags were replaced or removed.
- `withMnemonicSeedUnsafe()` accepted strings although anvil requires a `u64`.
- The viem client was always bound to chain id 31337, breaking
  `sendTransaction` with a custom `--chain-id` or when forking.
- Startup hung until the timeout with `--quiet` (log-based wait strategy).
- Artifact helpers depended on `__dirname` and the unpublished `test/` folder.
- Rules corrected after verification against the real anvil 1.6.0-rc1
  binary: `--celo` conflicts with `--optimism`; `--fork-chain-id` requires
  `--fork-block-number` or `--fork-transaction-hash`; `--md` may be combined
  with `--quiet`.
- `Hardfork.Latest` now omits `--hardfork` (anvil rejects a literal
  `--hardfork latest`); added `OpHardfork.Jovian`.
- The viem client cached `getBlockNumber()` for 4 s and polled every 4 s
  (viem's public-network defaults); it now never caches and polls every 100 ms.
- `dumpStateToFile()` writes JSON (the format `--load-state` expects) instead
  of gzip-compressed hex; `loadStateFromFile()` accepts both.

### Changed (breaking)

- Setters return their option group (which is also a full `AnvilOptions`
  view) instead of the root object; existing `.group.method().group.method()`
  chains keep working.
- `new AnvilOptions(entryPoint)` is gone; use the fluent API or
  `withExtraArgs()`.
- `LogVerbosity` values are numbers (1–5); `Hardfork` values are lowercase.
- `StartedAnvilContainer` constructor takes a details object (internal API).
- `stop()` uses a graceful 30 s timeout when a state dump is configured.
- Host paths given to state/genesis/config-out options are copied into / out
  of the container; use `containerPath()` for the previous behaviour.
