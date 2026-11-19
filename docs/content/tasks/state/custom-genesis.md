---
title: Boot from a custom genesis
description: Start with pre-deployed contracts, pre-funded accounts, a fixed time or a mainnet-like height.
---

`state.withInit(file)` boots from a genesis file; `withTimestamp()` and `withBlockNumber()` adjust the start.

## Pre-deployed contracts and balances

```ts snippet="examples/test/e2e/state-fixtures.e2e.test.ts#genesis"
const ORACLE: Address = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
const TREASURY: Address = "0x1111111111111111111111111111111111111111";
const genesisFile = path.join(directory, "genesis.json");
fs.writeFileSync(
  genesisFile,
  JSON.stringify({
    config: { chainId: 1337 },
    timestamp: numberToHex(1_700_000_000),
    gasLimit: numberToHex(30_000_000),
    alloc: {
      [TREASURY]: { balance: numberToHex(parseEther("1000000")) },
      [ORACLE]: {
        balance: "0x0", // required by anvil for every entry
        code: oracleCode, // runtime code: the contract exists from block 0
        storage: {
          [numberToHex(0, { size: 32 })]: numberToHex(
            parseUnits("3000", 8),
            {
              size: 32,
            },
          ),
        },
      },
    },
  }),
);

const anvil = await new AnvilContainer(
  new AnvilOptions().state.withInit(genesisFile),
).start();
try {
  expect(anvil.chainId).toBe(1337);
  expect(await anvil.getBalance(TREASURY)).toBe(parseEther("1000000"));
  expect(
    await anvil.testClient.readContract({
      address: ORACLE,
      abi: fixedPriceOracle.abi,
      functionName: "latestPrice",
    }),
  ).toBe(parseUnits("3000", 8));
  const genesis = await anvil.testClient.getBlock({ blockNumber: 0n });
  expect(genesis.timestamp).toBe(1_700_000_000n);
} finally {
  await anvil.stop();
}
```

Every `alloc` entry needs a `balance` (`"0x0"` for contracts); `code` is
runtime code.

## A fixed genesis time

`state.withTimestamp(seconds | Date)`:

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

## A mainnet-like height

`mining.withBlockNumber(n)`:

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

## Deep dive

- [Startup, readiness and file transfers](../../deep-dives/startup-and-files.md)
