---
title: Isolation and snapshots
description: What per-test isolation restores, what it doesn't, and why snapshots are strict.
---

## Per-test isolation

With `useAnvil()` (default `isolation: "test"`):

1. `beforeAll`: start, `setup`, baseline `checkpoint()`;
2. `afterEach`: drop pending transactions, restore the baseline;
3. `afterAll`: stop.

A restore takes milliseconds; a new node, about a second.

## What a snapshot restores

| Restored (chain state) | Not restored (node settings) |
|---|---|
| balances, code, storage, nonces | automine / interval mining |
| blocks and block numbers | impersonation, auto-impersonation |
| the clock (block timestamps) | block gas limit, coinbase |
| | logging, block timestamp interval, chain id |

Restore changed settings in `finally`. Reverting also keeps **pending
transactions**: `useAnvil()` empties the pool; around `withSnapshot()` /
`checkpoint()`, call `cheats.dropAllTransactions()` yourself.

## Strict snapshots

A snapshot can be reverted to once. anvil answers `false` for unknown or used
ids, which viem ignores; the library throws `SNAPSHOT_NOT_FOUND` instead.
`checkpoint()` re-snapshots after each restore.

`reset()` and `loadState()` discard every snapshot: use `isolation: "none"` in
files that call them.

| Need | API |
|---|---|
| isolate every test | `useAnvil()` default, or `checkpoint()` + `afterEach(() => base.restore())` |
| isolate a block of code | `withSnapshot(async (client) => …)` |
| back to genesis / the fork block | `reset()` (use `isolation: "none"`) |
| fixtures | `setup`, `loadStateFromFile()`, `state.withLoadState()` |

Related: [Share a node](../tasks/test-suites/share-a-node.md),
[Isolate state inside a test](../tasks/test-suites/isolate-tests.md).
