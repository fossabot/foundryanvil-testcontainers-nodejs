---
title: Isolate state inside a test
description: Try something and roll it back, restore a checkpoint repeatedly, or manage snapshots yourself.
---

`useAnvil()` already isolates tests from each other. Inside one test:

## Roll back a block of code

```ts snippet="examples/test/e2e/fixtures-and-isolation.e2e.test.ts#what-if"
const whatIf = await anvil.withSnapshot(async (client) => {
  await anvil.cheats.dealErc20(token, alice, 0n);
  return balanceOf(client, token, alice);
});
expect(whatIf).toBe(0n); // inside the snapshot
expect(await balanceOf(anvil.testClient, token, alice)).toBe(
  parseEther("100"), // reverted afterwards
);
```

## Restore the same state many times

`checkpoint()` re-arms after every `restore()`:

```ts snippet="examples/test/e2e/fixtures-and-isolation.e2e.test.ts#checkpoint"
const start = await anvil.checkpoint(); // restorable any number of times
for (const amount of [1n, 50n, 100n]) {
  await anvil.confirm(
    anvil.testClientFor(alice).writeContract({
      address: token,
      abi: exampleToken.abi,
      functionName: "transfer",
      args: [vault, parseEther(String(amount))],
    }),
  );
  expect(await balanceOf(anvil.testClient, token, vault)).toBe(
    parseEther(String(amount)),
  );
  await start.restore(); // back to the state before the transfer
}
```

## Manage snapshots yourself

Each snapshot can be reverted to once; reusing it throws `SNAPSHOT_NOT_FOUND`:

```ts snippet="examples/test/e2e/fixtures-and-isolation.e2e.test.ts#strict-snapshots"
const id = await anvil.snapshot();
await anvil.revert(id);

const error = await anvil.revert(id).catch((e: unknown) => e);
expect(error).toBeInstanceOf(AnvilTestClientError);
expect((error as AnvilTestClientError).code).toBe("SNAPSHOT_NOT_FOUND");
```

## Pending transactions

Reverting keeps pending transactions; `useAnvil()` empties the pool, elsewhere
call `anvil.cheats.dropAllTransactions()`.

```ts snippet="examples/test/e2e/mempool-and-blocks.e2e.test.ts#pool-isolation"
it("may leave transactions pending…", async () => {
  const [, alice, bob] = await anvil.addresses();
  await anvil.testClientFor(alice).sendTransaction({ to: bob });
  expect((await anvil.testClient.getTxpoolStatus()).pending).toBe(1);
});

it("…because useAnvil empties the pool between tests", async () => {
  // Reverting a snapshot alone would keep them (and mine them next block).
  expect((await anvil.testClient.getTxpoolStatus()).pending).toBe(0);
});
```

:::caution Node settings are not part of snapshots
Mining mode, impersonation, gas limit, coinbase, logging and the chain id
survive a revert: restore them in `finally`.
:::

## Concepts

- [How per-test isolation works](../../concepts/isolation.md)
- Reference: [`StartedAnvilContainer` state methods](../../reference/started-anvil-container.md#state)
