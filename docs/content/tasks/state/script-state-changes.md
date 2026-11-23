---
title: Script state changes
description: Chain cheats fluently, inspect the plan, and read step failures.
---

`anvil.cheats` queues steps and runs them in order when awaited:

```ts snippet="examples/test/e2e/whales-and-impersonation.e2e.test.ts#cheat-chain"
await anvil.cheats
  .setBalanceEther(WHALE, 1)
  .dealErc20(token, WHALE, parseEther("10"))
  .impersonate(WHALE)
  .step(
    (client) =>
      client.writeContract({
        account: WHALE,
        address: token,
        abi: exampleToken.abi,
        functionName: "transfer",
        args: [alice, parseEther("10")],
      }),
    "whale pays alice", // label used in error messages
  )
  .stopImpersonating(WHALE)
  .mine();
```

`step(fn, label?)` inserts any client call between cheats.

## Inspect and run a chain

```ts snippet="examples/test/e2e/cheats.e2e.test.ts#cheat-plan"
const chain = anvil.cheats.setBalanceEther(ALICE, 1.5).mine(2);
expect(chain.plan).toEqual([`setBalanceEther(${ALICE}, 1.5)`, "mine(2)"]);

await chain.run(); // same as `await chain`; a chain runs once
expect(await anvil.getBalance(ALICE)).toBe(parseEther("1.5"));
```

## Step failures

A failing step rejects with `CHEAT_FAILED`, naming the step; the rest are skipped:

```ts snippet="examples/test/e2e/cheats.e2e.test.ts#cheat-errors"
const error = await anvil.cheats
  .mine()
  .setMinGasPrice(parseGwei("1")) // rejected while EIP-1559 is active
  .mine()
  .catch((e: unknown) => e);

expect(error).toBeInstanceOf(AnvilTestClientError);
expect((error as AnvilTestClientError).code).toBe("CHEAT_FAILED");
expect((error as Error).message).toMatch(
  /step 2\/3 setMinGasPrice\(1000000000n\) failed: .*\(steps 1–1 were applied\)/,
);
```

A chain runs once (`CHEATS_ALREADY_RUN`):

```ts snippet="examples/test/e2e/cheats.e2e.test.ts#cheat-once"
const chain = anvil.cheats.mine();
await chain.finally(() => undefined); // then / catch / finally run it too
expect(() => chain.mine()).toThrow(
  /cheats chain that has already run; start a new chain/, // CHEATS_ALREADY_RUN
);
```

## Concepts

- [Architecture: node, test client, cheats](../../concepts/architecture.md)
- Reference: [every cheats step](../../reference/cheats.md)
