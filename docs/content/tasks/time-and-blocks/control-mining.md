---
title: Control mining
description: Mine on demand, on an interval, on every transaction, or a mix — and switch at runtime.
---

anvil mines a block per transaction by default (automine).

## On demand only

```ts snippet="examples/test/e2e/mempool-and-blocks.e2e.test.ts#no-mining"
// Blocks are only mined on demand (anvil --no-mining). confirm() and the
// deploy fixtures mine a block when a transaction is still pending.
const anvil = useAnvil(
  new AnvilContainer(new AnvilOptions().mining.withNoMining()).withTestClient(
    (client) => client.withAccount(0),
  ),
  {
    setup: async (node) => {
      const [, alice] = await node.addresses();
      token = await deployToken(node.testClient);
      await mint(node.testClient, token, alice, parseEther("100"));
    },
  },
);
```

`confirm()` mines a block for you when a transaction is still pending.

## Toggle automine at runtime

```ts snippet="examples/test/e2e/mempool-and-blocks.e2e.test.ts#automine-toggle"
const hash = await anvil.testClientFor(alice).sendTransaction({
  to: bob,
  value: 5n,
});
const { pending } = await anvil.testClient.inspectTxpool();
expect(JSON.stringify(pending)).toMatch(/5 wei \+ 21000 gas/);

await anvil.cheats.setAutomine(true); // mines everything pending…
try {
  expect(
    (await anvil.testClient.getTransactionReceipt({ hash })).status,
  ).toBe("success");
  expect(await anvil.testClient.getAutomine()).toBe(true);
} finally {
  await anvil.cheats.setAutomine(false); // …and back to on-demand mining
}
```

## On an interval

```ts snippet="examples/test/e2e/time-travel.e2e.test.ts#interval-mining"
const GENESIS = new Date("2030-06-01T00:00:00Z");
const node = useAnvil(
  new AnvilContainer(
    new AnvilOptions().mining
      .withBlockTime(1) // a block every second, like a real chain
      .state.withTimestamp(GENESIS),
  ),
  { isolation: "none" },
);

it("starts at the configured genesis time and mines on its own", async () => {
  const genesis = await node.testClient.getBlock({ blockNumber: 0n });
  expect(genesis.timestamp).toBe(BigInt(GENESIS.getTime() / 1000));
  expect(await node.testClient.getIntervalMining()).toBe(1);

  const start = await node.testClient.getBlockNumber();
  await waitFor(async () => (await node.testClient.getBlockNumber()) > start);
});

it("stops and restarts interval mining at runtime", async () => {
  await node.cheats.setIntervalMining(0); // off: blocks only on demand
  expect(await node.testClient.getIntervalMining()).toBeUndefined();
  const height = await node.testClient.getBlockNumber();
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  expect(await node.testClient.getBlockNumber()).toBe(height);

  await node.cheats.setIntervalMining(1);
  await waitFor(
    async () => (await node.testClient.getBlockNumber()) > height,
  );
});
```

## Interval and automine together

```ts snippet="examples/test/e2e/time-travel.e2e.test.ts#mixed-mining"
// Transactions are mined at once (automine) AND a block comes every second.
const node = useAnvil(
  new AnvilContainer(
    new AnvilOptions().mining.withBlockTime(1).withMixedMining(),
  ),
  { isolation: "none" },
);

it("mines transactions on arrival while time keeps producing blocks", async () => {
  const [alice, bob] = await node.addresses();
  const hash = await node.testClient.sendTransaction({
    account: alice,
    to: bob,
    value: 1n,
  });
  // No explicit mine(): automine picks the transaction up.
  const receipt = await node.testClient.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");

  const height = await node.testClient.getBlockNumber();
  await waitFor(
    async () => (await node.testClient.getBlockNumber()) > height,
  );
});
```

| Mode | Option | Runtime |
|---|---|---|
| automine (default) | `mining.withAutoMining()` | `setAutomine(true)` |
| on demand | `mining.withNoMining()` | `setAutomine(false)` + `mine()` |
| interval | `mining.withBlockTime(seconds)` | `setIntervalMining(seconds)`, `0` stops it |
| mixed | `mining.withBlockTime(s).withMixedMining()` | – |

Mining settings are node settings: snapshots do not restore them.

## Concepts

- [How per-test isolation works](../../concepts/isolation.md)
- [anvil behaviours worth knowing](../../concepts/anvil-behaviours.md)
