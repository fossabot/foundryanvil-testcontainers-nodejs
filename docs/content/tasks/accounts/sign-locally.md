---
title: Sign locally like a wallet
description: Sign messages, EIP-712 data, raw transactions and EIP-7702 authorizations with local keys.
---

`withLocalAccount(index | privateKey | account)` makes the default account
sign in the client, like a browser wallet:

```ts snippet="examples/test/e2e/signing.e2e.test.ts#local-account"
// Dev account 1 signs locally (its key is derived from anvil's mnemonic).
const anvil = useAnvil(
  new AnvilContainer().withTestClient((client) => client.withLocalAccount(1)),
  {
    // A contract to delegate EOAs to (EIP-7702), deployed once.
    setup: async (node) =>
      void (delegate = await deployFixedPriceOracle(node.testClient)),
  },
);
```

## EIP-712 typed data

```ts snippet="examples/test/e2e/signing.e2e.test.ts#typed-data"
const order = {
  domain: {
    name: "Example Exchange",
    version: "1",
    chainId: 31337,
    verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
  },
  types: {
    Order: [
      { name: "maker", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
  },
  primaryType: "Order",
} as const;
```

```ts snippet="examples/test/e2e/signing.e2e.test.ts#sign-typed-data"
const message = { maker, amount: parseEther("1"), nonce: 0n };
const signature = await anvil.testClient.signTypedData({
  ...order,
  message,
});

expect(
  await verifyTypedData({ ...order, message, address: maker, signature }),
).toBe(true);
expect(
  await recoverTypedDataAddress({ ...order, message, signature }),
).toBe(maker);
```

## Messages and raw bytes

```ts snippet="examples/test/e2e/signing.e2e.test.ts#recover"
const raw = await anvil.testClient.signMessage({
  message: { raw: "0xdeadbeef" }, // sign bytes, not their hex text
});
expect(
  await recoverMessageAddress({
    message: { raw: "0xdeadbeef" },
    signature: raw,
  }),
).toBe(anvil.testClient.account.address);
```

## Sign offline, broadcast later

```ts snippet="examples/test/e2e/signing.e2e.test.ts#offline"
const request = await anvil.testClient.prepareTransactionRequest({
  to: alice,
  value: parseEther("1"),
});
const raw = await anvil.testClient.signTransaction(request);
const hash = await anvil.testClient.sendRawTransaction({
  serializedTransaction: raw,
});
```

## EIP-7702: delegate an account to a contract

```ts snippet="examples/test/e2e/signing.e2e.test.ts#eip7702-self"
// The sender is also the authority: sign for the nonce after this transaction.
const authorization = await anvil.testClient.signAuthorization({
  contractAddress: delegate,
  executor: "self",
});
await anvil.confirm(
  anvil.testClient.sendTransaction({
    authorizationList: [authorization],
    to: account,
    data: encodeFunctionData({
      abi: fixedPriceOracle.abi,
      functionName: "latestPrice",
    }),
  }),
);

// The EOA now carries a delegation designator (0xef0100 ‖ delegate)…
expect(await anvil.testClient.getCode({ address: account })).toBe(
  concat(["0xef0100", delegate]).toLowerCase(),
);
// …and runs the delegate's code against its own storage.
await anvil.cheats.setStorageAt(account, 0, 42n);
expect(
  await anvil.testClient.readContract({
    address: account,
    abi: fixedPriceOracle.abi,
    functionName: "latestPrice",
  }),
).toBe(42n);
```

Sponsored: the user signs, someone else pays:

```ts snippet="examples/test/e2e/signing.e2e.test.ts#eip7702-sponsored"
// A brand-new user without any Ether signs the authorization…
const user = privateKeyToAccount(generatePrivateKey());
const authorization = await anvil
  .testClientFor(user)
  .signAuthorization({ contractAddress: delegate });

// …and the default account submits (and pays for) it.
await anvil.confirm(
  anvil.testClient.sendTransaction({
    authorizationList: [authorization],
    to: user.address,
    data: encodeFunctionData({
      abi: fixedPriceOracle.abi,
      functionName: "latestPrice",
    }),
  }),
);
expect(await anvil.getBalance(user.address)).toBe(0n);
expect(await anvil.testClient.getCode({ address: user.address })).toBe(
  concat(["0xef0100", delegate]).toLowerCase(),
);
```

:::note Changing the chain id
After `setChainId()`, anvil's own signer keeps the startup chain id; local
signing keeps working. See [Configure the chain](../configure/chain.md).
:::

## Concepts

- [Signing: anvil-signed vs. locally signed](../../concepts/signing.md)
