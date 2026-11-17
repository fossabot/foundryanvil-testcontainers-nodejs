/**
 * Workflow: configuring the node itself — CORS for browser dApps, EVM
 * limits, the default CREATE2 deployer, history pruning and the genesis
 * block number — each verified through the test client.
 */
import {
  AnvilOptions,
  AnvilTransactionRevertedError,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import { type Address, concat, getContractAddress, parseEther } from "viem";
import { fixedPriceOracle, oversizedContract } from "../../src";
import { anvilContainer } from "../support/runtime";

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
      anvilContainer(new AnvilOptions().server.withAllowOrigin(ORIGIN)),
    );
    const closed = useAnvil(anvilContainer(new AnvilOptions().server.noCors()));

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

  describe("contract size limit (EIP-170)", () => {
    // #region code-size
    const strict = useAnvil(
      anvilContainer().withTestClient((client) => client.withAccount(0)),
    );
    const raised = useAnvil(
      anvilContainer(
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
  });

  describe("deterministic deployments", () => {
    // #region create2
    const node = useAnvil(
      anvilContainer().withTestClient((client) => client.withAccount(0)),
    );
    const bare = useAnvil(
      anvilContainer(new AnvilOptions().evm.disableDefaultCreate2Deployer()),
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
    const limited = useAnvil(anvilContainer());
    const unlimited = useAnvil(
      anvilContainer(new AnvilOptions().evm.disableBlockGasLimit()),
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
      anvilContainer(new AnvilOptions().server.withPort(9545).logs.quiet()),
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
      anvilContainer(new AnvilOptions().state.withPruneHistory()),
      { isolation: "none" },
    );
    // Start at a mainnet-like height.
    const tall = useAnvil(
      anvilContainer(new AnvilOptions().mining.withBlockNumber(20_000_000)),
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
  });
});
