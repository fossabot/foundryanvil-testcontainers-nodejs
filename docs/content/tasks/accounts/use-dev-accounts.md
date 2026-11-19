---
title: Use dev accounts and keys
description: Configure anvil's funded dev accounts and get their addresses and private keys.
---

Configure accounts with `.account`; read them with their keys:

```ts snippet="examples/test/e2e/fixtures-and-isolation.e2e.test.ts#accounts"
const accounts = await anvil.accounts(); // addresses + private keys
expect(accounts).toHaveLength(3);
accounts.forEach(({ index, address, privateKey }) => {
  expect(privateKey).toBeDefined();
  expect(mnemonicToAccount(MNEMONIC, { addressIndex: index }).address).toBe(
    address,
  );
});
expect(await anvil.getBalance(accounts[2].address)).toBe(
  parseEther("1000"),
);
```

`addresses()` returns addresses; `accounts()` adds `privateKey`.

## Choose the key material

```ts snippet="examples/test/e2e/signing.e2e.test.ts#key-material"
const MNEMONIC =
  "legal winner thank year wave sausage worth useful legal winner thank yellow";
// Dev accounts from a second BIP-44 account branch: m/44'/60'/1'/0/i
const derived = useAnvil(
  new AnvilContainer(
    new AnvilOptions().account
      .withMnemonic(MNEMONIC)
      .withDerivationPath("m/44'/60'/1'/0/")
      .withAccounts(2),
  ),
);
// A fresh random mnemonic per run; keys are read from anvil's startup banner.
const random = useAnvil(
  new AnvilContainer(
    new AnvilOptions().account.withRandomMnemonic(),
  ).withTestClient((client) => client.withLocalAccount(0)),
);

// Reproducible "random" accounts: the same seed gives the same mnemonic.
const seeded = useAnvil(
  new AnvilContainer(new AnvilOptions().account.withMnemonicSeedUnsafe(42)),
);
const seededAgain = useAnvil(
  new AnvilContainer(new AnvilOptions().account.withMnemonicSeedUnsafe(42)),
);

it("derives accounts along the configured path", async () => {
  const accounts = await derived.accounts();
  accounts.forEach(({ index, address }) =>
    expect(
      mnemonicToAccount(MNEMONIC, { accountIndex: 1, addressIndex: index })
        .address,
    ).toBe(address),
  );
});

it("reproduces seeded accounts across nodes", async () => {
  const [first] = await seeded.addresses();
  expect(await seededAgain.addresses()).toEqual(await seeded.addresses());
  expect(first).not.toBe(mnemonicToAccount(DEFAULT_MNEMONIC).address);
});

it("signs locally with keys of a random mnemonic", async () => {
  const [first] = await random.accounts();
  expect(first.privateKey).toBeDefined();
  expect(random.testClient.account.address).toBe(first.address);
  const [, other] = await random.addresses();
  const receipt = await random.confirm(
    random.testClient.sendTransaction({ to: other, value: 1n }),
  );
  expect(receipt.from.toLowerCase()).toBe(first.address.toLowerCase());
});
```

| Method | anvil flag | Keys known to `accounts()` |
|---|---|---|
| default | – | yes (`DEFAULT_MNEMONIC`) |
| `withMnemonic(phrase)` | `--mnemonic` | yes |
| `withDerivationPath(path)` | `--derivation-path` | yes |
| `withRandomMnemonic(words?)` | `--mnemonic-random` | from the banner; not with `logs.quiet()` |
| `withMnemonicSeedUnsafe(seed)` | `--mnemonic-seed-unsafe` | from the banner; not with `logs.quiet()` |

The default is the well-known Foundry/Hardhat mnemonic:

```ts snippet="examples/test/e2e/signing.e2e.test.ts#mnemonic"
const expected = mnemonicToAccount(DEFAULT_MNEMONIC, { addressIndex: 1 });
expect(anvil.testClient.account.address).toBe(expected.address);
```

## Deep dive

- [Signing: anvil-signed vs. locally signed](../../deep-dives/signing.md)
- Reference: [`.account` options](../../reference/anvil-options.md#account)
