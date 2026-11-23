---
title: Fund accounts
description: Give any address Ether, ERC-20 balances and allowances, or set its nonce.
---

Write balances, allowances and nonces directly: no minting, no transfers.

## Ether and ERC-20 balances

```ts snippet="examples/test/e2e/whales-and-impersonation.e2e.test.ts#deal"
await anvil.cheats
  .setBalance(WHALE, parseEther("100")) // wei (setBalanceEther takes Ether)
  .dealErc20(token, WHALE, parseEther("1000000"));

expect(await anvil.getBalance(WHALE)).toBe(parseEther("100"));
expect(await balanceOf(anvil.testClient, token, WHALE)).toBe(
  parseEther("1000000"),
);
// The balance slot was written directly: totalSupply is untouched.
expect(
  await anvil.testClient.readContract({
    address: token,
    abi: exampleToken.abi,
    functionName: "totalSupply",
  }),
).toBe(0n);
```

`setBalance` takes wei; `setBalanceEther` takes Ether (`"1.5"`, `100`).
`dealErc20` writes the balance slot of standard tokens (no mint, no
`Transfer` event).

## Top up instead of overwrite

```ts snippet="examples/test/e2e/whales-and-impersonation.e2e.test.ts#add-balance"
await anvil.cheats
  .setBalanceEther(WHALE, 1)
  .addBalance(WHALE, parseEther("2")); // adds instead of overwriting
expect(await anvil.getBalance(WHALE)).toBe(parseEther("3"));
```

## Allowances without `approve()`

```ts snippet="examples/test/e2e/whales-and-impersonation.e2e.test.ts#allowance"
await anvil.cheats
  .setBalanceEther(WHALE, 1)
  .dealErc20(token, WHALE, parseEther("10"))
  // Allowances can be written directly too — no approve() transaction.
  .setErc20Allowance(token, WHALE, vault, parseEther("10"));
```

## Nonces: predict deployment addresses

```ts snippet="examples/test/e2e/whales-and-impersonation.e2e.test.ts#set-nonce"
await anvil.cheats.setNonce(WHALE, 100);
const predicted = getContractAddress({ from: WHALE, nonce: 100n });

const receipt = await anvil.withImpersonation(WHALE, (client) =>
  anvil.confirm(
    client.deployContract({
      account: WHALE,
      abi: exampleToken.abi,
      bytecode: exampleToken.bytecode,
      args: ["Whale Token", "WHL"],
    }),
  ),
);
expect(receipt.contractAddress?.toLowerCase()).toBe(
  predicted.toLowerCase(),
);
expect(await anvil.testClient.getTransactionCount({ address: WHALE })).toBe(
  101,
);
```

For non-standard tokens, write the storage slot yourself:
[Mock contracts and storage](../state/mock-contracts.md).

## Concepts

- Reference: [cheats](../../reference/cheats.md), [anvil extras](../../reference/anvil-actions.md)
