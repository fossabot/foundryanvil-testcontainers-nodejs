/**
 * Workflow: configuring the node itself — CORS for browser dApps, request
 * size, EVM limits, the mempool's balance checks, the default CREATE2
 * deployer, gas pricing, finality, history pruning and the genesis block
 * number — each verified through the test client.
 */
import {
  AnvilContainer,
  AnvilOptions,
  AnvilTransactionRevertedError,
  Hardfork,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import {
  type Address,
  concat,
  getContractAddress,
  type Hex,
  parseEther,
  parseGwei,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { fixedPriceOracle, oversizedContract } from "../../src";

/** The deterministic-deployment proxy anvil pre-deploys on every chain. */
const CREATE2_DEPLOYER: Address = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const ORIGIN = "https://app.example";

/** A browser's CORS preflight for a JSON-RPC POST from `ORIGIN`. */
function preflight(rpcUrl: string): Promise<Response> {
  return fetch(rpcUrl, {
    method: "OPTIONS",
    headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST" },
  });
}

describe("node configuration", () => {
  describe("CORS for browser dApps", () => {
    // #region cors
    const open = useAnvil(
      new AnvilContainer(new AnvilOptions().server.withAllowOrigin(ORIGIN)),
    );
    const closed = useAnvil(
      new AnvilContainer(new AnvilOptions().server.noCors()),
    );

    it("allows the configured origin", async () => {
      const response = await preflight(open.rpcUrl);
      expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    });

    it("rejects cross-origin requests with --no-cors", async () => {
      const response = await preflight(closed.rpcUrl);
      expect(response.ok).toBe(false);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });
    // #endregion cors
  });

  describe("request size", () => {
    // #region request-size
    const strict = useAnvil(new AnvilContainer());
    const unlimited = useAnvil(
      new AnvilContainer(new AnvilOptions().server.noRequestSizeLimit()),
    );
    // 2 MB of calldata: a request body of about 4 MB once hex encoded.
    const bigCall = {
      to: "0x0000000000000000000000000000000000000001",
      data: `0x${"00".repeat(2_000_000)}`,
      gas: 30_000_000n,
    } as const satisfies { to: Address; data: Hex; gas: bigint };

    it("rejects very large requests by default", async () => {
      await expect(strict.testClient.call(bigCall)).rejects.toThrow(
        /Invalid request/,
      );
    });

    it("accepts them with noRequestSizeLimit()", async () => {
      await expect(unlimited.testClient.call(bigCall)).resolves.toBeDefined();
    });
    // #endregion request-size
  });

  describe("contract size limit (EIP-170)", () => {
    // #region code-size
    const strict = useAnvil(
      new AnvilContainer().withTestClient((client) => client.withAccount(0)),
    );
    const raised = useAnvil(
      new AnvilContainer(
        new AnvilOptions().evm.withCodeSizeLimit(32_768),
      ).withTestClient((client) => client.withAccount(0)),
    );

    it("rejects contracts over 24,576 bytes by default", async () => {
      const hash = await strict.testClient.deployContract({
        abi: oversizedContract.abi,
        bytecode: oversizedContract.bytecode, // deploys 24,577 bytes
      });
      await expect(strict.confirm(hash)).rejects.toBeInstanceOf(
        AnvilTransactionRevertedError,
      );
    });

    it("deploys them with a raised limit (e.g. unoptimised debug builds)", async () => {
      const { contractAddress } = await raised.confirm(
        raised.testClient.deployContract({
          abi: oversizedContract.abi,
          bytecode: oversizedContract.bytecode,
        }),
      );
      const code = await raised.testClient.getCode({
        address: contractAddress!,
      });
      expect((code!.length - 2) / 2).toBe(24_577);
    });
    // #endregion code-size

    // #region no-code-size-limit
    const unlimited = useAnvil(
      new AnvilContainer(
        new AnvilOptions().evm.disableCodeSizeLimit(),
      ).withTestClient((client) => client.withAccount(0)),
    );

    it("deploys contracts of any size without a limit", async () => {
      const receipt = await unlimited.confirm(
        unlimited.testClient.deployContract({
          abi: oversizedContract.abi,
          bytecode: oversizedContract.bytecode,
        }),
      );
      expect(receipt.status).toBe("success");
    });
    // #endregion no-code-size-limit
  });

  describe("mempool balance checks", () => {
    // #region pool-balance-checks
    // Accept transactions whose sender cannot pay (yet): fund it before mining.
    const node = useAnvil(
      new AnvilContainer(
        new AnvilOptions().mining.withNoMining().evm.disablePoolBalanceChecks(),
      ),
    );

    it("queues a transaction from an unfunded sender", async () => {
      const user = privateKeyToAccount(generatePrivateKey()).address;
      const [alice] = await node.addresses();
      const hash = await node.testClient.sendUnsignedTransaction({
        from: user,
        to: alice,
        value: parseEther("1"),
      });
      expect((await node.testClient.getTxpoolStatus()).pending).toBe(1);

      await node.cheats.setBalanceEther(user, 2).mine();
      const receipt = await node.testClient.getTransactionReceipt({ hash });
      expect(receipt.status).toBe("success");
    });
    // #endregion pool-balance-checks
  });

  describe("gas pricing", () => {
    // #region gas-price
    // Pre-London chains have no base fee: pin the gas price the node suggests.
    const legacy = useAnvil(
      new AnvilContainer(
        new AnvilOptions().evm
          .withHardfork(Hardfork.Berlin)
          .withGasPrice(parseGwei("5")),
      ),
    );

    it("suggests the configured gas price", async () => {
      expect(await legacy.testClient.getGasPrice()).toBe(parseGwei("5"));
    });
    // #endregion gas-price

    // #region no-priority-fee
    // By default anvil suggests base fee + 1 gwei; drop the minimum tip.
    const tipless = useAnvil(
      new AnvilContainer(new AnvilOptions().evm.disableMinPriorityFee()),
    );

    it("suggests the base fee without a tip", async () => {
      const { baseFeePerGas } = await tipless.testClient.getBlock();
      expect(await tipless.testClient.getGasPrice()).toBe(baseFeePerGas);
    });
    // #endregion no-priority-fee
  });

  describe("finality", () => {
    // #region slots-in-an-epoch
    // `safe` trails the head by one epoch, `finalized` by two (default: 32 slots).
    const node = useAnvil(
      new AnvilContainer(new AnvilOptions().mining.withSlotsInAnEpoch(1)),
    );

    it("derives the safe and finalized blocks from the epoch length", async () => {
      await node.mine(5);
      const safe = await node.testClient.getBlock({ blockTag: "safe" });
      const finalized = await node.testClient.getBlock({
        blockTag: "finalized",
      });
      expect([safe.number, finalized.number]).toEqual([4n, 3n]);
    });
    // #endregion slots-in-an-epoch
  });

  describe("deterministic deployments", () => {
    // #region create2
    const node = useAnvil(
      new AnvilContainer().withTestClient((client) => client.withAccount(0)),
    );
    const bare = useAnvil(
      new AnvilContainer(
        new AnvilOptions().evm.disableDefaultCreate2Deployer(),
      ),
    );

    it("deploys to a precomputed address through the CREATE2 deployer", async () => {
      const salt = `0x${"00".repeat(31)}2a` as const;
      const predicted = getContractAddress({
        opcode: "CREATE2",
        from: CREATE2_DEPLOYER,
        salt,
        bytecode: fixedPriceOracle.bytecode,
      });
      // The deployer's calldata is simply salt ‖ creation code.
      await node.confirm(
        node.testClient.sendTransaction({
          to: CREATE2_DEPLOYER,
          data: concat([salt, fixedPriceOracle.bytecode]),
        }),
      );
      expect(
        await node.testClient.getCode({ address: predicted }),
      ).toBeDefined();
    });

    it("can start without the deployer (e.g. to deploy your own)", async () => {
      expect(
        await bare.testClient.getCode({ address: CREATE2_DEPLOYER }),
      ).toBeUndefined();
    });
    // #endregion create2
  });

  describe("block gas limit", () => {
    // #region block-gas-limit
    const limited = useAnvil(new AnvilContainer());
    const unlimited = useAnvil(
      new AnvilContainer(new AnvilOptions().evm.disableBlockGasLimit()),
    );

    it("rejects transactions above the block gas limit by default", async () => {
      const [alice, bob] = await limited.addresses();
      await expect(
        limited.testClient.sendTransaction({
          account: alice,
          to: bob,
          gas: 100_000_000n,
        }),
      ).rejects.toThrow(/gas/);
    });

    it("accepts them without a block gas limit (gas-heavy tests, fuzzing)", async () => {
      const [alice, bob] = await unlimited.addresses();
      const receipt = await unlimited.confirm(
        unlimited.testClient.sendTransaction({
          account: alice,
          to: bob,
          gas: 100_000_000n,
        }),
      );
      expect(receipt.status).toBe("success");
    });
    // #endregion block-gas-limit
  });

  describe("server", () => {
    // #region server
    // anvil listens on 9545 inside the container; the host port is mapped.
    const custom = useAnvil(
      new AnvilContainer(new AnvilOptions().server.withPort(9545).logs.quiet()),
    );

    it("maps the configured port to a free host port", async () => {
      const hostPort = custom.getMappedPort(9545);
      expect(custom.rpcUrl).toBe(`http://${custom.getHost()}:${hostPort}`);
      expect(await custom.testClient.getChainId()).toBe(31337);
    });

    it("starts quietly (no banner) and still knows the dev keys", async () => {
      expect(await custom.logText()).not.toContain("Available Accounts");
      const [first] = await custom.accounts(); // derived from the mnemonic
      expect(first.privateKey).toBeDefined();
    });
    // #endregion server
  });

  describe("history and genesis", () => {
    // #region history
    // Long-running suites: keep only the latest state in memory.
    const pruned = useAnvil(
      new AnvilContainer(new AnvilOptions().state.withPruneHistory()),
      { isolation: "none" },
    );
    // Start at a mainnet-like height.
    const tall = useAnvil(
      new AnvilContainer(new AnvilOptions().mining.withBlockNumber(20_000_000)),
    );

    it("answers historical queries only without pruning", async () => {
      const [alice] = await pruned.addresses();
      await pruned.cheats.setBalanceEther(alice, 1).mine(3);
      await expect(
        pruned.testClient.getBalance({ address: alice, blockNumber: 1n }),
      ).rejects.toThrow(/block height/);
      expect(await pruned.getBalance(alice)).toBe(parseEther("1"));
    });

    it("starts at the configured block number", async () => {
      expect(await tall.testClient.getBlockNumber()).toBe(20_000_000n);
    });
    // #endregion history

    // #region transaction-keeper
    // Keep transactions of the latest block only: older ones are forgotten.
    const forgetful = useAnvil(
      new AnvilContainer(
        new AnvilOptions().state.withTransactionBlockKeeper(1),
      ).withTestClient((client) => client.withAccount(0)),
    );

    it("forgets transactions of older blocks", async () => {
      const [, bob] = await forgetful.addresses();
      const { transactionHash: hash } = await forgetful.confirm(
        forgetful.testClient.sendTransaction({ to: bob, value: 1n }),
      );
      expect(await forgetful.testClient.getTransaction({ hash })).toBeDefined();

      await forgetful.mine(2);
      await expect(
        forgetful.testClient.getTransaction({ hash }),
      ).rejects.toThrow(/could not be found/);
    });
    // #endregion transaction-keeper
  });
});
