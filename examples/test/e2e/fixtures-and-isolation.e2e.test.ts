/**
 * Workflow: deploy fixtures once per test file, then give every test a clean
 * copy of that state (milliseconds, instead of a new node per test) — plus
 * the lower-level snapshot tools and resetting a node.
 */
import {
  AnvilContainer,
  AnvilOptions,
  AnvilTestClientError,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import { type Address, parseEther } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import {
  ARTIFACTS_DIR,
  balanceOf,
  deployToken,
  deployVault,
  exampleToken,
  mint,
  timeLockVault,
} from "../../src";

/** A BIP-39 test vector: any 12–24 word mnemonic works. */
const MNEMONIC =
  "legal winner thank year wave sausage worth useful legal winner thank yellow";

// #region fixture
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
// #endregion fixture

describe("fixtures and per-test isolation", () => {
  it("starts from the deployed fixture", async () => {
    const [, alice] = await anvil.addresses();
    expect(await balanceOf(anvil.testClient, token, alice)).toBe(
      parseEther("100"),
    );
    expect(
      await anvil.testClient.readContract({
        address: vault,
        abi: timeLockVault.abi,
        functionName: "token",
      }),
    ).toBe(token);
  });

  it("loads artifacts through the node", async () => {
    // #region container-artifacts
    const abi = anvil.contractAbi("ExampleToken/ExampleToken.json");
    const bytecode = anvil.contractBytecode("ExampleToken/ExampleToken.bin");
    const [deployer] = await anvil.addresses();

    const receipt = await anvil.deployContract(abi, bytecode, deployer, [
      "Second",
      "TWO",
    ]);
    expect(
      await anvil.testClient.readContract({
        address: receipt.contractAddress!,
        abi,
        functionName: "symbol",
      }),
    ).toBe("TWO");
    // #endregion container-artifacts
  });

  it("derives the dev accounts and their keys from the configured mnemonic", async () => {
    // #region accounts
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
    // #endregion accounts
  });

  // #region isolation
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
  // #endregion isolation

  it("isolates a block of code inside one test with withSnapshot()", async () => {
    const [, alice] = await anvil.addresses();
    // #region what-if
    const whatIf = await anvil.withSnapshot(async (client) => {
      await anvil.cheats.dealErc20(token, alice, 0n);
      return balanceOf(client, token, alice);
    });
    expect(whatIf).toBe(0n); // inside the snapshot
    expect(await balanceOf(anvil.testClient, token, alice)).toBe(
      parseEther("100"), // reverted afterwards
    );
    // #endregion what-if
  });

  it("runs table-driven scenarios from one checkpoint", async () => {
    const [, alice] = await anvil.addresses();
    // #region checkpoint
    const start = await anvil.checkpoint(); // restorable any number of times
    for (const amount of [1n, 50n, 100n]) {
      await anvil.confirm(
        anvil.testClientFor(alice).writeContract({
          address: token,
          abi: exampleToken.abi,
          functionName: "transfer",
          args: [vault, parseEther(String(amount))],
        }),
      );
      expect(await balanceOf(anvil.testClient, token, vault)).toBe(
        parseEther(String(amount)),
      );
      await start.restore(); // back to the state before the transfer
    }
    // #endregion checkpoint
  });

  it("snapshots are strict: a used snapshot cannot be reverted to again", async () => {
    // #region strict-snapshots
    const id = await anvil.snapshot();
    await anvil.revert(id);

    const error = await anvil.revert(id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnvilTestClientError);
    expect((error as AnvilTestClientError).code).toBe("SNAPSHOT_NOT_FOUND");
    // #endregion strict-snapshots
  });
});

describe("accumulating state and reset()", () => {
  // #region no-isolation
  // reset() discards every snapshot, so this suite opts out of isolation.
  const node = useAnvil(
    new AnvilContainer().withTestClient((client) => client.withAccount(0)),
    { isolation: "none" },
  );
  let deployed: Address;

  it("deploys a token…", async () => {
    deployed = await deployToken(node.testClient);
    expect(await node.testClient.getCode({ address: deployed })).toBeDefined();
  });

  it("…which the next test still sees (no isolation)…", async () => {
    expect(await node.testClient.getCode({ address: deployed })).toBeDefined();
  });

  it("…until reset() returns the node to genesis", async () => {
    await node.reset();
    expect(await node.testClient.getBlockNumber()).toBe(0n);
    expect(
      await node.testClient.getCode({ address: deployed }),
    ).toBeUndefined();
  });
  // #endregion no-isolation
});
