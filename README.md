<div align="center">

<h1>Foundry Anvil Testcontainers NodeJS Module</h1>

<a href="https://github.com/hella-web3/foundryanvil-testcontainers-nodejs/actions/workflows/main.yml"><img alt="Build+Test Status" src="https://github.com/hella-web3/foundryanvil-testcontainers-nodejs/actions/workflows/main.yml/badge.svg" /></a>
<a href="https://www.npmjs.com/package/@hellaweb3/foundryanvil-testcontainers-nodejs"><img alt="npm version" src="https://img.shields.io/npm/v/%40hellaweb3%2Ffoundryanvil-testcontainers-nodejs" /></a>
<a href="https://www.npmjs.com/package/@hellaweb3/foundryanvil-testcontainers-nodejs"><img alt="npm downloads" src="https://img.shields.io/npm/dy/%40hellaweb3%2Ffoundryanvil-testcontainers-nodejs" /></a>

</div>

A [Testcontainers](https://testcontainers.com/) module that runs a
[Foundry Anvil](https://getfoundry.sh/anvil/overview) node in Docker for tests.

- **Every anvil flag** through a fluent, type-safe API grouped like `anvil --help`.
- **No misconfiguration**: values are validated immediately, conflicting flags
  throw, dependencies are checked before start, and the command line renders
  deterministically. The rules are verified against the real anvil binary.
- **Reliable startup**: readiness probes JSON-RPC (any log settings); if anvil
  exits, its own error output is reported immediately.
- **Host files just work**: state snapshots, genesis and `--config-out` take
  host paths and are copied in/out of the container.
- **Chain-aware [viem](https://viem.sh) test client** plus helpers for
  accounts, impersonation, mining, time, fees, snapshots, state and diagnostics.

Default image: `ghcr.io/foundry-rs/foundry:v1.6.0-rc1` ·
[Anvil reference](https://getfoundry.sh/anvil/reference/anvil)

## Installation

```shell
pnpm add -D @hellaweb3/foundryanvil-testcontainers-nodejs
```

Requires Node.js ≥ 22 and a Docker-compatible runtime.

## Quick start

```ts
import { AnvilContainer, AnvilOptions, Hardfork, StartedAnvilContainer } from "@hellaweb3/foundryanvil-testcontainers-nodejs";

let anvil: StartedAnvilContainer;

beforeAll(async () => {
  const options = new AnvilOptions()
    .account.withAccounts(5).withBalance(1_000)
    .evm.withChainId(1337).withHardfork(Hardfork.Cancun)
    .mining.withNoMining()
    .logs.quiet();
  anvil = await new AnvilContainer(options).start();
}, 120_000);

afterAll(() => anvil?.stop());

it("sends Ether", async () => {
  const [alice, bob] = await anvil.addresses();
  expect((await anvil.sendEthTransaction(alice, bob, "1")).status).toBe("success");
  expect(await anvil.client.getChainId()).toBe(1337);
});
```

## `AnvilOptions`

Groups: `.account`, `.evm`, `.fork`, `.mining`, `.logs`, `.network`,
`.server`, `.state`. Every setter returns its group, every group exposes the
other groups, and every group *is* an `AnvilOptions`:

```ts
const options: AnvilOptions = new AnvilOptions()
  .account.withAccounts(5).withBalance(100)
  .mining.withBlockTime(1).withMixedMining();
options.toCommand(); // anvil --host 0.0.0.0 --accounts 5 --block-time 1 --balance 100 --mixed-mining
```

Boolean setters take `enabled = true` (`false` removes the flag). Numeric
setters accept `number | bigint`. Invalid input throws
`AnvilConfigurationError`. Each group has `reset()`.

### Account (`.account`)

| Method | Flag | Notes |
|---|---|---|
| `account.withAccounts()` | `--accounts` (`-a`) | default 10 |
| `account.withBalance()` | `--balance` | whole Ether, default 10000 |
| `account.withDerivationPath()` | `--derivation-path` | default `m/44'/60'/0'/0/` |
| `account.withMnemonic()` | `--mnemonic` (`-m`) | 12–24 words |
| `account.withRandomMnemonic()` | `--mnemonic-random` | optional word count |
| `account.withMnemonicSeedUnsafe()` | `--mnemonic-seed-unsafe` | `u64` seed |
| `account.autoImpersonate()` | `--auto-impersonate` (`--auto-unlock`) | also `evm.autoImpersonate()` |

One mnemonic source at a time.

### EVM (`.evm`)

| Method | Flag | Notes |
|---|---|---|
| `evm.withChainId()` | `--chain-id` (`--chain`) | default 31337 |
| `evm.withHardfork()` | `--hardfork` | `Hardfork`, or `OpHardfork` with `--optimism`; `Hardfork.Latest` omits the flag (anvil rejects `latest`) |
| `evm.withBlockBaseFeePerGas()` | `--block-base-fee-per-gas` (`--base-fee`) | wei |
| `evm.withGasPrice()` | `--gas-price` | wei |
| `evm.disableMinPriorityFee()` | `--disable-min-priority-fee` (`--no-priority-fee`) | |
| `evm.withGasLimit()` | `--gas-limit` (`--block-gas-limit`) | |
| `evm.disableBlockGasLimit()` | `--disable-block-gas-limit` (`--no-gas-limit`) | |
| `evm.withCodeSizeLimit()` | `--code-size-limit` | bytes |
| `evm.disableCodeSizeLimit()` | `--disable-code-size-limit` | |
| `evm.withMemoryLimit()` | `--memory-limit` | bytes |
| `evm.autoImpersonate()` | `--auto-impersonate` | |
| `evm.disableDefaultCreate2Deployer()` | `--disable-default-create2-deployer` (`--no-create2`) | |
| `evm.disablePoolBalanceChecks()` | `--disable-pool-balance-checks` | |
| `evm.withPrintTraces()` | `--print-traces` (`--enable-trace-printing`) | |
| `evm.withStepsTracing()` | `--steps-tracing` (`--tracing`) | geth-style `debug_*` traces |

### Fork (`.fork`)

All options require `fork.withForkUrl()` (checked at build time, any call
order). The URL is resolved inside the container — use
`http://host.docker.internal:<port>` for a node on the host.

| Method | Flag | Notes |
|---|---|---|
| `fork.withForkUrl()` | `--fork-url` (`-f`, `--rpc-url`) | `url@block` or 2nd arg set the block |
| `fork.withForkBlockNumber()` | `--fork-block-number` | negative = relative to latest |
| `fork.withForkTransactionHash()` | `--fork-transaction-hash` | |
| `fork.withForkChainId()` | `--fork-chain-id` | offline start; needs block number or tx hash |
| `fork.withForkHeader()` / `fork.withForkHeaders()` | `--fork-header` | add / replace `Name: value` |
| `fork.withForkRetryBackoff()` | `--fork-retry-backoff` | ms |
| `fork.withRetries()` | `--retries` | default 5 |
| `fork.withTimeout()` | `--timeout` | ms, default 45000 |
| `fork.withComputeUnitsPerSecond()` | `--compute-units-per-second` (`--cups`) | default 330 |
| `fork.noRateLimit()` | `--no-rate-limit` (`--no-rpc-rate-limit`) | |
| `fork.noStorageCaching()` | `--no-storage-caching` | |

```ts
new AnvilOptions().fork.withForkUrl(`https://mainnet.infura.io/v3/${KEY}`, 18_000_000).withRetries(10);
```

### Mining (`.mining`)

| Method | Flag | Notes |
|---|---|---|
| `mining.withBlockTime()` | `--block-time` (`-b`, `--blockTime`) | seconds, fractions allowed |
| `mining.withMixedMining()` | `--mixed-mining` | interval + automine; needs block time |
| `mining.withNoMining()` | `--no-mining` (`--no-mine`) | on demand only |
| `mining.withAutoMining()` | – | back to automine (removes the above) |
| `mining.withBlockNumber()` | `--number` | genesis block number |
| `mining.withSlotsInAnEpoch()` | `--slots-in-an-epoch` | default 32 |

### Logs (`.logs`)

| Method | Flag | Notes |
|---|---|---|
| `logs.verboseLogs()` | `--verbosity` (`-v` … `-vvvvv`) | `LogVerbosity` or 1–5 |
| `logs.quiet()` | `--quiet` (`-q`) | readiness doesn't need logs |
| `logs.withColor()` | `--color` | `Color.Auto/Always/Never` |
| `logs.jsonLogFormat()` | `--json` | |
| `logs.withMarkdownFormat()` | `--md` | |
| `logs.disableConsoleLog()` | `--disable-console-log` (`--no-console-log`) | |

### Network (`.network`)

| Method | Flag | Notes |
|---|---|---|
| `network.withOptimism()` | `--optimism` | hardforks must be `OpHardfork` |
| `network.withCelo()` | `--celo` | |

### Server (`.server`)

| Method | Flag | Notes |
|---|---|---|
| `server.withPort()` | `--port` (`-p`) | container port, mapped automatically; default 8545 |
| `server.withIpc()` | `--ipc` (`--ipcpath`) | container path, default `/tmp/anvil.ipc` |
| `server.withThreads()` | `--threads` (`-j`, `--jobs`) | 0 = logical cores |
| `server.withAllowOrigin()` | `--allow-origin` | default `*` |
| `server.noCors()` | `--no-cors` | |
| `server.noRequestSizeLimit()` | `--no-request-size-limit` | |
| `server.withCachePath()` | `--cache-path` | container path |

`--host` is managed by the container (always `0.0.0.0`).

### State (`.state`)

| Method | Flag | Notes |
|---|---|---|
| `state.withLoadState()` | `--load-state` | host file copied in |
| `state.withDumpState()` | `--dump-state` | copied to the host on stop |
| `state.withState()` | `--state` | load if present + dump |
| `state.withInit()` | `--init` | `genesis.json` |
| `state.withConfigOut()` | `--config-out` | resolved config incl. keys, copied out after start |
| `state.withStateInterval()` | `--state-interval` (`-s`) | needs a dump target |
| `state.withPreserveHistoricalStates()` | `--preserve-historical-states` | needs a dump target |
| `state.withMaxPersistedStates()` | `--max-persisted-states` | |
| `state.withPruneHistory()` | `--prune-history` | optional in-memory count |
| `state.withTransactionBlockKeeper()` | `--transaction-block-keeper` | |
| `state.withTimestamp()` | `--timestamp` | seconds, bigint or `Date` |
| `state.withOrder()` | `--order` | `Order.Fees` (default) / `Order.Fifo` |

File options take a host path (copied in before start / out after start or
stop) or `containerPath("/abs")` for files already in the image. Dumps on exit
need a graceful stop, which `StartedAnvilContainer.stop()` does.

```ts
new AnvilOptions().state.withState("./.anvil/state.json").withStateInterval(30);
```

### Rules

Conflicts throw when the second flag is set; dependencies are checked by
`validate()` / `build()` / `start()`.

| Rule | Flags |
|---|---|
| One mnemonic source | `--mnemonic` ⟂ `--mnemonic-random` ⟂ `--mnemonic-seed-unsafe` |
| One mining mode | `--no-mining` ⟂ `--block-time`; `--mixed-mining` → `--block-time` |
| State sources | `--state` ⟂ `--init` / `--dump-state` / `--load-state`; `--init` ⟂ `--dump-state` / `--load-state` / `--preserve-historical-states` |
| Dump helpers | `--state-interval`, `--preserve-historical-states` → `--dump-state` or `--state` |
| History | `--max-persisted-states` ⟂ `--prune-history` |
| CORS | `--no-cors` ⟂ `--allow-origin` |
| Fork | fork options → `--fork-url`; `--fork-block-number` ⟂ `--fork-transaction-hash`; `--fork-chain-id` → block number or tx hash |
| Limits | `--gas-limit` ⟂ `--disable-block-gas-limit`; `--code-size-limit` ⟂ `--disable-code-size-limit` |
| Logging | `--quiet` ⟂ `-v` / `--json`; `--json` ⟂ `--color` / `--md` |
| Networks | `--celo` ⟂ `--optimism`; `OpHardfork` → `--optimism`; `Hardfork` ⟂ `--optimism` |

Three rules are deliberately stricter than anvil (which accepts but ignores
them): the two dump helpers without a target, and `--mixed-mining` with
`--no-mining`. See `FlagSpec.stricterThanAnvil`; `ANVIL_FLAGS` exposes the
whole registry.

### Composition and inspection

| Method | Description |
|---|---|
| `clone()` | independent deep copy |
| `apply(...presets)` | run `(o: AnvilOptions) => void` presets |
| `unset(...flags)` | remove flags, e.g. to swap a conflicting one |
| `withExtraArgs(...args)` | raw args for newer anvil flags (known flags rejected) |
| `validate()` / `problems()` | throw / list dependency problems |
| `build()` | validated immutable `AnvilConfiguration` |
| `toArgs()` / `entryPoint` / `toCommand()` / `toJSON()` | rendered command |
| `has()` / `get()` / `flags()` / `root()` | inspection |

```ts
const base = () => new AnvilOptions().account.withAccounts(3);
const ci = base().apply((o) => o.mining.withBlockTime(1));
const random = ci.clone().unset("--mnemonic").account.withRandomMnemonic();
```

Rendering is canonical (`--help` order), uses `--flag=value` for optional
values and values starting with `-`, and repeats multi-value flags.

## `AnvilContainer`

Extends `GenericContainer` (all builders available, e.g. `withStartupTimeout`
for slow forks).

| Member | Description |
|---|---|
| `new AnvilContainer(options?, image?)` | defaults: anvil defaults, `DEFAULT_ANVIL_IMAGE` |
| `withArtifactsDir(dir)` | base dir for `contractAbi()` / `contractBytecode()` (default `<cwd>/test/artifacts`) |
| `prepare()` | validate + apply to the container without starting |
| `start()` | start and wait for JSON-RPC; throws `AnvilConfigurationError` / `AnvilStartupError` |

## `StartedAnvilContainer`

| Area | Members |
|---|---|
| Connection | `rpcUrl`, `wsUrl`, `chainId`, `chain`, `client`, `configuration`, `rpc(method, params)` |
| Accounts | `addresses()`, `accounts()` (with keys), `getBalance()`, `setBalance()`, `setBalanceEther()`, `impersonate()`, `stopImpersonating()`, `withImpersonation()`, `setAutoImpersonate()` |
| Transactions | `sendEthTransaction()`, `deployContract()` |
| Mining & time | `mine()`, `getAutomine()`, `setAutomine()`, `setIntervalMining()`, `increaseTime()`, `setNextBlockTimestamp()` |
| Fees & limits | `setMinGasPrice()`, `setNextBlockBaseFeePerGas()`, `setBlockGasLimit()` |
| State | `snapshot()`, `revert()`, `withSnapshot()`, `checkpoint()`, `dumpState()`, `dumpStateToFile()`, `loadState()`, `loadStateFromFile()` |
| Diagnostics | `nodeInfo()`, `metadata()`, `setLoggingEnabled()`, `logText()` |
| Artifacts | `contractAbi()`, `contractBytecode()` (also `loadContractAbi` / `loadContractBytecode`) |
| Lifecycle | `stop()` – graceful when a dump is configured, copies it to the host |

`client` is a viem test client bound to the node's actual chain id, with no
response caching and 100 ms polling.

```ts
await anvil.withSnapshot(async (client) => {
  await anvil.setBalanceEther(whale, "1000");
  await anvil.withImpersonation(whale, () =>
    client.sendTransaction({ account: whale, to: alice, value: parseEther("10") }));
  await anvil.increaseTime(7 * 24 * 3600);
  await anvil.mine();
});
```

## Fast test suites

Starting a container takes about a second; reverting a snapshot takes about a
millisecond. Start **one node per test file** and isolate tests with
`checkpoint()`, which can be restored any number of times:

```ts
let anvil: StartedAnvilContainer;
let base: { restore(): Promise<void> };

beforeAll(async () => {
  anvil = await new AnvilContainer(new AnvilOptions().logs.quiet()).start();
  // deploy fixtures here, then:
  base = await anvil.checkpoint();
});
afterEach(() => base.restore());
afterAll(() => anvil.stop());
```

- `withSnapshot(fn)` isolates a single block of code the same way.
- Jest workers run test files in parallel, each with its own node.
- Readiness is detected within ~50 ms of anvil listening; `accounts()` derives
  keys natively in milliseconds.
- `loadState` / `withLoadState` restore prepared fixtures far faster than
  replaying deployments.

## Errors

| Error | When | Fields |
|---|---|---|
| `AnvilConfigurationError` | invalid value, conflict, unmet dependency, missing host file | `flag`, `relatedFlags` |
| `AnvilStartupError` | anvil exited / not ready / Docker failure | `command`, `logs`, `cause` |

## Contributing

Scripts, the e2e suite (`pnpm test:e2e`, or `--no-docker` for local testing)
and release steps: see [CONTRIBUTING.md](./CONTRIBUTING.md).

Maintained by [Hella Labs](https://hella.website/) · MIT
