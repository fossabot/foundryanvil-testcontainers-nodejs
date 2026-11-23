---
title: "Performance: fast suites"
description: Where a test suite's time goes, what the library optimises, and how to keep suites fast.
---

## Where the time goes

| Per… | Operation | Typical cost (local anvil) |
|---|---|---|
| Jest worker | first import of viem + Testcontainers | ~1.5 s |
| test file | importing the library again | ~50–80 ms |
| test file | start a node | ~0.1 s, plus container start with Docker |
| test | per-test isolation (`useAnvil`) | ~4 ms |
| transaction | node-signed send | ~3.5 ms |
| transaction | `confirm()` (send + receipt) | ~5 ms |
| event | HTTP watcher sees a new block | ~one polling interval (25 ms) |

A new node costs about a hundred restores: start one per file, isolate tests
with snapshots.

## What the library optimises

- **Receipts:** `confirm()` re-reads right away, then with a 1 ms backoff
  (anvil returns an automined hash just before committing the block).
- **Chain id:** answered locally; viem asks before every node-signed send.
- **Isolation:** the mempool is emptied while the snapshot is restored.
- **Keys:** the default mnemonic's keys are built in; others are derived once.
- **Startup:** readiness is probed every 10 ms.
- **Polling:** every 25 ms.

Measure with `pnpm bench` (see CONTRIBUTING).

## Keep your suite fast

- **Deploy fixtures once** in `setup`, not in `beforeEach`.
- **Save expensive state** (`dumpStateToFile()`) and boot from it
  (`state.withLoadState()`) instead of replaying deployments.
- **Fewer, larger test files**: fewer node starts.
- **Run files in parallel**: each Jest worker gets its own node.
- **Batch reads**: `multicall` (even `deployless`) or `withBatch()`.
- **`*Sync` actions** (`writeContractSync`, `sendTransactionSync`) return the
  receipt in one request.
- **Don't sleep** in watcher tests: trigger until observed (`triggerUntil`).
- **Lower `withPollingInterval()`** for suites waiting on HTTP watchers, or use
  WebSockets.

Related: [Share a node](../tasks/test-suites/share-a-node.md),
[Save and load chain state](../tasks/state/save-and-load-state.md).
