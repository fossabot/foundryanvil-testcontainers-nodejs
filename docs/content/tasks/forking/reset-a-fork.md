---
title: Reset or move a fork
description: Discard local changes, move to another block, or switch the upstream endpoint.
---

`reset()` on a forked node re-forks at its fork block, discarding local changes.

## Back to the fork block

```ts snippet="examples/test/e2e/forking.e2e.test.ts#fork-reset"
await fork.cheats.dealErc20(token, HOLDER, 0n).mine(10);

await fork.reset();

expect(await fork.testClient.getBlockNumber()).toBe(forkBlock);
expect(await balanceOf(fork.testClient, token, HOLDER)).toBe(
  parseEther("1000000"),
);
```

## Another block

```ts snippet="examples/test/e2e/forking.e2e.test.ts#fork-move"
await fork.reset({ blockNumber: forkBlock + 1n });

expect(await balanceOf(fork.testClient, token, HOLDER)).toBe(
  parseEther("1000000") + 1n, // now includes the later mint
);
```

`reset({ jsonRpcUrl })` re-forks from another URL.

## Another endpoint

```ts snippet="examples/test/e2e/forking.e2e.test.ts#set-rpc-url"
const backup = network.urlOf(mainnet, "mainnet-backup");
await fork.cheats.setRpcUrl(backup); // e.g. fail over to another provider

expect((await fork.nodeInfo()).forkConfig.forkUrl).toBe(backup);
await fork.reset(); // re-forks through the new endpoint
expect(await balanceOf(fork.testClient, token, HOLDER)).toBe(
  parseEther("1000000"),
);
```

`reset()` discards snapshots: don't combine it with `useAnvil()`'s per-test
isolation in one file ([Reset the chain](../test-suites/reset-the-chain.md)).

## Concepts

- [`reset()` vs. viem's `reset`](../../concepts/anvil-behaviours.md#reset)
