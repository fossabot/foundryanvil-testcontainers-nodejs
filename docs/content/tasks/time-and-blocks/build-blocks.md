---
title: Control block contents
description: Put several transactions in one block, control ordering and fees, and edit the mempool.
---

These samples run on a node with `mining.withNoMining()`.

## Several transactions in one block

```ts snippet="examples/test/e2e/mempool-and-blocks.e2e.test.ts#one-block"
const hashes: Hash[] = [];
for (const amount of [1n, 2n, 3n]) {
  hashes.push(
    await asAlice.writeContract({
      address: token,
      abi: exampleToken.abi,
      functionName: "transfer",
      args: [bob, parseEther(String(amount))],
    }),
  );
}
expect(await anvil.testClient.getTxpoolStatus()).toEqual({
  pending: 3,
  queued: 0,
});

await anvil.mine();
const receipts = await Promise.all(
  hashes.map((hash) => anvil.confirm(hash)),
);
expect(new Set(receipts.map((r) => r.blockNumber)).size).toBe(1);
```

## Ordering

By fee (default, `--order fees`): anvil ranks by `maxFeePerGas`.

```ts snippet="examples/test/e2e/mempool-and-blocks.e2e.test.ts#fee-order"
// anvil ranks pending transactions by their fee cap (maxFeePerGas).
const cheap = await anvil.testClientFor(alice).sendTransaction({
  to: bob,
  maxFeePerGas: parseGwei("20"),
  maxPriorityFeePerGas: parseGwei("1"),
});
const generous = await anvil.testClientFor(bob).sendTransaction({
  to: alice,
  maxFeePerGas: parseGwei("200"),
  maxPriorityFeePerGas: parseGwei("2"),
});
await anvil.mine();

const block = await anvil.testClient.getBlock();
expect(block.transactions).toEqual([generous, cheap]); // sent later, mined first
```

By arrival (`state.withOrder(Order.Fifo)`):

```ts snippet="examples/test/e2e/mempool-and-blocks.e2e.test.ts#fifo"
const node = useAnvil(
  new AnvilContainer(
    new AnvilOptions().mining.withNoMining().state.withOrder(Order.Fifo),
  ),
);

it("mines in arrival order regardless of fees", async () => {
  const [alice, bob] = await node.addresses();
  const cheap = await node.testClientFor(alice).sendTransaction({
    to: bob,
    maxFeePerGas: parseGwei("20"),
    maxPriorityFeePerGas: parseGwei("1"),
  });
  const generous = await node.testClientFor(bob).sendTransaction({
    to: alice,
    maxFeePerGas: parseGwei("200"),
    maxPriorityFeePerGas: parseGwei("2"),
  });
  await node.mine();
  expect((await node.testClient.getBlock()).transactions).toEqual([
    cheap,
    generous,
  ]);
});
```

## Inspect and edit the mempool

```ts snippet="examples/test/e2e/mempool-and-blocks.e2e.test.ts#txpool"
const first = await anvil.testClientFor(alice).sendTransaction({ to: bob });
await anvil.testClientFor(bob).sendTransaction({ to: alice });

const { pending } = await anvil.testClient.getTxpoolContent();
expect(Object.keys(pending)).toHaveLength(2); // two senders

await anvil.cheats.dropTransaction(first); // alice's is gone…
await anvil.cheats.removePoolTransactions(bob); // …and everything from bob
expect(await anvil.testClient.getTxpoolStatus()).toEqual({
  pending: 0,
  queued: 0,
});

await anvil.testClientFor(alice).sendTransaction({ to: bob });
await anvil.cheats.dropAllTransactions(); // or clear the pool at once
expect((await anvil.testClient.getTxpoolStatus()).pending).toBe(0);
```

## Block gas limit

```ts snippet="examples/test/e2e/mempool-and-blocks.e2e.test.ts#gas-limit"
await anvil.cheats.setBlockGasLimit(50_000n); // room for two 21k transfers
try {
  for (let i = 0; i < 3; i++) {
    await anvil.testClientFor(alice).sendTransaction({ to: bob });
  }
  await anvil.mine();
  expect((await anvil.testClient.getBlock()).transactions).toHaveLength(2);
  expect((await anvil.testClient.getTxpoolStatus()).pending).toBe(1);
} finally {
  await anvil.cheats.setBlockGasLimit(30_000_000n); // node setting: restore
}
await anvil.mine();
expect((await anvil.testClient.getBlock()).transactions).toHaveLength(1);
```

## Base fee and coinbase

```ts snippet="examples/test/e2e/mempool-and-blocks.e2e.test.ts#fees"
await anvil.cheats
  .setCoinbase(BUILDER)
  .setNextBlockBaseFeePerGas(parseGwei("10"));
try {
  const hash = await anvil.testClientFor(alice).sendTransaction({
    to: bob,
    maxFeePerGas: parseGwei("20"),
    maxPriorityFeePerGas: parseGwei("2"),
  });
  await anvil.mine();
  const receipt = await anvil.confirm(hash);

  expect((await anvil.testClient.getBlock()).baseFeePerGas).toBe(
    parseGwei("10"),
  );
  expect(receipt.effectiveGasPrice).toBe(parseGwei("12")); // base fee + tip
  // The base fee is burned; the coinbase earns only the tip.
  expect(await anvil.getBalance(BUILDER)).toBe(
    parseGwei("2") * receipt.gasUsed,
  );
} finally {
  await anvil.cheats.setCoinbase(miner); // node setting: restore
}
```

## Legacy gas pricing

`setMinGasPrice()` works on pre-London hardforks only:

```ts snippet="examples/test/e2e/mempool-and-blocks.e2e.test.ts#legacy-gas"
const node = useAnvil(
  new AnvilContainer(new AnvilOptions().evm.withHardfork(Hardfork.Berlin)),
);

it("sets the gas price the node suggests", async () => {
  const [alice, bob] = await node.addresses();
  await node.cheats.setMinGasPrice(parseGwei("5"));
  expect(await node.testClient.getGasPrice()).toBe(parseGwei("5"));

  const receipt = await node.confirm(
    node.testClient.sendTransaction({
      account: alice,
      to: bob,
      gasPrice: await node.testClient.getGasPrice(), // explicit on pre-London chains
    }),
  );
  expect(receipt.type).toBe("legacy");
  expect(receipt.effectiveGasPrice).toBe(parseGwei("5"));
});
```

## Deep dive

- [anvil behaviours worth knowing](../../deep-dives/anvil-behaviours.md)
- [Control mining](control-mining.md)
