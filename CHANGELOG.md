# Changelog

## Unreleased

Full viem test client integration: a pre-configured, strongly typed test
client for every started node, with a fluent API, validated configuration and
test lifecycle hooks.

### Added

- `StartedAnvilContainer.testClient`: viem test client (`mode: "anvil"`) with
  every test, public and wallet action plus `anvilActions`; `client` remains
  as an alias.
- `anvilActions` (also usable on your own clients): `addBalance`,
  `dealErc20`, `setErc20Allowance`, `setChainId` (the container's chain and
  clients follow), `setTime`, `getIntervalMining`, `setAutoImpersonate`,
  `dropAllTransactions`, `removePoolTransactions`, `rollback`, `reorg`,
  `getNodeInfo`, `getMetadata`, `confirmTransaction`.
- `TestClientOptions` + `AnvilContainer.withTestClient()`: transport (HTTP /
  WebSocket), polling interval, cache time, timeout, retries, batching,
  default account (anvil-signed, impersonated or locally signed) and chain
  metadata (`withMulticall3()`). Validated against the anvil options in
  `prepare()` before anything starts (`AnvilTestClientConfigurationError`).
- Typed default account: `AnvilContainer<TAccount>` →
  `StartedAnvilContainer<TAccount>` → `AnvilTestClient<TAccount>`;
  `account` is optional on actions exactly when a default account exists.
- `anvil.cheats`: fluent, awaitable chains covering every state-changing
  viem test action and anvil extra, with step-level `CHEAT_FAILED` errors.
- `useAnvil()`: starts / stops a node in `beforeAll` / `afterAll`, runs a
  `setup`, restores the post-setup state after each test; the returned handle
  throws `NOT_STARTED` when used too early.
- `confirm()`: receipt with automatic mining when automine is off;
  `AnvilTransactionRevertedError` with the revert reason.
- `testClientFor()`, `createTestClient()`, `reset()`, `latestTimestamp()`,
  `isStopped`, `testClientConfiguration`, `AnvilCheckpoint.id`.
- `Duration` (`{ days: 7 }`) and `Timestamp` inputs; `AnvilTestClientError`
  with `code`; `ANVIL_TEST_CLIENT_ERROR_CODES`.
- `AnvilContainer.startRuntime()`: protected extension point to run the
  prepared anvil outside Docker (e.g. a local binary in tests) with the
  library's own validation, test client setup and error handling.
- `examples/`: a separate npm project consuming the library through
  `npm link`, with 15 tested advanced workflows (every viem test action,
  anvil extra and `cheats` step, plus forking, tracing, simulation, EIP-7702
  and node configuration) running on contract artifacts (ABI `.json` +
  bytecode `.bin`);
  part of the quality gate (`pnpm examples:unit [--coverage]`,
  `pnpm examples:e2e [--no-docker]`, `pnpm gate`).
- Documentation site (`docs/`, Docusaurus, published to GitHub Pages by
  `.github/workflows/docs.yml`): task-based guides, a complete API reference
  and deep dives. Every code sample is synced from a tested `#region` of
  `examples/` and reference tables are generated from the library; drift,
  unlinked code, unshown example regions and undocumented API fail
  `pnpm docs:unit` and the site build. New root scripts: `pnpm docs:start`,
  `docs:sync`, `docs:unit [--coverage]`, `docs:e2e [--no-docker]`,
  `docs:build`, `docs:serve`.
- More tested examples: quick start, lifecycle control, cheats plans and
  errors, every remaining anvil option (fork points and provider options,
  request size, code size, pool balance checks, gas price, priority fee,
  finality, transaction keeper, state files, network modes, log formats,
  server paths, composition and inspection).

### Performance

Measured with the new `pnpm bench` (local anvil, alternating runs against
the previous build; ranges over two sessions with different machine load):

- `confirm()` / `confirmTransaction()` (also behind `sendEthTransaction()`,
  `deployContract()`): anvil returns an automined transaction's hash just
  before the block is committed; the receipt is now re-read immediately
  (together with the automine check) and then with a 1 ms backoff instead of
  viem's block watcher — 1.3–2× faster, and no more tails of a whole
  polling interval.
- The container's clients answer `eth_chainId` from the chain id they track
  (following `setChainId()` / `reset()`, also as raw `rpc()` /
  `request()` calls): one round trip less per node-signed transaction,
  1.7–1.8× faster sends.
- `useAnvil()` empties the mempool while restoring the per-test snapshot:
  one round trip less per test (1.05–1.5× faster isolation).
- The default polling interval is 25 ms (was 100 ms): HTTP watchers observe
  changes ~3.7× sooner.
- The keys of anvil's default mnemonic are built in and other derivations
  are memoized: 40–90 ms less for the first start with `withLocalAccount()`
  or `accounts()` in every test file.
- Readiness is probed every 10 ms (was 50 ms); the container state (a
  Docker API call) is checked at most every 100 ms.
- A typical test (three confirmed writes, reads, cheats, restore) runs
  1.4–1.85× faster.

### Fixed

- `AnvilNodeInfo` types: `environment.chainId` is a number (anvil returns a
  JSON number; it was typed as hex) and `forkConfig` fields are `null` when
  the node is not forking.
- `reset()` without arguments failed on non-forked nodes (viem sends a fork
  config); it now resets to genesis.
- `revert()` silently continued when anvil answered `false` (unknown or
  already used snapshot); it now throws `SNAPSHOT_NOT_FOUND`.
- Using a client after `stop()` failed with an opaque fetch error; it now
  throws `CONTAINER_STOPPED`, and WebSocket connections are closed on stop.
- `useAnvil` per-test isolation leaked pending transactions into the next
  test (reverting a snapshot keeps the mempool); it now empties the pool
  before restoring.
- `reset()` without arguments on a forked node detached it from the fork
  (a bare `anvil_reset` leaves a non-forked chain at block 0 with stale
  state); it now re-forks at the current fork block, read from
  `anvil_nodeInfo`.

### Changed

- viem and testcontainers are pinned to `2.57.1` / `12.2.0` (from
  `^2.57.20` / `12.2.1`) so installs are identical in the sandbox mirror, in
  CI and locally (TODO: bump again once the mirror serves them). pnpm is
  pinned with `packageManager` (10.34.5); the lockfiles keep macOS and
  Linux arm64 builds of native tools, checked by `pnpm lockfiles:check`.
- `increaseTime()`, `mine()`, `setIntervalMining()` accept durations;
  `increaseTime()` resolves to the time offset in seconds (was `unknown`).
- `addresses()` always asks the node (`eth_accounts`).
- `sendEthTransaction()` / `deployContract()` check for an existing receipt
  before consulting automine.
- `AnvilNodeInfo` / `AnvilMetadata` moved to the test client types (still
  exported from the package root).
- The README is now a concise entry point (quick start synced from a tested
  example, links into the docs); its reference tables moved to the docs site,
  where their completeness is tested. `package.json` `homepage` points to the
  docs.
- The examples create nodes with `new AnvilContainer(options)` (as users do);
  `--no-docker` swaps the runtime in a Jest setup file instead of a wrapper.
- `pnpm examples:*` run through `scripts/examples.mjs` again: `--coverage`
  and `--no-docker` reach the examples' scripts, and linking no longer uses
  the global npm prefix. Examples unit coverage is enforced on `src/`.

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
