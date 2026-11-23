---
title: Call any RPC method
description: Reach RPC methods without a viem action, such as Otterscan's or debug and trace methods.
---

```ts snippet="examples/test/e2e/debugging-and-tracing.e2e.test.ts#raw-rpc"
const { creator } = await anvil.rpc<{ hash: Hash; creator: Address }>(
  "ots_getContractCreator",
  [token],
);
expect(creator.toLowerCase()).toBe(deployer.toLowerCase());
```

`anvil.rpc<T>(method, params)` sends a raw JSON-RPC request through the
test client (its retries and stop guard included). Type the result with
`T`.

For anvil methods the library wraps, prefer the typed actions: see
[anvil extras](../../reference/anvil-actions.md).

## Concepts

- [Architecture: how requests reach the node](../../concepts/architecture.md)
- Reference: [`rpc()`](../../reference/started-anvil-container.md#connection)
