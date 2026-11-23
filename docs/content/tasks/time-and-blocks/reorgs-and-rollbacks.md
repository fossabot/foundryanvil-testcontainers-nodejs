---
title: Simulate reorgs and rollbacks
description: Replace or remove recent blocks to test confirmation and reorg handling.
---

`reorg()` replaces the last blocks, `rollback()` removes them.

## Reorg: a confirmed transaction disappears

```ts snippet="examples/test/e2e/chain-config-and-reorgs.e2e.test.ts#reorg"
const receipt = await anvil.confirm(
  anvil.testClient.sendTransaction({ to: alice, value: parseEther("1") }),
);
await anvil.mine(2); // 3 confirmations

// Replace the last 3 blocks with empty ones: the transaction disappears.
await anvil.testClient.reorg({ depth: 3 });

expect(await anvil.testClient.getBlockNumber()).toBe(
  receipt.blockNumber + 2n, // same height, different blocks
);
await expect(
  anvil.testClient.getTransactionReceipt({ hash: receipt.transactionHash }),
).rejects.toThrow(/could not be found/);
```

## Reorg with different transactions

```ts snippet="examples/test/e2e/chain-config-and-reorgs.e2e.test.ts#reorg-replace"
// The new last block contains a payment to bob that never happened before.
await anvil.testClient.reorg({
  depth: 1,
  transactions: [
    {
      transaction: { from: deployer, to: bob, value: parseEther("5") },
      block: 0,
    },
  ],
});
expect(await anvil.getBalance(bob)).toBe(before + parseEther("5"));
```

Each `transactions` entry is a request (from an unlocked or impersonated
account) or a signed raw transaction, placed in the `block`-th new block.

## Roll back the tip

```ts snippet="examples/test/e2e/chain-config-and-reorgs.e2e.test.ts#rollback"
const height = await anvil.testClient.getBlockNumber();
await anvil.mine(5);

await anvil.cheats.rollback(5); // remove the last 5 blocks (default 1)
expect(await anvil.testClient.getBlockNumber()).toBe(height);

await anvil.mine();
await anvil.testClient.rollback(); // the same as a test client action
expect(await anvil.testClient.getBlockNumber()).toBe(height);
```

## Concepts

- Reference: [anvil extras](../../reference/anvil-actions.md)
