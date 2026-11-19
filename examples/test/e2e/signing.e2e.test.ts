/**
 * Workflow: locally signed accounts — like a real wallet — for message and
 * EIP-712 signatures, offline-signed transactions and fresh throwaway users.
 */
import {
  AnvilContainer,
  AnvilOptions,
  DEFAULT_MNEMONIC,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import {
  type Address,
  concat,
  encodeFunctionData,
  parseEther,
  recoverMessageAddress,
  recoverTypedDataAddress,
  verifyMessage,
  verifyTypedData,
} from "viem";
import {
  generatePrivateKey,
  mnemonicToAccount,
  privateKeyToAccount,
} from "viem/accounts";
import { deployFixedPriceOracle, fixedPriceOracle } from "../../src";

let delegate: Address;

// #region local-account
// Dev account 1 signs locally (its key is derived from anvil's mnemonic).
const anvil = useAnvil(
  new AnvilContainer().withTestClient((client) => client.withLocalAccount(1)),
  {
    // A contract to delegate EOAs to (EIP-7702), deployed once.
    setup: async (node) =>
      void (delegate = await deployFixedPriceOracle(node.testClient)),
  },
);
// #endregion local-account

// #region typed-data
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
// #endregion typed-data

describe("signing with local accounts", () => {
  it("signs and verifies messages", async () => {
    const account = anvil.testClient.account;
    expect(account.type).toBe("local");
    const signature = await anvil.testClient.signMessage({
      message: "hello anvil",
    });
    expect(
      await verifyMessage({
        address: account.address,
        message: "hello anvil",
        signature,
      }),
    ).toBe(true);
  });

  it("signs EIP-712 typed data", async () => {
    const maker = anvil.testClient.account.address;
    // #region sign-typed-data
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
    // #endregion sign-typed-data
  });

  it("signs a transaction offline and broadcasts the raw bytes", async () => {
    const [alice] = await anvil.addresses();
    // #region offline
    const request = await anvil.testClient.prepareTransactionRequest({
      to: alice,
      value: parseEther("1"),
    });
    const raw = await anvil.testClient.signTransaction(request);
    const hash = await anvil.testClient.sendRawTransaction({
      serializedTransaction: raw,
    });
    // #endregion offline
    expect((await anvil.confirm(hash)).status).toBe("success");
  });

  it("creates a fresh, funded user per test", async () => {
    // #region fresh-user
    const user = privateKeyToAccount(generatePrivateKey());
    await anvil.cheats.setBalanceEther(user.address, 1);
    const asUser = anvil.testClientFor(user);

    const [alice] = await anvil.addresses();
    await anvil.confirm(asUser.sendTransaction({ to: alice, value: 1n }));
    expect(
      await anvil.testClient.getTransactionCount({ address: user.address }),
    ).toBe(1);
    // #endregion fresh-user
  });

  it("is the account viem derives from anvil's mnemonic", () => {
    // #region mnemonic
    const expected = mnemonicToAccount(DEFAULT_MNEMONIC, { addressIndex: 1 });
    expect(anvil.testClient.account.address).toBe(expected.address);
    // #endregion mnemonic
  });

  it("recovers signers of text and raw-byte messages", async () => {
    // #region recover
    const raw = await anvil.testClient.signMessage({
      message: { raw: "0xdeadbeef" }, // sign bytes, not their hex text
    });
    expect(
      await recoverMessageAddress({
        message: { raw: "0xdeadbeef" },
        signature: raw,
      }),
    ).toBe(anvil.testClient.account.address);
    // #endregion recover
  });

  it("delegates the account's own code to a contract (EIP-7702)", async () => {
    const account = anvil.testClient.account.address;
    // #region eip7702-self
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
    // #endregion eip7702-self
  });

  it("sponsors another account's EIP-7702 delegation", async () => {
    // #region eip7702-sponsored
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
    // #endregion eip7702-sponsored
  });
});

describe("custom key material", () => {
  // #region key-material
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
  // #endregion key-material
});
