---
slug: /reference
title: API reference
description: Every class, method, flag, error and export of the library.
---

| API | What it is |
|---|---|
| [`AnvilOptions`](anvil-options.md) | fluent, validated configuration of every anvil flag, in groups (`.account`, `.evm`, `.fork`, `.mining`, `.logs`, `.network`, `.server`, `.state`) |
| [Flag rules](flag-rules.md) | conflicts and dependencies between flags |
| [`AnvilContainer`](anvil-container.md) | the Testcontainers module: options + test client settings → a started node |
| [`StartedAnvilContainer`](started-anvil-container.md) | a running node: test client, cheats, account/transaction/time/state helpers |
| [Test client](test-client.md) | `AnvilTestClient`: every viem test, public and wallet action, bound to the node |
| [anvil extras](anvil-actions.md) | `AnvilActions`: anvil RPC methods viem doesn't wrap, strict `reset` / `revert` |
| [Cheats](cheats.md) | `AnvilCheats`: fluent, awaitable chains of state changes |
| [`TestClientOptions`](test-client-options.md) | transport, polling, retries, batching, default account, chain metadata |
| [`useAnvil()`](use-anvil.md) | test lifecycle hooks with per-test isolation |
| [Errors](errors.md) | error classes and `AnvilTestClientError` codes |
| [Exports](exports.md) | functions, enums, constants and types |

Code samples for every member are on the [task pages](../intro.md); tables
marked *generated* are produced from the library itself by `pnpm docs:sync`.
