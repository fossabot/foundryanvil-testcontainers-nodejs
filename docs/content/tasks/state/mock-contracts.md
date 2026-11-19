---
title: Mock contracts and storage
description: Replace an external dependency at a fixed address with a test double by writing code and storage.
---

Write runtime code with `setCode` and storage with `setStorageAt`, at any address.

## Etch a test double

`setCode` needs *runtime* code: deploy the double once and read it:

```ts snippet="examples/test/e2e/mocking-dependencies.e2e.test.ts#runtime-code"
// setCode needs *runtime* code: deploy the test double once from its
// creation bytecode (.bin) and read the code the constructor left behind.
const template = await deployFixedPriceOracle(node.testClient);
oracleCode = (await node.testClient.getCode({ address: template }))!;
```

Write it to the dependency's address, with storage:

```ts snippet="examples/test/e2e/mocking-dependencies.e2e.test.ts#etch"
await anvil.cheats
  .setCode(ORACLE, oracleCode)
  .setStorageAt(ORACLE, 0, parseUnits("3000", 8)); // slot 0: `price`

expect(await quote(anvil.testClient, consumer, parseEther("2"))).toBe(
  parseUnits("6000", 8),
);
```

`setCode(address, "0x")` removes it.

## Write a mapping entry

```ts snippet="examples/test/e2e/mocking-dependencies.e2e.test.ts#mapping-slot"
// balanceOf is the 4th state variable (slot 3): entry = keccak256(key . slot)
const slot = keccak256(
  encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [alice, 3n],
  ),
);
expect(await anvil.testClient.getStorageAt({ address: token, slot })).toBe(
  numberToHex(1n, { size: 32 }),
); // confirms the layout

await anvil.cheats.setStorageAt(token, slot, parseEther("500"));
expect(await balanceOf(anvil.testClient, token, alice)).toBe(
  parseEther("500"),
);
```

## Mock for one call only

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

- [Simulate before sending](../transactions/simulate-calls.md)
- Reference: [cheats](../../reference/cheats.md)
