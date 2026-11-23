---
title: "Architecture: node, test client, cheats"
description: The three layers of a started node and how the test client is wired to it.
---

## Three layers

| Layer | Style | Use it for |
|---|---|---|
| `anvil.testClient` | viem actions, one object argument | everything viem can do, plus anvil extras |
| `anvil.cheats` | fluent chain, positional arguments, units | scripting several state changes |
| `anvil.*` helpers | methods on the node | accounts with keys, receipts, snapshots, files, lifecycle |

They share one client; mix them freely.

## How the test client is built

Once anvil answers JSON-RPC, `start()`:

1. reads the real chain id (`--chain-id`, the fork's, or 31337);
2. creates a viem test client (`mode: "anvil"`, `cacheTime: 0`, 25 ms polling);
3. adds public, wallet and [anvil extra](../reference/anvil-actions.md) actions;
4. resolves the default account (impersonates, looks up or derives it).

The `chain` follows `setChainId()` and `reset()` (also as raw requests), so
`eth_chainId` is answered locally. After `stop()`, every request rejects with
`CONTAINER_STOPPED`: a forgotten `await` fails instead of hanging.

## Typed default account

`TestClientOptions<TAccount>` → `AnvilContainer<TAccount>` →
`StartedAnvilContainer<TAccount>` → `AnvilTestClient<TAccount>`: with a
default account, actions compile without `account`.

## Why not just viem?

viem is the foundation; the library adds a node, validated configuration,
chain binding, fixed `reset` / strict `revert`, receipts that don't hang on
`--no-mining`, and isolation hooks.

Related: [Configure the test client](../tasks/configure/test-client.md),
[Script state changes](../tasks/state/script-state-changes.md).
