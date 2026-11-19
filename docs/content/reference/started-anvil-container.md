---
title: StartedAnvilContainer
description: A running node with its pre-configured test client and helpers.
---

Returned by `AnvilContainer.start()` (and proxied by `useAnvil()`).
`StartedAnvilContainer<TAccount>` extends Testcontainers'
`AbstractStartedContainer` (`getHost()`, `getMappedPort()`, …).

## Test client

| Member | Description |
|---|---|
| `testClient` | the [test client](test-client.md) (alias: `client`) |
| `cheats` | a new [cheats](cheats.md) chain on `testClient` |
| `testClientFor(account)` | a client with the same settings acting as an address (anvil signs) or a viem `LocalAccount` (`TestClientAccountInput`) |
| `createTestClient(options)` | a client with its own [`TestClientOptions`](test-client-options.md), validated against the node |
| `testClientConfiguration` | the test client settings in effect |

## Connection

| Member | Description |
|---|---|
| `rpcUrl` / `wsUrl` | HTTP / WebSocket JSON-RPC URLs reachable from the host |
| `chainId` / `chain` | chain id (follows `setChainId()`) and a viem `Chain` for your own clients |
| `configuration` | the `AnvilConfiguration` anvil was started with |
| `rpc(method, params?)` | raw JSON-RPC request |

## Accounts

| Member | Description |
|---|---|
| `addresses()` | dev account addresses (`eth_accounts`), checksummed |
| `accounts()` | `AnvilAccount[]`: `index`, `address`, `privateKey` when known |
| `getBalance(address)` | balance in wei |
| `setBalance(address, wei)` / `setBalanceEther(address, ether)` | `anvil_setBalance` |
| `impersonate(address)` / `stopImpersonating(address)` | `anvil_impersonateAccount` / `anvil_stopImpersonatingAccount` |
| `withImpersonation(address, fn)` | runs `fn(client)` while impersonating; always stops |
| `setAutoImpersonate(enabled)` | `anvil_autoImpersonateAccount` |

## Transactions

| Member | Description |
|---|---|
| `confirm(hash \| Promise<hash>, { throwOnRevert?, timeout? })` | receipt; mines first when automine is off; throws `AnvilTransactionRevertedError` |
| `sendEthTransaction(from, to, ether)` | sends Ether (decimal string) and returns the receipt |
| `deployContract(abi, bytecode, from, args?)` | deploys and returns the receipt (`contractAddress`) |

## Mining and time

| Member | Description |
|---|---|
| `mine(blocks?, interval?)` | `anvil_mine` |
| `getAutomine()` / `setAutomine(enabled)` | `anvil_getAutomine` / `evm_setAutomine` |
| `setIntervalMining(duration)` | `evm_setIntervalMining`; `0` stops it |
| `increaseTime(duration)` | `evm_increaseTime`; resolves to the total offset in seconds |
| `setNextBlockTimestamp(timestamp)` | `evm_setNextBlockTimestamp` |
| `latestTimestamp()` | timestamp of the latest block |

## Fees and limits

| Member | Description |
|---|---|
| `setMinGasPrice(wei)` | `anvil_setMinGasPrice` (pre-London hardforks only) |
| `setNextBlockBaseFeePerGas(wei)` | `anvil_setNextBlockBaseFeePerGas` |
| `setBlockGasLimit(gas)` | `evm_setBlockGasLimit` |

## State

| Member | Description |
|---|---|
| `snapshot()` / `revert(id)` | `evm_snapshot` / strict `evm_revert` (`SNAPSHOT_NOT_FOUND`) |
| `withSnapshot(fn)` | runs `fn(client)` on a snapshot and always reverts |
| `checkpoint()` | `AnvilCheckpoint`: `{ id, restore() }`, restorable any number of times |
| `reset(options?)` | fixed `anvil_reset` ([anvil extras](anvil-actions.md)); discards snapshots |
| `dumpState()` / `loadState(hex)` | `anvil_dumpState` / `anvil_loadState` |
| `dumpStateToFile(path)` / `loadStateFromFile(path)` | the `--load-state` JSON format, host paths |

## Diagnostics

| Member | Description |
|---|---|
| `nodeInfo()` / `metadata()` | `anvil_nodeInfo` / `anvil_metadata` |
| `setLoggingEnabled(enabled)` | `anvil_setLoggingEnabled` |
| `logText(tail?)` | anvil's output so far |

## Artifacts

| Member | Description |
|---|---|
| `contractAbi(location)` / `contractBytecode(location)` | loaders relative to `withArtifactsDir()` |

## Lifecycle

| Member | Description |
|---|---|
| `stop(options?)` | stops; with a state dump configured, gracefully (`DEFAULT_GRACEFUL_STOP_TIMEOUT_MS`) and copies it to the host; closes WebSockets |
| `isStopped` | `true` after `stop()`; clients then reject with `CONTAINER_STOPPED` |
| `removeStoppedContainer()` | *protected*: removes a container stopped with `remove: false`; override for non-Docker runtimes |

Durations: seconds or `{ weeks, days, hours, minutes, seconds }`; timestamps:
seconds or a `Date` ([`Duration`, `Timestamp`](exports.md#types)).
