---
title: Quick start
description: One node per test file, a typed default signer and a fluent cheat chain.
---

A complete test file:

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

- `AnvilOptions`: anvil's flags, validated as set.
- `withAccount(0)`: dev account 0 signs by default.
- `useAnvil()`: start, reset after each test, stop.
- `confirm()`: the receipt; throws if reverted.
- `cheats`: queued state changes, run when awaited.

Next:

- [Deploy fixtures once per file](../tasks/test-suites/share-a-node.md)
- [Fund and impersonate accounts](../tasks/accounts/impersonate-accounts.md)
- [Fast-forward time](../tasks/time-and-blocks/travel-in-time.md)

## Concepts

- [Architecture: node, test client, cheats](../concepts/architecture.md)
- [How per-test isolation works](../concepts/isolation.md)
