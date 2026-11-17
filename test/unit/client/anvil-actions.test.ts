import * as path from "node:path";
import { createTestClient, http } from "viem";
import {
  anvilActions,
  AnvilOptions,
  AnvilTestClientError,
  AnvilTransactionRevertedError,
  StartedAnvilContainer,
} from "../../../src";
import { FakeStartedTestContainer } from "../../helpers/fake-started-container";
import { MockRpcServer } from "../../helpers/mock-rpc-server";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const T = "0x3333333333333333333333333333333333333333";
const HASH = `0x${"11".repeat(32)}` as const;

describe("anvil actions", () => {
  let rpc: MockRpcServer;
  let anvil: StartedAnvilContainer;

  beforeEach(async () => {
    rpc = await new MockRpcServer().start();
    anvil = new StartedAnvilContainer(
      new FakeStartedTestContainer("127.0.0.1", { 8545: rpc.port }),
      {
        rpcUrl: rpc.url,
        chainId: 31337,
        configuration: new AnvilOptions().build(),
        artifactsDir: path.resolve("test/artifacts"),
      },
    );
  });

  afterEach(async () => {
    await rpc.stop();
  });

  const params = (method: string) =>
    rpc.callsFor(method).map((call) => call.params);

  it("sends the anvil RPC methods viem does not wrap", async () => {
    const c = anvil.testClient;
    await c.addBalance({ address: A, value: 10n });
    await c.dealErc20({ token: T, address: A, amount: 5n });
    await c.setErc20Allowance({ token: T, owner: A, spender: B, amount: 6n });
    await c.setTime({ timestamp: new Date(1_700_000_000_000) });
    await c.setTime({ timestamp: 7 });
    await c.setAutoImpersonate(true);
    await c.dropAllTransactions();
    await c.removePoolTransactions({ address: A });
    await c.rollback();
    await c.rollback({ depth: 3 });
    await c.reorg({ depth: 2 });
    await c.reorg({
      depth: 1,
      transactions: [
        { transaction: "0xdead", block: 0 },
        { transaction: { from: A, to: B, value: 1n }, block: 0 },
      ],
    });

    expect(params("anvil_addBalance")).toEqual([[A, "0xa"]]);
    expect(params("anvil_dealERC20")).toEqual([[A, T, "0x5"]]);
    expect(params("anvil_setERC20Allowance")).toEqual([[A, B, T, "0x6"]]);
    expect(params("evm_setTime")).toEqual([["0x6553f100"], ["0x7"]]);
    expect(params("anvil_autoImpersonateAccount")).toEqual([[true]]);
    expect(params("anvil_dropAllTransactions")).toEqual([[]]);
    expect(params("anvil_removePoolTransactions")).toEqual([[A]]);
    expect(params("anvil_rollback")).toEqual([[null], [3]]);
    expect(params("anvil_reorg")).toEqual([
      [2, []],
      [
        1,
        [
          ["0xdead", 0],
          [{ from: A, to: B, value: "0x1" }, 0],
        ],
      ],
    ]);
  });

  it("reads interval mining, node info and metadata", async () => {
    const c = anvil.testClient;
    expect(await c.getIntervalMining()).toBeUndefined();
    rpc.overrides.set("anvil_getIntervalMining", () => 5);
    expect(await c.getIntervalMining()).toBe(5);
    expect((await c.getNodeInfo()).hardFork).toBe("prague");
    expect((await c.getMetadata()).chainId).toBe(31337);
  });

  it("validates integer arguments before sending", async () => {
    const c = anvil.testClient;
    await expect(c.setChainId({ chainId: 0 })).rejects.toThrow(
      /setChainId: expected a positive integer, received 0/,
    );
    await expect(c.rollback({ depth: 1.5 })).rejects.toThrow(/rollback.depth/);
    await expect(c.reorg({ depth: -1 })).rejects.toThrow(/reorg.depth/);
    await expect(c.setTime({ timestamp: -1 })).rejects.toThrow(/setTime/);
    expect(rpc.calls.filter((call) => call.method !== "eth_chainId")).toEqual(
      [],
    );
  });

  describe("reset", () => {
    it("resets to genesis without fork parameters (viem's version fails there)", async () => {
      await anvil.testClient.reset();
      await anvil.testClient.reset({});
      await anvil.reset();
      expect(params("anvil_reset")).toEqual([[], [], []]);
      expect(rpc.callsFor("anvil_nodeInfo")).toHaveLength(3);
    });

    it("re-forks a forked node at its current fork block instead of detaching it", async () => {
      rpc.overrides.set("anvil_nodeInfo", () => ({
        forkConfig: { forkUrl: "http://upstream:8545", forkBlockNumber: 42 },
      }));
      await anvil.reset();
      rpc.overrides.set("anvil_nodeInfo", () => ({
        forkConfig: { forkUrl: "http://upstream:8545", forkBlockNumber: null },
      }));
      await anvil.testClient.reset();
      expect(params("anvil_reset")).toEqual([
        [{ forking: { jsonRpcUrl: "http://upstream:8545", blockNumber: 42 } }],
        [{ forking: { jsonRpcUrl: "http://upstream:8545" } }],
      ]);
    });

    it("passes fork parameters, omitting absent ones", async () => {
      await anvil.testClient.reset({ blockNumber: 5n });
      await anvil.testClient.reset({ jsonRpcUrl: "http://fork" });
      await anvil.testClient.reset({ blockNumber: 0, jsonRpcUrl: "http://x" });
      expect(params("anvil_reset")).toEqual([
        [{ forking: { blockNumber: 5 } }],
        [{ forking: { jsonRpcUrl: "http://fork" } }],
        [{ forking: { jsonRpcUrl: "http://x", blockNumber: 0 } }],
      ]);
      expect(rpc.callsFor("anvil_nodeInfo")).toHaveLength(0);
    });

    it("re-reads the chain id afterwards", async () => {
      rpc.chainId = 5;
      await anvil.reset();
      expect(anvil.chainId).toBe(5);
      expect(anvil.chain.name).toBe("Anvil (5)");
    });
  });

  describe("strict revert", () => {
    it("passes when anvil reverts", async () => {
      await anvil.testClient.revert({ id: "0x1" });
      expect(params("evm_revert")).toEqual([["0x1"]]);
    });

    it("throws SNAPSHOT_NOT_FOUND when anvil answers false or 'Resource not found'", async () => {
      rpc.overrides.set("evm_revert", () => false);
      const error = await anvil.revert("0x9").catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AnvilTestClientError);
      expect(error).toMatchObject({
        code: "SNAPSHOT_NOT_FOUND",
        message: expect.stringMatching(
          /evm_revert\(0x9\) failed: the snapshot does not exist.*checkpoint\(\).*reset\(\)/,
        ) as unknown,
      });

      rpc.overrides.delete("evm_revert");
      rpc.failNext.set("evm_revert", {
        code: -32001,
        message: "Resource not found",
      });
      await expect(anvil.revert("0x9")).rejects.toMatchObject({
        code: "SNAPSHOT_NOT_FOUND",
      });
    });

    it("rethrows other failures", async () => {
      // -32602 is not retried by viem (unlike -32603).
      rpc.failNext.set("evm_revert", { code: -32602, message: "boom" });
      await expect(anvil.revert("0x1")).rejects.toThrow(/boom/);
    });

    it("withSnapshot keeps the callback's error when the revert fails too", async () => {
      rpc.overrides.set("evm_revert", () => false);
      await expect(
        anvil.withSnapshot(() => Promise.reject(new Error("inner"))),
      ).rejects.toThrow("inner");
    });

    it("makes withSnapshot / checkpoint fail loudly", async () => {
      rpc.overrides.set("evm_revert", () => false);
      await expect(
        anvil.withSnapshot(() => Promise.resolve()),
      ).rejects.toMatchObject({
        code: "SNAPSHOT_NOT_FOUND",
      });
      const base = await anvil.checkpoint();
      expect(base.id).toBe("0x1");
      await expect(base.restore()).rejects.toMatchObject({
        code: "SNAPSHOT_NOT_FOUND",
      });
    });
  });

  describe("confirmTransaction", () => {
    it("returns an existing receipt without mining", async () => {
      const receipt = await anvil.testClient.confirmTransaction({ hash: HASH });
      expect(receipt.status).toBe("success");
      expect(rpc.callsFor("anvil_mine")).toHaveLength(0);
    });

    it("mines one block when automine is off", async () => {
      rpc.automine = false;
      rpc.pending = true;
      const receipt = await anvil.confirm(Promise.resolve(HASH));
      expect(receipt.status).toBe("success");
      expect(params("anvil_mine")).toEqual([["0x1"]]);
    });

    it("throws AnvilTransactionRevertedError with the replayed revert reason", async () => {
      rpc.receiptStatus = "0x0";
      rpc.failNext.set("eth_call", {
        code: 3,
        message: "execution reverted: nope",
      });
      const error = await anvil.confirm(HASH).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AnvilTransactionRevertedError);
      const reverted = error as AnvilTransactionRevertedError;
      expect(reverted.code).toBe("TRANSACTION_REVERTED");
      expect(reverted.hash).toBe(HASH);
      expect(reverted.receipt.status).toBe("reverted");
      expect(reverted.reason).toMatch(/nope/);
      expect(reverted.message).toMatch(
        new RegExp(
          `Transaction ${HASH} reverted in block 0: .*nope.*throwOnRevert: false`,
        ),
      );
      const [call] = params("eth_call");
      expect(call[1]).toBe("0x0");
    });

    it("reports reverts without a recoverable reason", async () => {
      rpc.receiptStatus = "0x0";
      const error = (await anvil
        .confirm(HASH)
        .catch((e: unknown) => e)) as AnvilTransactionRevertedError;
      expect(error.reason).toBeUndefined();
      expect(error.message).toMatch(/no revert reason available/);
    });

    it("does not mistake other receipt failures for a pending transaction", async () => {
      rpc.failNext.set("eth_getTransactionReceipt", {
        code: -32602,
        message: "bad hash",
      });
      await expect(anvil.confirm(HASH)).rejects.toThrow(/bad hash/);
      expect(rpc.callsFor("anvil_getAutomine")).toHaveLength(0);
    });

    it("returns reverted receipts with throwOnRevert: false", async () => {
      rpc.receiptStatus = "0x0";
      await anvil.testClient.mine({ blocks: 2 });
      const receipt = await anvil.confirm(HASH, { throwOnRevert: false });
      expect(receipt.status).toBe("reverted");
      expect(rpc.callsFor("eth_call")).toHaveLength(0);
    });

    it("replays at the parent block", async () => {
      rpc.receiptStatus = "0x0";
      await anvil.testClient.mine({ blocks: 3 });
      await anvil.confirm(HASH).catch(() => undefined);
      expect(params("eth_call")[0][1]).toBe("0x2");
    });
  });

  it("decorates any viem client", async () => {
    const client = createTestClient({
      mode: "anvil",
      transport: http(rpc.url),
    }).extend(anvilActions);
    await client.addBalance({ address: A, value: 1n });
    await client.setChainId({ chainId: 10 });
    expect(params("anvil_addBalance")).toEqual([[A, "0x1"]]);
    expect(params("anvil_setChainId")).toEqual([[10]]);
  });
});

describe("createAnvilTestClient (internal)", () => {
  it("works without a usability guard", async () => {
    const {
      createAnvilTestClient,
      createAnvilChain,
      DEFAULT_TEST_CLIENT_CONFIGURATION,
    } = await import("../../../src/client/test-client");
    const rpc = await new MockRpcServer().start();
    try {
      const client = createAnvilTestClient({
        chain: createAnvilChain(31337, rpc.url),
        rpcUrl: rpc.url,
        configuration: DEFAULT_TEST_CLIENT_CONFIGURATION,
      });
      expect(await client.getChainId()).toBe(31337);
    } finally {
      await rpc.stop();
    }
  });
});
