---
slug: /
title: Introduction
description: Real anvil nodes for Node.js tests, configured through a type-safe API, with a pre-configured viem test client.
---

A [Foundry Anvil](https://getfoundry.sh/anvil/overview) node in Docker per
test file, with a [viem](https://viem.sh) test client already bound to it.

- **Every anvil flag**, validated as you set it.
- **One client for everything**: viem's test, public and wallet actions,
  anvil extras and fluent `cheats`.
- **Per-test isolation in milliseconds** with snapshots.

New here? Start with the [quick start](get-started/quick-start.md).

## Find your task

| I want to… | Go to |
|---|---|
| Start a node per test file and reset it between tests | [Share a node](tasks/test-suites/share-a-node.md), [Isolate tests](tasks/test-suites/isolate-tests.md) |
| Use, fund or impersonate accounts | [Accounts and signing](tasks/accounts/use-dev-accounts.md) |
| Send transactions, assert reverts, simulate | [Transactions and contracts](tasks/transactions/send-transactions.md) |
| Move time, control mining and block contents | [Time and blocks](tasks/time-and-blocks/travel-in-time.md) |
| Mock contracts, save or load state, boot from genesis | [State and mocks](tasks/state/mock-contracts.md) |
| Test against mainnet state | [Forking](tasks/forking/fork-a-chain.md) |
| React to events | [Events](tasks/events/watch-events.md) |
| Configure the chain, EVM, RPC server, logs or client | [Configure the node](tasks/configure/chain.md) |
| Find out why something failed | [Debug](tasks/debugging/trace-transactions.md) |
| Look up a method, flag or error | [Reference](reference/index.md) |
| Understand how it works | [Concepts](concepts/index.md) |

## How to read the samples

Every sample is a tested `#region` of
[`examples/`](https://github.com/hella-labs/foundryanvil-testcontainers-nodejs/tree/main/examples),
linked under the sample.

- `anvil` (or `node`, `fork`…) is a started node, usually from
  [`useAnvil()`](tasks/test-suites/share-a-node.md).
- `expect` and `it` are Jest's; any runner works.
- `deployToken`, `mint`, `balanceOf`, `exampleToken`, `expectRevert` and
  `triggerUntil` are helpers from
  [`examples/src`](https://github.com/hella-labs/foundryanvil-testcontainers-nodejs/tree/main/examples/src).
