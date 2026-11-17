/**
 * Workflow: asking "what would happen if…?" without changing any state —
 * multi-block simulations with time overrides, call overrides, access lists,
 * gas and fee estimation, and storage proofs.
 */
import { useAnvil } from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import {
  type Address,
  encodeFunctionData,
  numberToHex,
  parseEther,
} from "viem";
import {
  balanceOf,
  deployToken,
  deployVault,
  exampleToken,
  mint,
  timeLockVault,
} from "../../src";
import { anvilContainer } from "../support/runtime";

const LOCK = 24n * 60n * 60n; // 1 day

let token: Address;
let vault: Address;
let alice: Address;

const anvil = useAnvil(
  anvilContainer().withTestClient((client) => client.withAccount(0)),
  {
    setup: async (node) => {
      [, alice] = await node.addresses();
      token = await deployToken(node.testClient);
      vault = await deployVault(node.testClient, token, LOCK);
      await mint(node.testClient, token, alice, parseEther("10"));
    },
  },
);

describe("simulation and gas", () => {
  it("simulates a multi-block story, including time travel, without sending anything", async () => {
    // #region simulate-blocks
    const now = (await anvil.testClient.getBlock()).timestamp;
    const [today, later] = await anvil.testClient.simulateBlocks({
      blocks: [
        {
          calls: [
            {
              from: alice,
              to: token,
              abi: exampleToken.abi,
              functionName: "approve",
              args: [vault, 5n],
            },
            {
              from: alice,
              to: vault,
              abi: timeLockVault.abi,
              functionName: "deposit",
              args: [5n],
            },
          ],
        },
        {
          blockOverrides: { time: now + 2n * LOCK }, // two days later
          calls: [
            {
              from: alice,
              to: vault,
              abi: timeLockVault.abi,
              functionName: "withdraw",
            },
          ],
        },
      ],
    });
    expect(today.calls.map((call) => call.status)).toEqual([
      "success",
      "success",
    ]);
    expect(later.calls[0].status).toBe("success");
    expect(later.timestamp).toBe(now + 2n * LOCK);

    // Nothing happened on chain:
    expect(await balanceOf(anvil.testClient, token, vault)).toBe(0n);
    // #endregion simulate-blocks
  });

  it("reports failing simulated calls instead of throwing", async () => {
    // #region simulate-failure
    const [block] = await anvil.testClient.simulateBlocks({
      blocks: [
        {
          calls: [
            {
              from: alice,
              to: vault,
              abi: timeLockVault.abi,
              functionName: "withdraw",
            },
            {
              from: alice,
              to: token,
              abi: exampleToken.abi,
              functionName: "balanceOf",
              args: [alice],
            },
          ],
        },
      ],
    });
    expect(block.calls[0].status).toBe("failure"); // NothingToWithdraw
    expect(block.calls[1]).toMatchObject({
      status: "success",
      result: parseEther("10"),
    });
    // #endregion simulate-failure
  });

  it("simulates a sequence of calls from one account", async () => {
    const [, , bob] = await anvil.addresses();
    // #region simulate-calls
    const { results } = await anvil.testClient.simulateCalls({
      account: alice,
      calls: [
        {
          to: token,
          abi: exampleToken.abi,
          functionName: "transfer",
          args: [bob, 1n],
        },
        { to: bob, value: parseEther("1") },
      ],
    });
    expect(results.map((result) => result.status)).toEqual([
      "success",
      "success",
    ]);
    expect(results[0].gasUsed).toBeGreaterThan(0n);
    // #endregion simulate-calls
  });

  it("overrides block fields for a single call", async () => {
    // Alice has a deposit that unlocks in a day.
    await anvil.confirm(
      anvil.testClientFor(alice).writeContract({
        address: token,
        abi: exampleToken.abi,
        functionName: "approve",
        args: [vault, 5n],
      }),
    );
    await anvil.confirm(
      anvil.testClientFor(alice).writeContract({
        address: vault,
        abi: timeLockVault.abi,
        functionName: "deposit",
        args: [5n],
      }),
    );
    // #region block-overrides
    const withdraw = {
      account: alice,
      to: vault,
      data: encodeFunctionData({
        abi: timeLockVault.abi,
        functionName: "withdraw",
      }),
    };
    const { timestamp } = await anvil.testClient.getBlock();

    await expect(anvil.testClient.call(withdraw)).rejects.toThrow(); // still locked
    await expect(
      anvil.testClient.call({
        ...withdraw,
        blockOverrides: { time: timestamp + LOCK + 1n },
      }),
    ).resolves.toBeDefined(); // would succeed after the lock
    // #endregion block-overrides
  });

  it("builds and uses an EIP-2930 access list", async () => {
    const [, , bob] = await anvil.addresses();
    // #region access-list
    const data = encodeFunctionData({
      abi: exampleToken.abi,
      functionName: "transfer",
      args: [bob, 1n],
    });
    const { accessList, gasUsed } = await anvil.testClient.createAccessList({
      account: alice,
      to: token,
      data,
    });
    expect(accessList[0].address.toLowerCase()).toBe(token.toLowerCase());
    expect(accessList[0].storageKeys.length).toBeGreaterThan(0); // both balances
    expect(gasUsed).toBeGreaterThan(0n);

    const receipt = await anvil.confirm(
      anvil
        .testClientFor(alice)
        .sendTransaction({ to: token, data, accessList }),
    );
    expect(receipt.type).toBe("eip1559");
    // #endregion access-list
  });

  it("estimates gas and fees", async () => {
    const [, , bob] = await anvil.addresses();
    // #region estimates
    const gas = await anvil.testClient.estimateContractGas({
      account: alice,
      address: token,
      abi: exampleToken.abi,
      functionName: "transfer",
      args: [bob, 1n],
    });
    const { maxFeePerGas, maxPriorityFeePerGas } =
      await anvil.testClient.estimateFeesPerGas();
    const history = await anvil.testClient.getFeeHistory({
      blockCount: 3,
      rewardPercentiles: [50],
    });

    expect(gas).toBeGreaterThan(21_000n);
    expect(maxFeePerGas).toBeGreaterThan(maxPriorityFeePerGas);
    expect(history.baseFeePerGas.length).toBeGreaterThan(0);
    // #endregion estimates
  });

  it("lets the node fill in a transaction", async () => {
    const [, , bob] = await anvil.addresses();
    // #region fill-transaction
    const { transaction } = await anvil.testClient.fillTransaction({
      account: alice,
      to: bob,
      value: 1n,
    });
    expect(transaction).toMatchObject({
      nonce: await anvil.testClient.getTransactionCount({ address: alice }),
      chainId: anvil.chainId,
      type: "eip1559",
    });
    expect(transaction.gas).toBe(21_000n);
    // #endregion fill-transaction
  });

  it("proves a storage slot (eth_getProof)", async () => {
    // #region proof
    const totalSupplySlot = numberToHex(2, { size: 32 }); // 3rd state variable
    const proof = await anvil.testClient.getProof({
      address: token,
      storageKeys: [totalSupplySlot],
    });
    expect(proof.storageProof[0].value).toBe(parseEther("10"));
    expect(proof.accountProof.length).toBeGreaterThan(0);
    // #endregion proof
  });
});
