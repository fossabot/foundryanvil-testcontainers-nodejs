/**
 * Workflow: several users interacting with a contract — each with their own
 * typed client — plus simulation before sending and event assertions.
 */
import {
  anvilActions,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import {
  type Address,
  createPublicClient,
  getContract,
  http,
  parseEther,
  parseEventLogs,
} from "viem";
import {
  allowance,
  balanceOf,
  deployToken,
  exampleToken,
  mint,
} from "../../src";
import { anvilContainer } from "../support/runtime";

let token: Address;

const anvil = useAnvil(
  anvilContainer().withTestClient((client) => client.withAccount(0)),
  {
    setup: async (node) => {
      const [, alice] = await node.addresses();
      token = await deployToken(node.testClient);
      await mint(node.testClient, token, alice, parseEther("50"));
    },
  },
);

describe("multi-actor flows", () => {
  it("approve and transferFrom as different users", async () => {
    const [, alice, bob] = await anvil.addresses();
    // #region actors
    const asAlice = anvil.testClientFor(alice);
    const asBob = anvil.testClientFor(bob);

    await anvil.confirm(
      asAlice.writeContract({
        address: token,
        abi: exampleToken.abi,
        functionName: "approve",
        args: [bob, parseEther("10")],
      }),
    );
    const receipt = await anvil.confirm(
      asBob.writeContract({
        address: token,
        abi: exampleToken.abi,
        functionName: "transferFrom",
        args: [alice, bob, parseEther("4")],
      }),
    );

    const [transfer] = parseEventLogs({
      abi: exampleToken.abi,
      logs: receipt.logs,
      eventName: "Transfer",
    });
    expect(transfer.args).toEqual({
      from: alice,
      to: bob,
      value: parseEther("4"),
    });
    // #endregion actors
    expect(await allowance(asBob, token, alice, bob)).toBe(parseEther("6"));
  });

  it("simulates first, then sends exactly the simulated request", async () => {
    const [, alice, bob] = await anvil.addresses();
    const asAlice = anvil.testClientFor(alice);
    // #region simulate
    const { result, request } = await asAlice.simulateContract({
      address: token,
      abi: exampleToken.abi,
      functionName: "transfer",
      args: [bob, parseEther("1")],
    });
    expect(result).toBe(true); // typed from the ABI: boolean
    expect(await balanceOf(anvil.testClient, token, bob)).toBe(0n); // nothing sent yet

    await anvil.confirm(asAlice.writeContract(request));
    expect(await balanceOf(anvil.testClient, token, bob)).toBe(parseEther("1"));
    // #endregion simulate
  });

  it("runs many reads in parallel against one node", async () => {
    const addresses = await anvil.addresses();
    const balances = await Promise.all(
      addresses.map((address) => balanceOf(anvil.testClient, token, address)),
    );
    expect(balances[1]).toBe(parseEther("50"));
    expect(balances.filter((balance) => balance === 0n)).toHaveLength(
      addresses.length - 1,
    );
  });

  it("uses contract instances bound to a user's client", async () => {
    const [, alice, bob] = await anvil.addresses();
    // #region contract-instance
    const tokenAsAlice = getContract({
      address: token,
      abi: exampleToken.abi,
      client: anvil.testClientFor(alice),
    });

    const gas = await tokenAsAlice.estimateGas.transfer([bob, 1n]);
    const hash = await tokenAsAlice.write.transfer([bob, 1n]);
    const receipt = await anvil.confirm(hash);

    expect(receipt.gasUsed).toBeLessThanOrEqual(gas);
    expect(await tokenAsAlice.read.balanceOf([bob])).toBe(1n);
    // #endregion contract-instance
  });

  it("reads many values in one call with a deployless multicall", async () => {
    const [, alice, bob] = await anvil.addresses();
    // #region multicall
    // No Multicall3 on this chain: `deployless` runs it from bytecode in eth_call.
    const [name, supply, aliceBalance, broken] =
      await anvil.testClient.multicall({
        deployless: true,
        allowFailure: true,
        contracts: [
          { address: token, abi: exampleToken.abi, functionName: "name" },
          {
            address: token,
            abi: exampleToken.abi,
            functionName: "totalSupply",
          },
          {
            address: token,
            abi: exampleToken.abi,
            functionName: "balanceOf",
            args: [alice],
          },
          { address: bob, abi: exampleToken.abi, functionName: "totalSupply" }, // not a contract
        ],
      });
    expect(name).toEqual({ status: "success", result: "Example Token" });
    expect(supply.result).toBe(parseEther("50"));
    expect(aliceBalance.result).toBe(parseEther("50"));
    expect(broken.status).toBe("failure"); // reported, not thrown
    // #endregion multicall
  });

  it("batches concurrent JSON-RPC requests into fewer HTTP calls", async () => {
    const addresses = await anvil.addresses();
    // #region batching
    const batched = await anvil.createTestClient(
      (client) => client.withBatch({ wait: 5 }), // collect requests for 5 ms per HTTP call
    );
    const balances = await Promise.all(
      addresses.map((address) => balanceOf(batched, token, address)),
    );
    // #endregion batching
    expect(balances[1]).toBe(parseEther("50"));
  });

  it("queues a transaction until the nonce gap before it is filled", async () => {
    const [, alice, bob] = await anvil.addresses();
    const asAlice = anvil.testClientFor(alice);
    const transfer = (nonce: number) =>
      asAlice.writeContract({
        address: token,
        abi: exampleToken.abi,
        functionName: "transfer",
        args: [bob, parseEther("1")],
        nonce,
      });
    // #region nonces
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
    // #endregion nonces
  });

  it("gets the receipt in the same call (eth_sendTransactionSync)", async () => {
    const [, alice, bob] = await anvil.addresses();
    // #region sync
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
    // #endregion sync
  });

  it("sends Ether between dev accounts with a one-liner", async () => {
    const [, alice, bob] = await anvil.addresses();
    const before = await anvil.getBalance(bob);
    const receipt = await anvil.sendEthTransaction(alice, bob, "1.5");
    expect(receipt.status).toBe("success");
    expect(await anvil.getBalance(bob)).toBe(before + parseEther("1.5"));
  });

  it("works with clients you build yourself", async () => {
    const [, alice] = await anvil.addresses();
    // #region own-client
    // e.g. the client your application code already creates:
    const appClient = createPublicClient({
      chain: anvil.chain, // id, name and URLs of this node
      transport: http(anvil.rpcUrl),
    }).extend(anvilActions); // add the anvil extras to any viem client

    await appClient.addBalance({ address: alice, value: parseEther("1") });
    const balance = await appClient.readContract({
      address: token,
      abi: exampleToken.abi,
      functionName: "balanceOf",
      args: [alice],
    });
    expect(balance).toBe(parseEther("50"));
    // #endregion own-client
  });
});
