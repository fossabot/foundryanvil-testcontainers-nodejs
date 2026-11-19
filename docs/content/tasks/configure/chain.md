---
title: Configure the chain
description: Chain id, hardfork, gas limit, base fee, gas price, finality, OP Stack and Celo.
---

```ts snippet="examples/test/e2e/chain-config-and-reorgs.e2e.test.ts#chain-config"
const anvil = useAnvil(
  new AnvilContainer(
    new AnvilOptions().evm
      .withChainId(8453)
      .withHardfork(Hardfork.Cancun)
      .withGasLimit(60_000_000)
      .withBlockBaseFeePerGas(parseGwei("7")),
  ).withTestClient((client) =>
    client
      .withAccount(0)
      .withChain({
        name: "Local Base",
        blockExplorers: {
          default: { name: "None", url: "http://localhost" },
        },
      })
      .withPollingInterval(50),
  ),
);
```

`withChain()` sets client metadata; the id and URLs come from the node.

## Change the chain id at runtime

```ts snippet="examples/test/e2e/chain-config-and-reorgs.e2e.test.ts#set-chain-id"
await anvil.cheats.setChainId(10);
try {
  expect(anvil.chainId).toBe(10); // the container's clients follow
  // Sign locally: anvil's own dev-account signer keeps the startup chain id.
  const signer = anvil.testClientFor(
    privateKeyToAccount(alice.privateKey!),
  );
  const receipt = await anvil.confirm(
    signer.sendTransaction({ to: alice.address, value: 1n }),
  );
  expect(receipt.status).toBe("success");
} finally {
  await anvil.cheats.setChainId(8453); // node setting: restore
}
```

## Gas price

Pre-London: pin the suggested gas price:

```ts snippet="examples/test/e2e/node-configuration.e2e.test.ts#gas-price"
// Pre-London chains have no base fee: pin the gas price the node suggests.
const legacy = useAnvil(
  new AnvilContainer(
    new AnvilOptions().evm
      .withHardfork(Hardfork.Berlin)
      .withGasPrice(parseGwei("5")),
  ),
);

it("suggests the configured gas price", async () => {
  expect(await legacy.testClient.getGasPrice()).toBe(parseGwei("5"));
});
```

Post-London: drop anvil's 1 gwei minimum tip:

```ts snippet="examples/test/e2e/node-configuration.e2e.test.ts#no-priority-fee"
// By default anvil suggests base fee + 1 gwei; drop the minimum tip.
const tipless = useAnvil(
  new AnvilContainer(new AnvilOptions().evm.disableMinPriorityFee()),
);

it("suggests the base fee without a tip", async () => {
  const { baseFeePerGas } = await tipless.testClient.getBlock();
  expect(await tipless.testClient.getGasPrice()).toBe(baseFeePerGas);
});
```

## Finality (`safe` / `finalized` blocks)

```ts snippet="examples/test/e2e/node-configuration.e2e.test.ts#slots-in-an-epoch"
// `safe` trails the head by one epoch, `finalized` by two (default: 32 slots).
const node = useAnvil(
  new AnvilContainer(new AnvilOptions().mining.withSlotsInAnEpoch(1)),
);

it("derives the safe and finalized blocks from the epoch length", async () => {
  await node.mine(5);
  const safe = await node.testClient.getBlock({ blockTag: "safe" });
  const finalized = await node.testClient.getBlock({
    blockTag: "finalized",
  });
  expect([safe.number, finalized.number]).toEqual([4n, 3n]);
});
```

## OP Stack and Celo

```ts snippet="examples/test/unit/options.test.ts#network-modes"
const opStack = new AnvilOptions().network
  .withOptimism()
  .evm.withHardfork(OpHardfork.Isthmus);
expect(opStack.toCommand()).toBe(
  "anvil --host 0.0.0.0 --hardfork isthmus --optimism",
);

// Ethereum hardforks don't apply to OP Stack chains…
expect(() =>
  new AnvilOptions().network
    .withOptimism()
    .evm.withHardfork(Hardfork.Prague)
    .validate(),
).toThrow(/use an OpHardfork value instead/);
// …and a chain is either OP Stack or Celo.
expect(() => new AnvilOptions().network.withCelo().withOptimism()).toThrow(
  AnvilConfigurationError,
);
```

`OpHardfork` with `withOptimism()`; `Hardfork.Latest` is anvil's default.

## Deep dive

- [anvil behaviours worth knowing](../../deep-dives/anvil-behaviours.md#chain-id)
- Reference: [`.evm` options](../../reference/anvil-options.md#evm), [`.network` options](../../reference/anvil-options.md#network), [`Hardfork` values](../../reference/exports.md#enums)
