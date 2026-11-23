---
title: Limit history and memory
description: Keep long-running nodes lean by pruning history and forgetting old transactions.
---

anvil keeps every state and transaction by default; trim them for long runs.

## Keep only the latest state

`state.withPruneHistory()` drops historical states (queries at old blocks
fail):

```ts snippet="examples/test/e2e/node-configuration.e2e.test.ts#history"
// Long-running suites: keep only the latest state in memory.
const pruned = useAnvil(
  new AnvilContainer(new AnvilOptions().state.withPruneHistory()),
  { isolation: "none" },
);
// Start at a mainnet-like height.
const tall = useAnvil(
  new AnvilContainer(new AnvilOptions().mining.withBlockNumber(20_000_000)),
);

it("answers historical queries only without pruning", async () => {
  const [alice] = await pruned.addresses();
  await pruned.cheats.setBalanceEther(alice, 1).mine(3);
  await expect(
    pruned.testClient.getBalance({ address: alice, blockNumber: 1n }),
  ).rejects.toThrow(/block height/);
  expect(await pruned.getBalance(alice)).toBe(parseEther("1"));
});

it("starts at the configured block number", async () => {
  expect(await tall.testClient.getBlockNumber()).toBe(20_000_000n);
});
```

## Forget old transactions

```ts snippet="examples/test/e2e/node-configuration.e2e.test.ts#transaction-keeper"
// Keep transactions of the latest block only: older ones are forgotten.
const forgetful = useAnvil(
  new AnvilContainer(
    new AnvilOptions().state.withTransactionBlockKeeper(1),
  ).withTestClient((client) => client.withAccount(0)),
);

it("forgets transactions of older blocks", async () => {
  const [, bob] = await forgetful.addresses();
  const { transactionHash: hash } = await forgetful.confirm(
    forgetful.testClient.sendTransaction({ to: bob, value: 1n }),
  );
  expect(await forgetful.testClient.getTransaction({ hash })).toBeDefined();

  await forgetful.mine(2);
  await expect(
    forgetful.testClient.getTransaction({ hash }),
  ).rejects.toThrow(/could not be found/);
});
```

## Bound states on disk

```ts snippet="examples/test/unit/options.test.ts#history-limits"
// Long-running nodes: keep at most 5 states on disk…
const bounded = new AnvilOptions().state.withMaxPersistedStates(5);
expect(bounded.toCommand()).toContain("--max-persisted-states 5");

// …or prune history instead: the two are mutually exclusive.
expect(() => bounded.state.withPruneHistory()).toThrow(
  AnvilConfigurationError,
);
```

## Concepts

- Reference: [`.state` options](../../reference/anvil-options.md#state)
