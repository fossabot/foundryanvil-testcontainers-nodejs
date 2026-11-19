---
title: anvil extras (AnvilActions)
description: anvil RPC methods viem doesn't wrap, added to the test client, plus strict reset and revert.
---

Part of `testClient`; add them to your own clients with
`client.extend(anvilActions)` ([sample](../tasks/transactions/read-contracts.md#your-own-clients)).

| Action | anvil RPC | `cheats` step | Notes |
|---|---|---|---|
| `addBalance({ address, value })` | `anvil_addBalance` | `addBalance()` | adds wei |
| `dealErc20({ token, address, amount })` | `anvil_dealERC20` | `dealErc20()` | ERC-20 balance of standard tokens |
| `setErc20Allowance({ token, owner, spender, amount })` | `anvil_setERC20Allowance` | `setErc20Allowance()` | |
| `setChainId({ chainId })` | `anvil_setChainId` | `setChainId()` | the container's `chainId`, `chain` and clients follow |
| `setTime({ timestamp })` | `evm_setTime` | `setTime()` | later blocks continue from it |
| `getIntervalMining()` | `anvil_getIntervalMining` | – | seconds, `undefined` when off |
| `setAutoImpersonate(enabled)` | `anvil_autoImpersonateAccount` | `setAutoImpersonate()` | |
| `dropAllTransactions()` | `anvil_dropAllTransactions` | `dropAllTransactions()` | |
| `removePoolTransactions({ address })` | `anvil_removePoolTransactions` | `removePoolTransactions()` | all pending transactions of a sender |
| `rollback({ depth? })` | `anvil_rollback` | `rollback()` | removes the last blocks (default 1) |
| `reorg({ depth, transactions? })` | `anvil_reorg` | – | `ReorgTransaction`: `{ transaction, block }` |
| `getNodeInfo()` | `anvil_nodeInfo` | – | `AnvilNodeInfo` |
| `getMetadata()` | `anvil_metadata` | – | `AnvilMetadata` |
| `reset(AnvilResetParameters?)` | `anvil_reset` | `reset()` | see below |
| `revert({ id })` | `evm_revert` | – | see below |
| `confirmTransaction(ConfirmTransactionParameters)` | – | – | receipt; mines first when automine is off; throws `AnvilTransactionRevertedError` unless `throwOnRevert: false` |

## `reset` and `revert` differ from viem

- **`reset()`** returns to genesis, or to the fork block on a fork (viem's
  fails, a bare `anvil_reset` detaches the fork); `{ blockNumber }` /
  `{ jsonRpcUrl }` re-fork. Discards snapshots.
- **`revert({ id })`** throws `SNAPSHOT_NOT_FOUND` for unknown or used ids
  (viem ignores anvil's `false`).

Types: `AnvilResetParameters` (`blockNumber?`, `jsonRpcUrl?`),
`ConfirmTransactionParameters` (`hash`, `throwOnRevert?`, `timeout?`),
`ReorgTransaction`, `AnvilNodeInfo`, `AnvilMetadata`.

Anything else: [`anvil.rpc(method, params)`](../tasks/debugging/call-any-rpc-method.md).
