---
title: Reset the chain
description: Return a node to genesis (or its fork block) and discard every change.
---

`anvil.reset()` returns to genesis and discards every snapshot, so such files
opt out of per-test isolation:

```ts snippet="examples/test/e2e/fixtures-and-isolation.e2e.test.ts#no-isolation"
// reset() discards every snapshot, so this suite opts out of isolation.
const node = useAnvil(
  new AnvilContainer().withTestClient((client) => client.withAccount(0)),
  { isolation: "none" },
);
let deployed: Address;

it("deploys a token…", async () => {
  deployed = await deployToken(node.testClient);
  expect(await node.testClient.getCode({ address: deployed })).toBeDefined();
});

it("…which the next test still sees (no isolation)…", async () => {
  expect(await node.testClient.getCode({ address: deployed })).toBeDefined();
});

it("…until reset() returns the node to genesis", async () => {
  await node.reset();
  expect(await node.testClient.getBlockNumber()).toBe(0n);
  expect(
    await node.testClient.getCode({ address: deployed }),
  ).toBeUndefined();
});
```

- Forks re-fork at the fork block ([Reset a fork](../forking/reset-a-fork.md)).
- Back to a prepared state: [`checkpoint()`](isolate-tests.md) or
  [`loadState()`](../state/save-and-load-state.md).

## Deep dive

- [`reset()` vs. viem's `reset`](../../deep-dives/anvil-behaviours.md#reset)
- [How per-test isolation works](../../deep-dives/isolation.md)
