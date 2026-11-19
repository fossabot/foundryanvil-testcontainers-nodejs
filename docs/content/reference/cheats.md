---
title: Cheats (AnvilCheats)
description: Every step of the fluent, awaitable cheats chain.
---

Each `anvil.cheats` starts a chain: steps are validated when added and run in
order, once, when awaited. A failing step rejects with `CHEAT_FAILED`.

```ts snippet="examples/test/e2e/cheats.e2e.test.ts#cheat-plan"
const chain = anvil.cheats.setBalanceEther(ALICE, 1.5).mine(2);
expect(chain.plan).toEqual([`setBalanceEther(${ALICE}, 1.5)`, "mine(2)"]);

await chain.run(); // same as `await chain`; a chain runs once
expect(await anvil.getBalance(ALICE)).toBe(parseEther("1.5"));
```

| Step | anvil RPC | Arguments |
|---|---|---|
| `setBalance(address, wei)` | `anvil_setBalance` | |
| `setBalanceEther(address, ether)` | `anvil_setBalance` | `"1.5"` or `100` |
| `addBalance(address, wei)` | `anvil_addBalance` | |
| `dealErc20(token, address, amount)` | `anvil_dealERC20` | token units |
| `setErc20Allowance(token, owner, spender, amount)` | `anvil_setERC20Allowance` | |
| `setCode(address, bytecode)` | `anvil_setCode` | runtime code; `"0x"` removes it |
| `setNonce(address, nonce)` | `anvil_setNonce` | |
| `setStorageAt(address, slot, value)` | `anvil_setStorageAt` | slot number or hex; `bigint` value encoded to 32 bytes |
| `impersonate(address)` / `stopImpersonating(address)` | `anvil_impersonateAccount` / `anvil_stopImpersonatingAccount` | |
| `setAutoImpersonate(enabled)` | `anvil_autoImpersonateAccount` | |
| `mine(blocks?, interval?)` | `anvil_mine` | default 1 block |
| `setAutomine(enabled)` | `evm_setAutomine` | |
| `setIntervalMining(duration)` | `evm_setIntervalMining` | `0` stops it |
| `increaseTime(duration)` | `evm_increaseTime` | |
| `setNextBlockTimestamp(timestamp)` | `evm_setNextBlockTimestamp` | |
| `setTime(timestamp)` | `evm_setTime` | |
| `setBlockTimestampInterval(duration)` / `removeBlockTimestampInterval()` | `anvil_setBlockTimestampInterval` / `anvil_removeBlockTimestampInterval` | |
| `setCoinbase(address)` | `anvil_setCoinbase` | |
| `setMinGasPrice(wei)` | `anvil_setMinGasPrice` | pre-London only |
| `setNextBlockBaseFeePerGas(wei)` | `anvil_setNextBlockBaseFeePerGas` | |
| `setBlockGasLimit(gas)` | `evm_setBlockGasLimit` | |
| `dropTransaction(hash)` / `dropAllTransactions()` | `anvil_dropTransaction` / `anvil_dropAllTransactions` | |
| `removePoolTransactions(address)` | `anvil_removePoolTransactions` | |
| `setChainId(chainId)` | `anvil_setChainId` | the container follows |
| `setRpcUrl(url)` | `anvil_setRpcUrl` | fork RPC URL |
| `setLoggingEnabled(enabled)` | `anvil_setLoggingEnabled` | |
| `reset(options?)` | `anvil_reset` | fixed version; clears snapshots |
| `rollback(depth?)` | `anvil_rollback` | default 1 |
| `loadState(state)` | `anvil_loadState` | |
| `step(fn, label?)` | – | any `(client) => Promise` between cheats |

| Execution | Description |
|---|---|
| `plan` | labels of the queued steps, e.g. `["mine(2)"]` |
| `run()` | runs the steps; later calls return the same promise |
| `then()` / `catch()` / `finally()` | a chain is a full promise (`PromiseLike<void>`) |

Durations: seconds or `{ weeks, days, hours, minutes, seconds }`;
timestamps: seconds or a `Date`.

Task: [Script state changes](../tasks/state/script-state-changes.md).
