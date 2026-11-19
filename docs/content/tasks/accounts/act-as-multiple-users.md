---
title: Act as multiple users
description: Give each user their own typed client and send transactions as them.
---

`testClientFor(account)` returns a client with the node's settings acting as
that account — a dev or impersonated address (anvil signs) or a viem
`LocalAccount` (signs locally):

```ts snippet="examples/test/e2e/multi-actor-flows.e2e.test.ts#actors"
const asAlice = anvil.testClientFor(alice);
const asBob = anvil.testClientFor(bob);

await anvil.confirm(
  asAlice.writeContract({
    address: token,
    abi: exampleToken.abi,
    functionName: "approve",
    args: [bob, parseEther("10")],
  }),
);
const receipt = await anvil.confirm(
  asBob.writeContract({
    address: token,
    abi: exampleToken.abi,
    functionName: "transferFrom",
    args: [alice, bob, parseEther("4")],
  }),
);

const [transfer] = parseEventLogs({
  abi: exampleToken.abi,
  logs: receipt.logs,
  eventName: "Transfer",
});
expect(transfer.args).toEqual({
  from: alice,
  to: bob,
  value: parseEther("4"),
});
```

## A fresh, funded user per test

```ts snippet="examples/test/e2e/signing.e2e.test.ts#fresh-user"
const user = privateKeyToAccount(generatePrivateKey());
await anvil.cheats.setBalanceEther(user.address, 1);
const asUser = anvil.testClientFor(user);

const [alice] = await anvil.addresses();
await anvil.confirm(asUser.sendTransaction({ to: alice, value: 1n }));
expect(
  await anvil.testClient.getTransactionCount({ address: user.address }),
).toBe(1);
```

## A client with its own settings

`createTestClient(options)` builds a client with different settings (default
account, transport, batching, cache…), validated against the node:

```ts snippet="examples/test/e2e/whales-and-impersonation.e2e.test.ts#whale-client"
const whale = await anvil.createTestClient((client) =>
  client.withAccount(WHALE, { impersonate: true }),
);
await anvil.confirm(
  whale.writeContract({
    address: vault,
    abi: timeLockVault.abi,
    functionName: "deposit",
    args: [parseEther("10")],
  }),
);
```

## Deep dive

- [Signing: anvil-signed vs. locally signed](../../deep-dives/signing.md)
- [Configure the test client](../configure/test-client.md)
