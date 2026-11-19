---
title: Test client
description: AnvilTestClient — every viem test, public and wallet action plus anvil extras, bound to the node.
---

`anvil.testClient` is an `AnvilTestClient<TAccount>`: a viem test client
(`mode: "anvil"`) with public, wallet and [anvil extra](anvil-actions.md)
actions, bound to the node's chain. No response cache, 25 ms polling, and
`eth_chainId` answered locally.

| Layer | Use it for |
|---|---|
| `anvil.testClient` | everything viem can do: test actions, reads, simulations, watchers, writes, signing |
| `anvil.cheats` | fluent chains of state changes ([cheats](cheats.md)) |
| `anvil.*` helpers | accounts with keys, receipts, snapshots, state files ([`StartedAnvilContainer`](started-anvil-container.md)) |

With a default account, actions compile without `account`.

## viem test actions

| viem action | anvil RPC | `cheats` step | Notes |
|---|---|---|---|
| `dropTransaction` | `anvil_dropTransaction` | `dropTransaction()` | |
| `dumpState` | `anvil_dumpState` | – | also `anvil.dumpState()` / `dumpStateToFile()` |
| `getAutomine` | `anvil_getAutomine` | – | also `anvil.getAutomine()` |
| `getTxpoolContent` | `txpool_content` | – | pending / queued transactions by sender and nonce |
| `getTxpoolStatus` | `txpool_status` | – | `{ pending, queued }` counts |
| `impersonateAccount` | `anvil_impersonateAccount` | `impersonate()` | also `anvil.impersonate()` / `withImpersonation()` |
| `increaseTime` | `evm_increaseTime` | `increaseTime()` | durations in `cheats` / `anvil.increaseTime()` |
| `inspectTxpool` | `txpool_inspect` | – | human-readable summary |
| `loadState` | `anvil_loadState` | `loadState()` | merges a dump; discards snapshots |
| `mine` | `anvil_mine` | `mine()` | blocks, optional interval |
| `removeBlockTimestampInterval` | `anvil_removeBlockTimestampInterval` | `removeBlockTimestampInterval()` | |
| `reset` | `anvil_reset` | `reset()` | **fixed** version, see [anvil extras](anvil-actions.md) |
| `revert` | `evm_revert` | – | **strict**: throws `SNAPSHOT_NOT_FOUND` |
| `sendUnsignedTransaction` | `eth_sendUnsignedTransaction` | – | send as any funded address |
| `setAutomine` | `evm_setAutomine` | `setAutomine()` | |
| `setBalance` | `anvil_setBalance` | `setBalance()` / `setBalanceEther()` | wei / Ether |
| `setBlockGasLimit` | `evm_setBlockGasLimit` | `setBlockGasLimit()` | |
| `setBlockTimestampInterval` | `anvil_setBlockTimestampInterval` | `setBlockTimestampInterval()` | fixed seconds between blocks |
| `setCode` | `anvil_setCode` | `setCode()` | runtime bytecode ("etch") |
| `setCoinbase` | `anvil_setCoinbase` | `setCoinbase()` | |
| `setIntervalMining` | `evm_setIntervalMining` | `setIntervalMining()` | `0` turns it off |
| `setLoggingEnabled` | `anvil_setLoggingEnabled` | `setLoggingEnabled()` | |
| `setMinGasPrice` | `anvil_setMinGasPrice` | `setMinGasPrice()` | pre-London hardforks only |
| `setNextBlockBaseFeePerGas` | `anvil_setNextBlockBaseFeePerGas` | `setNextBlockBaseFeePerGas()` | |
| `setNextBlockTimestamp` | `evm_setNextBlockTimestamp` | `setNextBlockTimestamp()` | seconds, `bigint` or `Date` in `cheats` |
| `setNonce` | `anvil_setNonce` | `setNonce()` | |
| `setRpcUrl` | `anvil_setRpcUrl` | `setRpcUrl()` | fork RPC URL |
| `setStorageAt` | `anvil_setStorageAt` | `setStorageAt()` | a `bigint` value is encoded in `cheats` |
| `snapshot` | `evm_snapshot` | – | also `anvil.snapshot()` / `checkpoint()` |
| `stopImpersonatingAccount` | `anvil_stopImpersonatingAccount` | `stopImpersonating()` | |

## Public and wallet actions

All of [viem's](https://viem.sh/docs/actions/public/introduction):
`readContract`, `simulateContract`, `multicall`, `getLogs`, `writeContract`,
`signTypedData`, …

Tasks: [Act as multiple users](../tasks/accounts/act-as-multiple-users.md),
[Configure the test client](../tasks/configure/test-client.md).
