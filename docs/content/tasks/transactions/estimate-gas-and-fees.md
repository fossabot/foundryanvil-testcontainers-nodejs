---
title: Estimate gas and fees
description: Estimate gas and fees, build access lists, let the node fill transactions, and prove storage.
---

viem's estimation actions work as on any chain, against your node.

## Gas and fees

```ts snippet="examples/test/e2e/simulation-and-gas.e2e.test.ts#estimates"
const gas = await anvil.testClient.estimateContractGas({
  account: alice,
  address: token,
  abi: exampleToken.abi,
  functionName: "transfer",
  args: [bob, 1n],
});
const { maxFeePerGas, maxPriorityFeePerGas } =
  await anvil.testClient.estimateFeesPerGas();
const history = await anvil.testClient.getFeeHistory({
  blockCount: 3,
  rewardPercentiles: [50],
});

expect(gas).toBeGreaterThan(21_000n);
expect(maxFeePerGas).toBeGreaterThan(maxPriorityFeePerGas);
expect(history.baseFeePerGas.length).toBeGreaterThan(0);
```

## Access lists (EIP-2930)

```ts snippet="examples/test/e2e/simulation-and-gas.e2e.test.ts#access-list"
const data = encodeFunctionData({
  abi: exampleToken.abi,
  functionName: "transfer",
  args: [bob, 1n],
});
const { accessList, gasUsed } = await anvil.testClient.createAccessList({
  account: alice,
  to: token,
  data,
});
expect(accessList[0].address.toLowerCase()).toBe(token.toLowerCase());
expect(accessList[0].storageKeys.length).toBeGreaterThan(0); // both balances
expect(gasUsed).toBeGreaterThan(0n);

const receipt = await anvil.confirm(
  anvil
    .testClientFor(alice)
    .sendTransaction({ to: token, data, accessList }),
);
expect(receipt.type).toBe("eip1559");
```

## Let the node fill a transaction

```ts snippet="examples/test/e2e/simulation-and-gas.e2e.test.ts#fill-transaction"
const { transaction } = await anvil.testClient.fillTransaction({
  account: alice,
  to: bob,
  value: 1n,
});
expect(transaction).toMatchObject({
  nonce: await anvil.testClient.getTransactionCount({ address: alice }),
  chainId: anvil.chainId,
  type: "eip1559",
});
expect(transaction.gas).toBe(21_000n);
```

## Storage proofs

```ts snippet="examples/test/e2e/simulation-and-gas.e2e.test.ts#proof"
const totalSupplySlot = numberToHex(2, { size: 32 }); // 3rd state variable
const proof = await anvil.testClient.getProof({
  address: token,
  storageKeys: [totalSupplySlot],
});
expect(proof.storageProof[0].value).toBe(parseEther("10"));
expect(proof.accountProof.length).toBeGreaterThan(0);
```

To control the fees themselves (base fee, gas price, tips), see
[Build blocks](../time-and-blocks/build-blocks.md) and
[Configure the chain](../configure/chain.md).

## Concepts

- [anvil behaviours worth knowing](../../concepts/anvil-behaviours.md)
