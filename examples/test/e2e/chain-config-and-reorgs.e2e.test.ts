/**
 * Workflow: a custom chain (id, hardfork, gas limit, base fee, chain
 * metadata), what the node reports about it, runtime chain changes, client
 * caching and chain reorganisations.
 */
import {
  AnvilContainer,
  AnvilOptions,
  Hardfork,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import { parseEther, parseGwei } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// #region chain-config
const anvil = useAnvil(
  new AnvilContainer(
    new AnvilOptions().evm
      .withChainId(8453)
      .withHardfork(Hardfork.Cancun)
      .withGasLimit(60_000_000)
      .withBlockBaseFeePerGas(parseGwei("7")),
  ).withTestClient((client) =>
    client
      .withAccount(0)
      .withChain({
        name: "Local Base",
        blockExplorers: {
          default: { name: "None", url: "http://localhost" },
        },
      })
      .withPollingInterval(50),
  ),
);
// #endregion chain-config

describe("chain configuration and reorgs", () => {
  it("binds the test client to the configured chain", async () => {
    expect(anvil.chainId).toBe(8453);
    expect(anvil.testClient.chain.name).toBe("Local Base");
    expect(await anvil.testClient.getChainId()).toBe(8453);
    const block = await anvil.testClient.getBlock();
    expect(block.gasLimit).toBe(60_000_000n);
    expect(block.blobGasUsed).toBeDefined(); // Cancun header fields
    const genesis = await anvil.testClient.getBlock({ blockNumber: 0n });
    expect(genesis.baseFeePerGas).toBe(parseGwei("7"));
  });

  it("reports its configuration through node info and metadata", async () => {
    // #region node-info
    const info = await anvil.testClient.getNodeInfo();
    expect(info.hardFork.toLowerCase()).toBe("cancun");
    expect(info.environment.chainId).toBe(8453);
    expect(BigInt(info.environment.gasLimit)).toBe(60_000_000n);

    const metadata = await anvil.testClient.getMetadata();
    expect(metadata.clientVersion).toMatch(/anvil/);
    expect(metadata.forkedNetwork).toBeFalsy(); // not a fork

    // The exact command line anvil was started with, and the client settings:
    expect(anvil.configuration.command.join(" ")).toContain("--chain-id 8453");
    expect(anvil.testClientConfiguration.pollingInterval).toBe(50);
    expect((await anvil.nodeInfo()).currentBlockNumber).toBeDefined();
    // #endregion node-info
  });

  it("drops a confirmed transaction in a reorg", async () => {
    const [, alice] = await anvil.addresses();
    // #region reorg
    const receipt = await anvil.confirm(
      anvil.testClient.sendTransaction({ to: alice, value: parseEther("1") }),
    );
    await anvil.mine(2); // 3 confirmations

    // Replace the last 3 blocks with empty ones: the transaction disappears.
    await anvil.testClient.reorg({ depth: 3 });

    expect(await anvil.testClient.getBlockNumber()).toBe(
      receipt.blockNumber + 2n, // same height, different blocks
    );
    await expect(
      anvil.testClient.getTransactionReceipt({ hash: receipt.transactionHash }),
    ).rejects.toThrow(/could not be found/);
    // #endregion reorg
  });

  it("re-mines a reorg with different transactions", async () => {
    const [deployer, , bob] = await anvil.addresses();
    await anvil.mine(2);
    const before = await anvil.getBalance(bob);
    // #region reorg-replace
    // The new last block contains a payment to bob that never happened before.
    await anvil.testClient.reorg({
      depth: 1,
      transactions: [
        {
          transaction: { from: deployer, to: bob, value: parseEther("5") },
          block: 0,
        },
      ],
    });
    expect(await anvil.getBalance(bob)).toBe(before + parseEther("5"));
    // #endregion reorg-replace
  });

  it("rolls back the tip of the chain", async () => {
    // #region rollback
    const height = await anvil.testClient.getBlockNumber();
    await anvil.mine(5);

    await anvil.cheats.rollback(5); // remove the last 5 blocks (default 1)
    expect(await anvil.testClient.getBlockNumber()).toBe(height);

    await anvil.mine();
    await anvil.testClient.rollback(); // the same as a test client action
    expect(await anvil.testClient.getBlockNumber()).toBe(height);
    // #endregion rollback
  });

  it("changes the chain id at runtime", async () => {
    const [, alice] = await anvil.accounts();
    // #region set-chain-id
    await anvil.cheats.setChainId(10);
    try {
      expect(anvil.chainId).toBe(10); // the container's clients follow
      // Sign locally: anvil's own dev-account signer keeps the startup chain id.
      const signer = anvil.testClientFor(
        privateKeyToAccount(alice.privateKey!),
      );
      const receipt = await anvil.confirm(
        signer.sendTransaction({ to: alice.address, value: 1n }),
      );
      expect(receipt.status).toBe("success");
    } finally {
      await anvil.cheats.setChainId(8453); // node setting: restore
    }
    // #endregion set-chain-id
  });

  it("trades freshness for fewer requests with withCacheTime()", async () => {
    // #region cache-time
    const cached = await anvil.createTestClient((client) =>
      client.withCacheTime(60_000),
    );
    const height = await cached.getBlockNumber();
    await anvil.mine();

    expect(await cached.getBlockNumber()).toBe(height); // served from cache
    expect(await anvil.testClient.getBlockNumber()).toBe(height + 1n); // default: no cache
    // #endregion cache-time
  });
});
