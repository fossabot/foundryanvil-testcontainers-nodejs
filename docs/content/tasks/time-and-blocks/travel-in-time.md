---
title: Fast-forward time
description: Jump ahead, hit exact timestamps, set the clock, and simulate regular block times.
---

Use `anvil.cheats.increaseTime()` and mine a block; time helpers take durations and `Date`s.

## Jump ahead

The samples use a vault that locks alice's deposit for 30 days:

```ts snippet="examples/test/e2e/time-travel.e2e.test.ts#withdraw-helper"
/** Simulates alice's withdrawal from the vault (throws while locked). */
const withdraw = () =>
  anvil.testClientFor(alice).simulateContract({
    address: vault,
    abi: timeLockVault.abi,
    functionName: "withdraw",
  });
```

```ts snippet="examples/test/e2e/time-travel.e2e.test.ts#fast-forward"
await anvil.cheats.increaseTime({ days: 30 }).mine();

const { request } = await withdraw();
await anvil.confirm(anvil.testClientFor(alice).writeContract(request));
expect(await balanceOf(anvil.testClient, token, alice)).toBe(
  parseEther("10"),
);
```

Time moves with the next mined block.

## Hit an exact timestamp

```ts snippet="examples/test/e2e/time-travel.e2e.test.ts#boundary"
const { unlockTime } = await vaultLock(anvil.testClient, vault, alice);
const asAlice = anvil.testClientFor(alice);
const sendWithdraw = () =>
  asAlice.writeContract({
    address: vault,
    abi: timeLockVault.abi,
    functionName: "withdraw",
  }); // signed by anvil: mined even when it reverts

// One second early: mined, but reverted.
await anvil.cheats.setNextBlockTimestamp(unlockTime - 1n);
await expect(anvil.confirm(sendWithdraw())).rejects.toBeInstanceOf(
  AnvilTransactionRevertedError,
);

// Exactly at the unlock time: succeeds.
await anvil.cheats.setNextBlockTimestamp(unlockTime);
const receipt = await anvil.confirm(sendWithdraw());
expect(receipt.status).toBe("success");
```

## Set the clock

```ts snippet="examples/test/e2e/time-travel.e2e.test.ts#set-time"
const launch = new Date("2030-01-01T00:00:00Z");
await anvil.cheats.setTime(launch).mine();

const { timestamp } = await anvil.testClient.getBlock();
expect(timestamp).toBeGreaterThanOrEqual(BigInt(launch.getTime() / 1000));

// 2030 is long past the unlock time: the withdrawal goes through.
const { request } = await withdraw();
expect(
  (await anvil.confirm(anvil.testClientFor(alice).writeContract(request)))
    .status,
).toBe("success");
```

## Regular block times

```ts snippet="examples/test/e2e/time-travel.e2e.test.ts#block-times"
// Node settings are not part of snapshots: restore them yourself.
await anvil.cheats.setBlockTimestampInterval(12); // 12 s "slots"
try {
  const start = await anvil.latestTimestamp();
  await anvil.mine(5);
  expect(await anvil.latestTimestamp()).toBe(start + 60n);
} finally {
  await anvil.cheats.removeBlockTimestampInterval();
}
```

## Blocks spaced in time

```ts snippet="examples/test/e2e/time-travel.e2e.test.ts#spaced-blocks"
const before = await anvil.testClient.getBlockNumber();
await anvil.mine(3, { hours: 1 }); // three blocks, one hour apart

const times = await Promise.all(
  [1n, 2n, 3n].map(
    async (offset) =>
      (await anvil.testClient.getBlock({ blockNumber: before + offset }))
        .timestamp,
  ),
);
expect([times[1] - times[0], times[2] - times[1]]).toEqual([3600n, 3600n]);
```

## Durations and timestamps

Seconds, unit objects and `Date`s:

```ts snippet="examples/test/unit/options.test.ts#units"
expect(durationToSeconds({ days: 1, hours: 2 })).toBe(93_600n);
expect(durationToSeconds(90)).toBe(90n);
expect(timestampToSeconds(new Date("2030-01-01T00:00:00Z"))).toBe(
  1_893_456_000n,
);
expect(() => durationToSeconds({ days: -1 })).toThrow(RangeError);
```

A fixed start time: [Boot from a custom genesis](../state/custom-genesis.md).

## Concepts

- [How per-test isolation works](../../concepts/isolation.md) (the block timestamp interval is a node setting)
- Reference: [cheats](../../reference/cheats.md)
