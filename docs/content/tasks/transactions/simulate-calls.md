---
title: Simulate before sending
description: Check results without changing state — single calls, call sequences, multi-block stories and overrides.
---

Simulate with viem: results come back, nothing is written.

## Simulate, then send exactly that

```ts snippet="examples/test/e2e/multi-actor-flows.e2e.test.ts#simulate"
const { result, request } = await asAlice.simulateContract({
  address: token,
  abi: exampleToken.abi,
  functionName: "transfer",
  args: [bob, parseEther("1")],
});
expect(result).toBe(true); // typed from the ABI: boolean
expect(await balanceOf(anvil.testClient, token, bob)).toBe(0n); // nothing sent yet

await anvil.confirm(asAlice.writeContract(request));
expect(await balanceOf(anvil.testClient, token, bob)).toBe(parseEther("1"));
```

## Several blocks, with time travel

`simulateBlocks` (`eth_simulateV1`) runs calls across blocks with block
overrides; nothing is written:

```ts snippet="examples/test/e2e/simulation-and-gas.e2e.test.ts#simulate-blocks"
const now = (await anvil.testClient.getBlock()).timestamp;
const [today, later] = await anvil.testClient.simulateBlocks({
  blocks: [
    {
      calls: [
        {
          from: alice,
          to: token,
          abi: exampleToken.abi,
          functionName: "approve",
          args: [vault, 5n],
        },
        {
          from: alice,
          to: vault,
          abi: timeLockVault.abi,
          functionName: "deposit",
          args: [5n],
        },
      ],
    },
    {
      blockOverrides: { time: now + 2n * LOCK }, // two days later
      calls: [
        {
          from: alice,
          to: vault,
          abi: timeLockVault.abi,
          functionName: "withdraw",
        },
      ],
    },
  ],
});
expect(today.calls.map((call) => call.status)).toEqual([
  "success",
  "success",
]);
expect(later.calls[0].status).toBe("success");
expect(later.timestamp).toBe(now + 2n * LOCK);

// Nothing happened on chain:
expect(await balanceOf(anvil.testClient, token, vault)).toBe(0n);
```

Failing calls are reported, not thrown:

```ts snippet="examples/test/e2e/simulation-and-gas.e2e.test.ts#simulate-failure"
const [block] = await anvil.testClient.simulateBlocks({
  blocks: [
    {
      calls: [
        {
          from: alice,
          to: vault,
          abi: timeLockVault.abi,
          functionName: "withdraw",
        },
        {
          from: alice,
          to: token,
          abi: exampleToken.abi,
          functionName: "balanceOf",
          args: [alice],
        },
      ],
    },
  ],
});
expect(block.calls[0].status).toBe("failure"); // NothingToWithdraw
expect(block.calls[1]).toMatchObject({
  status: "success",
  result: parseEther("10"),
});
```

## A sequence of calls from one account

```ts snippet="examples/test/e2e/simulation-and-gas.e2e.test.ts#simulate-calls"
const { results } = await anvil.testClient.simulateCalls({
  account: alice,
  calls: [
    {
      to: token,
      abi: exampleToken.abi,
      functionName: "transfer",
      args: [bob, 1n],
    },
    { to: bob, value: parseEther("1") },
  ],
});
expect(results.map((result) => result.status)).toEqual([
  "success",
  "success",
]);
expect(results[0].gasUsed).toBeGreaterThan(0n);
```

## Override block fields for one call

```ts snippet="examples/test/e2e/simulation-and-gas.e2e.test.ts#block-overrides"
const withdraw = {
  account: alice,
  to: vault,
  data: encodeFunctionData({
    abi: timeLockVault.abi,
    functionName: "withdraw",
  }),
};
const { timestamp } = await anvil.testClient.getBlock();

await expect(anvil.testClient.call(withdraw)).rejects.toThrow(); // still locked
await expect(
  anvil.testClient.call({
    ...withdraw,
    blockOverrides: { time: timestamp + LOCK + 1n },
  }),
).resolves.toBeDefined(); // would succeed after the lock
```

## Override state for one call

```ts snippet="examples/test/e2e/mocking-dependencies.e2e.test.ts#state-override"
// The override exists only inside this eth_call: nothing is written.
const { result } = await anvil.testClient.simulateContract({
  address: consumer,
  abi: priceConsumer.abi,
  functionName: "quote",
  args: [parseEther("1")],
  stateOverride: [
    {
      address: ORACLE,
      code: oracleCode,
      stateDiff: [
        {
          slot: numberToHex(0, { size: 32 }),
          value: numberToHex(parseUnits("2500", 8), { size: 32 }),
        },
      ],
    },
  ],
});
expect(result).toBe(parseUnits("2500", 8));
expect(await anvil.testClient.getCode({ address: ORACLE })).toBeUndefined();
```

## Deep dive

- [anvil behaviours worth knowing](../../deep-dives/anvil-behaviours.md)
