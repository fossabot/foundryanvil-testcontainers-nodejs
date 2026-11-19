---
title: Share one node per test file
description: Start a node once per file, deploy fixtures once, and give every test a clean copy of that state.
---

Wrap the container in `useAnvil()` and deploy fixtures in `setup`:

```ts snippet="examples/test/e2e/fixtures-and-isolation.e2e.test.ts#fixture"
let token: Address;
let vault: Address;

const anvil = useAnvil(
  new AnvilContainer(
    new AnvilOptions().account
      .withMnemonic(MNEMONIC)
      .withAccounts(3)
      .withBalance(1_000), // ETH per dev account
  )
    .withArtifactsDir(ARTIFACTS_DIR) // for anvil.contractAbi() / contractBytecode()
    .withTestClient(
      (client) => client.withAccount(0), // deployer signs by default
    ),
  {
    // Runs once after start; every test then starts from this state.
    setup: async (node) => {
      const [, alice, bob] = await node.addresses();
      token = await deployToken(node.testClient);
      vault = await deployVault(node.testClient, token, 86_400n);
      await mint(node.testClient, token, alice, parseEther("100"));
      await mint(node.testClient, token, bob, parseEther("100"));
    },
  },
);
```

Each test starts from the post-`setup` state:

```ts snippet="examples/test/e2e/fixtures-and-isolation.e2e.test.ts#isolation"
it("may change any state…", async () => {
  const [, alice, bob] = await anvil.addresses();
  await anvil.confirm(
    anvil.testClientFor(alice).writeContract({
      address: token,
      abi: exampleToken.abi,
      functionName: "transfer",
      args: [bob, parseEther("100")],
    }),
  );
  await anvil.cheats.mine(100).increaseTime({ days: 365 });
  expect(await balanceOf(anvil.testClient, token, alice)).toBe(0n);
});

it("…because the next test starts from the fixture again", async () => {
  const [, alice] = await anvil.addresses();
  expect(await balanceOf(anvil.testClient, token, alice)).toBe(
    parseEther("100"),
  );
});
```

## Settings

| Setting | Default | Use it to |
|---|---|---|
| `setup: (node) => …` | – | deploy contracts, fund accounts; runs once after start |
| `isolation` | `"test"` | `"none"` lets state carry over (e.g. suites that call `reset()`) |
| `timeout` | `120_000` ms | give start/stop hooks time to pull the image |
| `hooks` | framework globals | pass `beforeAll` / `afterAll` / `afterEach` yourself |

Use the handle in tests and hooks only (`NOT_STARTED` at `describe` level).

## Deep dive

- [How per-test isolation works](../../deep-dives/isolation.md)
- [Performance: fast suites](../../deep-dives/performance.md)
- Reference: [`useAnvil()`](../../reference/use-anvil.md)
