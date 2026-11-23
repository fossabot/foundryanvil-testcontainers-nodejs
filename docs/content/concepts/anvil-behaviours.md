---
title: anvil behaviours worth knowing
description: Surprising anvil and viem behaviours found while writing the examples, and what to do about them.
---

## Reset

A bare `anvil_reset` *detaches* a forked node, and viem's `reset()` fails on a
non-forked one. The library's `reset()` returns to genesis or re-forks at the
fork block; both discard snapshots.

## Forks

A fork's hardfork follows the chain id and block: a local "mainnet" (id 1) at
block 3 gets an ancient one, so pin `evm.withHardfork()`.

## Chain id

After `setChainId()`, anvil's dev-account signer keeps the old chain id:
node-signed transactions fail; local, impersonated and unsigned ones work.

## Watchers

Watchers subscribe asynchronously with no "ready" signal: repeat the trigger
until observed. `watchBlocks` over WebSocket may report blocks out of order.

## More

| Behaviour | Consequence |
|---|---|
| Writes signed by anvil are mined even when they revert | check the receipt (`confirm()` throws) or simulate first |
| With automine, anvil returns the hash just *before* the block is committed | `confirm()` re-reads the receipt with a short backoff |
| Writes signed locally are estimated first | the revert is thrown before anything is sent |
| `--order fees` ranks pending transactions by `maxFeePerGas` | raise the fee cap, not only the tip, to be mined first |
| Reverting a snapshot keeps pending transactions | `useAnvil()` empties the pool; do it yourself around `withSnapshot()` |
| Snapshots don't restore node settings | restore them in `finally` |
| `setMinGasPrice()` is rejected while EIP-1559 is active | use a pre-London hardfork, or `setNextBlockBaseFeePerGas()` |
| Receipts carry `contractAddress` in lower case | normalise with `getAddress()` before comparing |
| Two copies of viem (e.g. `npm link`) | match errors by `name`, not `instanceof` |
| A transaction with a nonce gap waits in the *queued* pool | it is mined once the gap is filled |
| Mixed mining reports `getAutomine() === false` | transactions are still mined on arrival |
| JSON ABIs are typed as `Abi` | narrow `readContract` results, or use `parseAbiItem` |
| Every genesis `alloc` entry needs a `balance` | add `"balance": "0x0"` to contract entries |
| EIP-5792 `sendCalls`, `simulateCalls` asset tracing | not supported by anvil 1.6 |
