/**
 * Workflow: acting as accounts you have no key for — "whales", treasuries,
 * protocol admins — and giving them balances without minting.
 */
import {
  AnvilOptions,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import { type Address, getContractAddress, parseEther } from "viem";
import {
  balanceOf,
  deployToken,
  deployVault,
  exampleToken,
  timeLockVault,
} from "../../src";
import { anvilContainer } from "../support/runtime";

/** Not a dev account: nobody here has its private key. */
const WHALE: Address = "0x00000000219ab540356cBB839Cbe05303d7705Fa";

let token: Address;
let vault: Address;

const anvil = useAnvil(
  anvilContainer().withTestClient((client) => client.withAccount(0)),
  {
    setup: async (node) => {
      token = await deployToken(node.testClient);
      vault = await deployVault(node.testClient, token, 0n);
    },
  },
);

describe("whales and impersonation", () => {
  it("funds an address with Ether and tokens — without minting", async () => {
    // #region deal
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
    // #endregion deal
  });

  it("sends transactions as the whale for a block of code", async () => {
    const [, alice] = await anvil.addresses();
    await anvil.cheats
      .setBalanceEther(WHALE, 1)
      .dealErc20(token, WHALE, parseEther("500"));
    // #region with-impersonation
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
    // #endregion with-impersonation
    expect(await balanceOf(anvil.testClient, token, alice)).toBe(
      parseEther("500"),
    );
  });

  it("scripts a whole scenario as one cheat chain", async () => {
    const [, alice] = await anvil.addresses();
    // #region cheat-chain
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
    // #endregion cheat-chain
    expect(await balanceOf(anvil.testClient, token, alice)).toBe(
      parseEther("10"),
    );
  });

  it("creates a client that *is* the whale (typed default account)", async () => {
    await anvil.cheats
      .setBalanceEther(WHALE, 1)
      .dealErc20(token, WHALE, parseEther("10"))
      // Allowances can be written directly too — no approve() transaction.
      .setErc20Allowance(token, WHALE, vault, parseEther("10"));
    // #region whale-client
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
    // #endregion whale-client
    expect(await balanceOf(anvil.testClient, token, vault)).toBe(
      parseEther("10"),
    );
  });

  it("sends a one-off unsigned transaction from any funded address", async () => {
    const [, alice] = await anvil.addresses();
    await anvil.cheats.setBalanceEther(WHALE, 2);
    const before = await anvil.getBalance(alice);
    // #region unsigned
    await anvil.confirm(
      anvil.testClient.sendUnsignedTransaction({
        from: WHALE,
        to: alice,
        value: parseEther("1"),
      }),
    );
    // #endregion unsigned
    expect(await anvil.getBalance(alice)).toBe(before + parseEther("1"));
  });

  it("tops balances up with addBalance", async () => {
    // #region add-balance
    await anvil.cheats
      .setBalanceEther(WHALE, 1)
      .addBalance(WHALE, parseEther("2")); // adds instead of overwriting
    expect(await anvil.getBalance(WHALE)).toBe(parseEther("3"));
    // #endregion add-balance
  });

  it("revokes access with stopImpersonating", async () => {
    const [, alice] = await anvil.addresses();
    await anvil.cheats.setBalanceEther(WHALE, 1);
    // #region stop-impersonating
    await anvil.impersonate(WHALE);
    await anvil.confirm(
      anvil.testClientFor(WHALE).sendTransaction({ to: alice, value: 1n }),
    );

    await anvil.stopImpersonating(WHALE);
    await expect(
      anvil.testClientFor(WHALE).sendTransaction({ to: alice, value: 1n }),
    ).rejects.toThrow(); // anvil no longer signs for the whale
    // #endregion stop-impersonating
  });

  it("predicts CREATE addresses by setting the deployer's nonce", async () => {
    await anvil.cheats.setBalanceEther(WHALE, 1);
    // #region set-nonce
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
    // #endregion set-nonce
  });
});

describe("auto-impersonation", () => {
  // #region auto-impersonate
  // Every sender is impersonated: no per-address impersonate() calls.
  const node = useAnvil(
    anvilContainer(new AnvilOptions().account.autoImpersonate()),
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
  // #endregion auto-impersonate
});
