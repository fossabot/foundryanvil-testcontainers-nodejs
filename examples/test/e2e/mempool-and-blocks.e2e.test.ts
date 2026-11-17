/**
 * Workflow: controlling block production — several transactions in one
 * block, fee-based ordering, and editing the pending pool.
 */
import {
  AnvilOptions,
  Hardfork,
  Order,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import { type Address, type Hash, parseEther, parseGwei } from "viem";
import { deployToken, exampleToken, mint } from "../../src";
import { anvilContainer } from "../support/runtime";

let token: Address;

// #region no-mining
// Blocks are only mined on demand (anvil --no-mining). confirm() and the
// deploy fixtures mine a block when a transaction is still pending.
const anvil = useAnvil(
  anvilContainer(new AnvilOptions().mining.withNoMining()).withTestClient(
    (client) => client.withAccount(0),
  ),
  {
    setup: async (node) => {
      const [, alice] = await node.addresses();
      token = await deployToken(node.testClient);
      await mint(node.testClient, token, alice, parseEther("100"));
    },
  },
);
// #endregion no-mining

describe("mempool and block building", () => {
  it("puts several transactions into one block", async () => {
    const [, alice, bob] = await anvil.addresses();
    const asAlice = anvil.testClientFor(alice);
    // #region one-block
    const hashes: Hash[] = [];
    for (const amount of [1n, 2n, 3n]) {
      hashes.push(
        await asAlice.writeContract({
          address: token,
          abi: exampleToken.abi,
          functionName: "transfer",
          args: [bob, parseEther(String(amount))],
        }),
      );
    }
    expect(await anvil.testClient.getTxpoolStatus()).toEqual({
      pending: 3,
      queued: 0,
    });

    await anvil.mine();
    const receipts = await Promise.all(
      hashes.map((hash) => anvil.confirm(hash)),
    );
    expect(new Set(receipts.map((r) => r.blockNumber)).size).toBe(1);
    // #endregion one-block
  });

  it("orders a block by fee (anvil's default --order fees)", async () => {
    const [, alice, bob] = await anvil.addresses();
    // #region fee-order
    // anvil ranks pending transactions by their fee cap (maxFeePerGas).
    const cheap = await anvil.testClientFor(alice).sendTransaction({
      to: bob,
      maxFeePerGas: parseGwei("20"),
      maxPriorityFeePerGas: parseGwei("1"),
    });
    const generous = await anvil.testClientFor(bob).sendTransaction({
      to: alice,
      maxFeePerGas: parseGwei("200"),
      maxPriorityFeePerGas: parseGwei("2"),
    });
    await anvil.mine();

    const block = await anvil.testClient.getBlock();
    expect(block.transactions).toEqual([generous, cheap]); // sent later, mined first
    // #endregion fee-order
  });

  // #region pool-isolation
  it("may leave transactions pending…", async () => {
    const [, alice, bob] = await anvil.addresses();
    await anvil.testClientFor(alice).sendTransaction({ to: bob });
    expect((await anvil.testClient.getTxpoolStatus()).pending).toBe(1);
  });

  it("…because useAnvil empties the pool between tests", async () => {
    // Reverting a snapshot alone would keep them (and mine them next block).
    expect((await anvil.testClient.getTxpoolStatus()).pending).toBe(0);
  });
  // #endregion pool-isolation

  it("inspects and edits the pending pool", async () => {
    const [, alice, bob] = await anvil.addresses();
    // #region txpool
    const first = await anvil.testClientFor(alice).sendTransaction({ to: bob });
    await anvil.testClientFor(bob).sendTransaction({ to: alice });

    const { pending } = await anvil.testClient.getTxpoolContent();
    expect(Object.keys(pending)).toHaveLength(2); // two senders

    await anvil.cheats.dropTransaction(first); // alice's is gone…
    await anvil.cheats.removePoolTransactions(bob); // …and everything from bob
    expect(await anvil.testClient.getTxpoolStatus()).toEqual({
      pending: 0,
      queued: 0,
    });

    await anvil.testClientFor(alice).sendTransaction({ to: bob });
    await anvil.cheats.dropAllTransactions(); // or clear the pool at once
    expect((await anvil.testClient.getTxpoolStatus()).pending).toBe(0);
    // #endregion txpool
  });

  it("spills transactions into the next block when the gas limit is reached", async () => {
    const [, alice, bob] = await anvil.addresses();
    // #region gas-limit
    await anvil.cheats.setBlockGasLimit(50_000n); // room for two 21k transfers
    try {
      for (let i = 0; i < 3; i++) {
        await anvil.testClientFor(alice).sendTransaction({ to: bob });
      }
      await anvil.mine();
      expect((await anvil.testClient.getBlock()).transactions).toHaveLength(2);
      expect((await anvil.testClient.getTxpoolStatus()).pending).toBe(1);
    } finally {
      await anvil.cheats.setBlockGasLimit(30_000_000n); // node setting: restore
    }
    await anvil.mine();
    expect((await anvil.testClient.getBlock()).transactions).toHaveLength(1);
    // #endregion gas-limit
  });

  it("controls the base fee and pays tips to the coinbase", async () => {
    const [, alice, bob] = await anvil.addresses();
    const BUILDER: Address = "0x4444444444444444444444444444444444444444";
    const { miner } = await anvil.testClient.getBlock();
    // #region fees
    await anvil.cheats
      .setCoinbase(BUILDER)
      .setNextBlockBaseFeePerGas(parseGwei("10"));
    try {
      const hash = await anvil.testClientFor(alice).sendTransaction({
        to: bob,
        maxFeePerGas: parseGwei("20"),
        maxPriorityFeePerGas: parseGwei("2"),
      });
      await anvil.mine();
      const receipt = await anvil.confirm(hash);

      expect((await anvil.testClient.getBlock()).baseFeePerGas).toBe(
        parseGwei("10"),
      );
      expect(receipt.effectiveGasPrice).toBe(parseGwei("12")); // base fee + tip
      // The base fee is burned; the coinbase earns only the tip.
      expect(await anvil.getBalance(BUILDER)).toBe(
        parseGwei("2") * receipt.gasUsed,
      );
    } finally {
      await anvil.cheats.setCoinbase(miner); // node setting: restore
    }
    // #endregion fees
  });

  it("summarises the pool for humans and flushes it by enabling automine", async () => {
    const [, alice, bob] = await anvil.addresses();
    // #region automine-toggle
    const hash = await anvil.testClientFor(alice).sendTransaction({
      to: bob,
      value: 5n,
    });
    const { pending } = await anvil.testClient.inspectTxpool();
    expect(JSON.stringify(pending)).toMatch(/5 wei \+ 21000 gas/);

    await anvil.cheats.setAutomine(true); // mines everything pending…
    try {
      expect(
        (await anvil.testClient.getTransactionReceipt({ hash })).status,
      ).toBe("success");
      expect(await anvil.testClient.getAutomine()).toBe(true);
    } finally {
      await anvil.cheats.setAutomine(false); // …and back to on-demand mining
    }
    // #endregion automine-toggle
  });
});

describe("first-in, first-out ordering", () => {
  // #region fifo
  const node = useAnvil(
    anvilContainer(
      new AnvilOptions().mining.withNoMining().state.withOrder(Order.Fifo),
    ),
  );

  it("mines in arrival order regardless of fees", async () => {
    const [alice, bob] = await node.addresses();
    const cheap = await node.testClientFor(alice).sendTransaction({
      to: bob,
      maxFeePerGas: parseGwei("20"),
      maxPriorityFeePerGas: parseGwei("1"),
    });
    const generous = await node.testClientFor(bob).sendTransaction({
      to: alice,
      maxFeePerGas: parseGwei("200"),
      maxPriorityFeePerGas: parseGwei("2"),
    });
    await node.mine();
    expect((await node.testClient.getBlock()).transactions).toEqual([
      cheap,
      generous,
    ]);
  });
  // #endregion fifo
});

describe("legacy gas pricing (pre-London)", () => {
  // #region legacy-gas
  const node = useAnvil(
    anvilContainer(new AnvilOptions().evm.withHardfork(Hardfork.Berlin)),
  );

  it("sets the gas price the node suggests", async () => {
    const [alice, bob] = await node.addresses();
    await node.cheats.setMinGasPrice(parseGwei("5"));
    expect(await node.testClient.getGasPrice()).toBe(parseGwei("5"));

    const receipt = await node.confirm(
      node.testClient.sendTransaction({
        account: alice,
        to: bob,
        gasPrice: await node.testClient.getGasPrice(), // explicit on pre-London chains
      }),
    );
    expect(receipt.type).toBe("legacy");
    expect(receipt.effectiveGasPrice).toBe(parseGwei("5"));
  });
  // #endregion legacy-gas
});
