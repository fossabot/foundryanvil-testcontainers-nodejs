---
title: Send transactions and wait for receipts
description: Send transactions, wait for receipts even with automine off, and handle nonces.
---

`anvil.confirm(hash | Promise<hash>)` returns the receipt (mining a block when
automine is off) and throws `AnvilTransactionRevertedError` on revert:

```ts snippet="examples/test/e2e/quick-start.e2e.test.ts#quick-start"
import {
  AnvilContainer,
  AnvilOptions,
  Hardfork,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import { parseEther } from "viem";

const options = new AnvilOptions().account
  .withAccounts(5)
  .withBalance(1_000) // ETH per dev account
  .evm.withChainId(1337)
  .withHardfork(Hardfork.Cancun)
  .logs.quiet();

// Starts in beforeAll, stops in afterAll, restores the state after every test.
const anvil = useAnvil(
  new AnvilContainer(options).withTestClient((client) => client.withAccount(0)),
);

it("sends Ether", async () => {
  const [, bob] = await anvil.addresses();
  // No `account` needed: dev account 0 is the typed default signer.
  const receipt = await anvil.confirm(
    anvil.testClient.sendTransaction({ to: bob, value: parseEther("1") }),
  );
  expect(receipt.status).toBe("success");
  expect(await anvil.testClient.getChainId()).toBe(1337);
});

it("manipulates the chain fluently", async () => {
  const whale = "0x1111111111111111111111111111111111111111";
  await anvil.cheats
    .setBalanceEther(whale, 1_000)
    .impersonate(whale)
    .increaseTime({ days: 7 })
    .mine();
  expect(await anvil.getBalance(whale)).toBe(parseEther("1000"));
});
```

| Option | Default | |
|---|---|---|
| `throwOnRevert` | `true` | `false` returns the reverted receipt |
| `timeout` | `30_000` ms | receipt wait |

## Ether in one line

```ts snippet="examples/test/e2e/multi-actor-flows.e2e.test.ts#send-eth"
const receipt = await anvil.sendEthTransaction(alice, bob, "1.5"); // Ether
expect(receipt.status).toBe("success");
expect(await anvil.getBalance(bob)).toBe(before + parseEther("1.5"));
```

`anvil.deployContract(abi, bytecode, from, args)` for deployments.

## Receipt in the same call

viem's `*Sync` actions (`eth_sendTransactionSync`):

```ts snippet="examples/test/e2e/multi-actor-flows.e2e.test.ts#sync"
const receipt = await anvil.testClientFor(alice).writeContractSync({
  address: token,
  abi: exampleToken.abi,
  functionName: "transfer",
  args: [bob, parseEther("2")],
});
expect(receipt.status).toBe("success");

const payment = await anvil.testClientFor(bob).sendTransactionSync({
  to: alice,
  value: parseEther("1"),
});
expect(payment.blockNumber).toBe(receipt.blockNumber + 1n);
```

## Nonces

A nonce gap waits in the *queued* pool until filled:

```ts snippet="examples/test/e2e/multi-actor-flows.e2e.test.ts#nonces"
const next = await anvil.testClient.getTransactionCount({ address: alice });

const later = await transfer(next + 1); // skips a nonce…
expect(await anvil.testClient.getTxpoolStatus()).toEqual({
  pending: 0,
  queued: 1, // …so it waits in the queue
});

const first = await transfer(next); // fills the gap: both are mined
const receipts = await Promise.all(
  [first, later].map((hash) => anvil.confirm(hash)),
);
expect(receipts.map((receipt) => receipt.status)).toEqual([
  "success",
  "success",
]);
expect(await balanceOf(anvil.testClient, token, bob)).toBe(parseEther("2"));
```

## Concepts

- [Signing: anvil-signed vs. locally signed](../../concepts/signing.md)
- Reference: [`confirm()` and transaction helpers](../../reference/started-anvil-container.md#transactions)
