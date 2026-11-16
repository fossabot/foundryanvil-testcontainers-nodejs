# Contributing

## Development

| Script                          | Description                                                      |
|---------------------------------|------------------------------------------------------------------|
| `pnpm build`                    | Build ESM + CJS + types into `dist/`                             |
| `pnpm typecheck`                | `tsc --noEmit`                                                   |
| `pnpm eslint`                   | Lint (and fix)                                                   |
| `pnpm test`                     | All tests (e2e tests run in Docker when available, otherwise skip) |
| `pnpm test:unit`                | Unit tests only (no Docker or anvil needed)                      |
| `pnpm test:e2e`                 | End-to-end tests against real anvil **in Docker** (default, CI/CD) |
| `pnpm test:e2e --no-docker`     | End-to-end tests against a **local anvil binary** – bundled, no Docker or Foundry install needed (local testing only) |
| `pnpm test:coverage`            | Unit tests with coverage (thresholds enforced)                   |
| `pnpm check`                    | Full quality gate: build, typecheck, lint, test                  |

### End-to-end tests

The e2e suite (`test/e2e`) starts real anvil nodes and covers the container
lifecycle, transactions, accounts & keys, impersonation, time travel,
snapshots, state load/dump/persistence, genesis files, quiet/JSON logging,
fail-fast startup errors and CLI parity with the real anvil parser.

**Docker mode (default)** – `pnpm test:e2e` runs everything through
`AnvilContainer` / Testcontainers using the default image. This is what CI/CD
(e.g. GitHub Actions, where Docker is available) must use. If no container
runtime is found the command exits with a hint instead of failing obscurely.

**Local mode** – `pnpm test:e2e --no-docker` runs the same tests against a
local `anvil` process for machines without Docker. It prints a warning that it
is **only meant for local testing** and that CI/CD should use Docker (with an
extra notice when `CI` / `GITHUB_ACTIONS` is set, and a note when the local
anvil version differs from the default image). In this mode:

- it works **out of the box**: the `@foundry-rs/anvil` devDependency ships a
  prebuilt anvil for Linux/macOS (x64, arm64) and Windows x64, pinned to the
  same version as the default Docker image (a unit test keeps the two in sync);
- the binary is resolved in this order: `ANVIL_BINARY` (explicit override) →
  bundled `@foundry-rs/anvil` → `anvil` on the `PATH` → `~/.foundry/bin/anvil`
  (foundryup). The warning shows which one is used;
- the platform binary is executed directly (not the package's Node wrapper), so
  `SIGTERM` reaches anvil and state dumps are written on stop;
- the command line produced by `AnvilOptions` is used as-is, except that
  anvil binds to `127.0.0.1` on a free port (`getMappedPort()` returns it) and
  container file paths are mapped into a private temp directory;
- `stop()` sends `SIGTERM` (so state dumps are written) like `docker stop`;
- CLI parse checks run through the same shell script Docker mode executes in
  the container, split across one `sh` per CPU (Node's `spawn` serialises on
  the binary's `execve`); boot checks wait for a real JSON-RPC answer. A
  sample is also run through the script's `timeout(1)` fallback and compared.

Local mode does not exercise the container itself (image, entrypoint, port
publishing, file copies), which is why it must not replace Docker mode in CI.

Extra Jest arguments are forwarded, e.g. `pnpm test:e2e --no-docker -t parity`.
The fork test runs when `ANVIL_FORK_URL` (and optionally
`ANVIL_FORK_BLOCK_NUMBER`) is set — see `.env.example`. `ANVIL_E2E_MODE`
(`docker` / `local` / `skip`) can be set to control plain `pnpm test` runs.

### Module formats

- `dist/index.js` – ESM
- `dist/index.cjs` – CommonJS
- `dist/index.d.ts` / `dist/index.d.cts` – TypeScript declarations

### Publishing

```bash
pnpm run build
np --no-publish
git push origin --tags   # triggers release.yml and publish.yml
```

### Custom Docker image

```shell
docker build -t hellaweb3/foundry-anvil:1.6 .
docker run -p 8545:8545 hellaweb3/foundry-anvil:1.6
cast block-number
```


## Feature matrix (requirements → API)

| Requirement | Where |
|---|---|
| Chain identity | `evm.withChainId()`, `evm.withHardfork()`, `state.withTimestamp()`, `mining.withBlockNumber()`, `state.withInit()`, `network.*` |
| RPC server | `server.*` (port, IPC, CORS, request size, threads, cache path); host managed |
| Fork config | `fork.*` incl. `url@block`, headers, retries, timeouts, rate limits, offline start |
| Startup reliability | JSON-RPC readiness probe, crash detection with logs, `AnvilStartupError`, chain-id resolution |
| Accounts, balances, impersonation | `account.*`, `accounts()` with keys, `setBalance*()`, `impersonate()`, `withImpersonation()`, `setAutoImpersonate()` |
| Mining, time, fees, execution limits | `mining.*`, `evm.withGasLimit()/withGasPrice()/withBlockBaseFeePerGas()/withCodeSizeLimit()/withMemoryLimit()`, `mine()`, `increaseTime()`, `setNextBlockTimestamp()`, `setMinGasPrice()`, `setBlockGasLimit()` |
| State loading & dump reports | `state.withLoadState()/withDumpState()/withState()/withStateInterval()/withPreserveHistoricalStates()`, `dumpStateToFile()`, `loadStateFromFile()`, `state.withConfigOut()` |
| RPC controls, tracing, diagnostics | `evm.withPrintTraces()/withStepsTracing()`, `logs.*`, `rpc()`, `nodeInfo()`, `metadata()`, `setLoggingEnabled()`, `logText()` |


## Test speed

- Jest transforms TypeScript with `@swc/jest` (type checking is `pnpm typecheck`'s job).
- Bulk suites (combinations, CLI parity) check every case in plain code and
  assert the collected mismatches once per group: the same coverage without
  Jest's per-assertion overhead, and failures list every offending case.
- e2e files run in parallel.

## Fixtures

- `test/fixtures/anvil-help.txt` – `anvil --help` of the default image's
  version; the registry is checked against it. Refresh it when bumping anvil.
- `test/fixtures/state.json` – a state dump written by anvil 1.6.0-rc1.
- `test/fixtures/genesis.json` – minimal genesis with one funded account.

## Contracts used in tests

WETH (`test/artifacts/WrappedEther`): https://etherscan.io/address/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2#code


## Flag coverage matrix

The full flag matrix (aliases, fluent methods, conflicts, requirements) is
generated from the registry:

```shell
npx tsx scripts/flag-matrix.ts
```

## Package size

`pnpm build` runs `tsdx build` followed by `scripts/compact-dist.mjs`, which
strips comments and whitespace from the JS bundles (names are not mangled, so
stack traces stay readable). JSDoc is kept terse and lives in the `.d.ts`
files; only `dist/` is published, without source or declaration maps.
