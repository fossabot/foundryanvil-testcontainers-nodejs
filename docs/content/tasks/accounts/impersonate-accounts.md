---
title: Impersonate any address
description: Send transactions as whales, treasuries or admins without their private keys.
---

Impersonate an address and anvil signs its transactions, no key needed.

## For a block of code

```ts snippet="examples/test/e2e/whales-and-impersonation.e2e.test.ts#with-impersonation"
await anvil.withImpersonation(WHALE, (client) =>
  anvil.confirm(
    client.writeContract({
      account: WHALE,
      address: token,
      abi: exampleToken.abi,
      functionName: "transfer",
      args: [alice, parseEther("500")],
    }),
  ),
);
```

## As part of a scripted scenario

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

## As the default account of a client

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

## Start and stop explicitly

```ts snippet="examples/test/e2e/whales-and-impersonation.e2e.test.ts#stop-impersonating"
await anvil.impersonate(WHALE);
await anvil.confirm(
  anvil.testClientFor(WHALE).sendTransaction({ to: alice, value: 1n }),
);

await anvil.stopImpersonating(WHALE);
await expect(
  anvil.testClientFor(WHALE).sendTransaction({ to: alice, value: 1n }),
).rejects.toThrow(); // anvil no longer signs for the whale
```

The same with viem's actions:

```ts snippet="examples/test/e2e/whales-and-impersonation.e2e.test.ts#viem-impersonation"
await anvil.testClient.impersonateAccount({ address: WHALE });
try {
  await anvil.confirm(
    anvil.testClient.sendTransaction({
      account: WHALE,
      to: alice,
      value: 1n,
    }),
  );
} finally {
  await anvil.testClient.stopImpersonatingAccount({ address: WHALE });
}
```

## Every sender, always

```ts snippet="examples/test/e2e/whales-and-impersonation.e2e.test.ts#auto-impersonate"
// Every sender is impersonated: no per-address impersonate() calls.
const node = useAnvil(
  new AnvilContainer(new AnvilOptions().account.autoImpersonate()),
);

it("sends from any address", async () => {
  const [alice] = await node.addresses();
  await node.cheats.setBalanceEther(WHALE, 1);
  const receipt = await node.confirm(
    node.testClientFor(WHALE).sendTransaction({ to: alice, value: 1n }),
  );
  expect(receipt.from.toLowerCase()).toBe(WHALE.toLowerCase());
});

it("can be switched off and on at runtime", async () => {
  const [alice] = await node.addresses();
  await node.cheats.setBalanceEther(WHALE, 1).setAutoImpersonate(false);
  try {
    await expect(
      node.testClientFor(WHALE).sendTransaction({ to: alice, value: 1n }),
    ).rejects.toThrow();
  } finally {
    await node.cheats.setAutoImpersonate(true); // node setting: restore it
  }
  await node.confirm(
    node.testClientFor(WHALE).sendTransaction({ to: alice, value: 1n }),
  );
});
```

## One transaction, no impersonation

`sendUnsignedTransaction` sends as any funded address:

```ts snippet="examples/test/e2e/whales-and-impersonation.e2e.test.ts#unsigned"
await anvil.confirm(
  anvil.testClient.sendUnsignedTransaction({
    from: WHALE,
    to: alice,
    value: parseEther("1"),
  }),
);
```

Impersonation is a node setting: snapshots do not undo it.

## Concepts

- [Signing: anvil-signed vs. locally signed](../../concepts/signing.md)
- [How per-test isolation works](../../concepts/isolation.md)
