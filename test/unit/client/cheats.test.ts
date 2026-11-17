import * as path from "node:path";
import { parseEther } from "viem";
import {
  AnvilCheats,
  AnvilOptions,
  AnvilTestClientError,
  StartedAnvilContainer,
} from "../../../src";
import { FakeStartedTestContainer } from "../../helpers/fake-started-container";
import { MockRpcServer } from "../../helpers/mock-rpc-server";
import {
  CHEAT_NAMES,
  READ_ONLY_TEST_ACTIONS,
  VIEM_TEST_ACTIONS,
} from "../../helpers/viem-actions";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const T = "0x3333333333333333333333333333333333333333";
const HASH = `0x${"ab".repeat(32)}` as const;

describe("AnvilCheats", () => {
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

  const sent = () =>
    rpc.calls
      .filter((call) => call.method !== "eth_chainId")
      .map((call) => [call.method, call.params]);

  it("covers every state-changing viem test action", () => {
    const steps = new Set(Object.getOwnPropertyNames(AnvilCheats.prototype));
    const missing = VIEM_TEST_ACTIONS.filter(
      (name) => !READ_ONLY_TEST_ACTIONS.has(name),
    ).filter((name) => !steps.has(CHEAT_NAMES[name] ?? name));
    expect(missing).toEqual([]);
  });

  it("exposes every viem test action on the test client", () => {
    const client = anvil.testClient as unknown as Record<string, unknown>;
    const missing = VIEM_TEST_ACTIONS.filter(
      (name) => typeof client[name] !== "function",
    );
    expect(missing).toEqual([]);
    expect(anvil.testClient.mode).toBe("anvil");
  });

  it("queues steps lazily and runs them in order when awaited", async () => {
    const chain = anvil.cheats
      .setBalance(A, 1n)
      .setBalanceEther(A, "1.5")
      .addBalance(A, 2n)
      .dealErc20(T, A, 3n)
      .setErc20Allowance(T, A, B, 4n)
      .setCode(A, "0x6001")
      .setNonce(A, 5)
      .setStorageAt(A, 1, 255n)
      .setStorageAt(A, "0x2", `0x${"00".repeat(31)}01`)
      .impersonate(A)
      .stopImpersonating(A)
      .setAutoImpersonate(false)
      .mine()
      .mine(2, { minutes: 1 })
      .setAutomine(true)
      .setIntervalMining(0)
      .increaseTime({ hours: 1 })
      .setNextBlockTimestamp(new Date(1_700_000_000_000))
      .setTime(1_800_000_000)
      .setBlockTimestampInterval(12)
      .removeBlockTimestampInterval()
      .setCoinbase(B)
      .setMinGasPrice(6n)
      .setNextBlockBaseFeePerGas(7n)
      .setBlockGasLimit(8n)
      .dropTransaction(HASH)
      .dropAllTransactions()
      .removePoolTransactions(A)
      .setChainId(9)
      .setRpcUrl("http://fork")
      .setLoggingEnabled(false)
      .rollback()
      .rollback(2)
      .reset()
      .reset({ blockNumber: 3n })
      .loadState("0x1f8b0800000000000000")
      .step((client) => client.getBlockNumber(), "read block");

    expect(sent()).toEqual([]); // nothing ran yet
    expect(chain.plan).toHaveLength(37);
    expect(chain.plan.slice(0, 3)).toEqual([
      `setBalance(${A}, 1n)`,
      `setBalanceEther(${A}, 1.5)`,
      `addBalance(${A}, 2n)`,
    ]);
    expect(chain.plan).toContain('mine(2, {"minutes":1})');
    expect(chain.plan).toContain(
      "setNextBlockTimestamp(2023-11-14T22:13:20.000Z)",
    );
    expect(chain.plan).toContain("loadState(0x1f8b0800…)");
    expect(chain.plan.at(-1)).toBe("read block");

    await chain;

    expect(sent()).toEqual([
      ["anvil_setBalance", [A, "0x1"]],
      ["anvil_setBalance", [A, `0x${parseEther("1.5").toString(16)}`]],
      ["anvil_addBalance", [A, "0x2"]],
      ["anvil_dealERC20", [A, T, "0x3"]],
      ["anvil_setERC20Allowance", [A, B, T, "0x4"]],
      ["anvil_setCode", [A, "0x6001"]],
      ["anvil_setNonce", [A, "0x5"]],
      ["anvil_setStorageAt", [A, "0x1", `0x${"00".repeat(31)}ff`]],
      ["anvil_setStorageAt", [A, "0x2", `0x${"00".repeat(31)}01`]],
      ["anvil_impersonateAccount", [A]],
      ["anvil_stopImpersonatingAccount", [A]],
      ["anvil_autoImpersonateAccount", [false]],
      ["anvil_mine", ["0x1", "0x0"]],
      ["anvil_mine", ["0x2", "0x3c"]],
      ["evm_setAutomine", [true]],
      ["evm_setIntervalMining", [0]],
      ["evm_increaseTime", ["0xe10"]],
      ["evm_setNextBlockTimestamp", ["0x6553f100"]],
      ["evm_setTime", ["0x6b49d200"]],
      ["anvil_setBlockTimestampInterval", [12]],
      ["anvil_removeBlockTimestampInterval", []],
      ["anvil_setCoinbase", [B]],
      ["anvil_setMinGasPrice", ["0x6"]],
      ["anvil_setNextBlockBaseFeePerGas", ["0x7"]],
      ["evm_setBlockGasLimit", ["0x8"]],
      ["anvil_dropTransaction", [HASH]],
      ["anvil_dropAllTransactions", []],
      ["anvil_removePoolTransactions", [A]],
      ["anvil_setChainId", [9]],
      ["anvil_setRpcUrl", ["http://fork"]],
      ["anvil_setLoggingEnabled", [false]],
      ["anvil_rollback", [null]],
      ["anvil_rollback", [2]],
      ["anvil_nodeInfo", []], // reset() checks for a fork first
      ["anvil_reset", []],
      ["anvil_reset", [{ forking: { blockNumber: 3 } }]],
      ["anvil_loadState", ["0x1f8b0800000000000000"]],
      ["eth_blockNumber", []],
    ]);
    // setChainId followed by reset: the container re-read the chain id.
    expect(anvil.chainId).toBe(9);
  });

  it("runs once, even when awaited repeatedly", async () => {
    const chain = anvil.cheats.mine();
    await chain;
    await chain;
    await chain.run();
    expect(rpc.callsFor("anvil_mine")).toHaveLength(1);
    expect(() => chain.mine()).toThrow(
      expect.objectContaining({
        code: "CHEATS_ALREADY_RUN",
        message: expect.stringMatching(
          /Cannot add mine\(\) to a cheats chain that has already run/,
        ) as unknown,
      }) as Error,
    );
    // Every access starts a new chain.
    expect(anvil.cheats).not.toBe(anvil.cheats);
    await anvil.cheats; // empty chains resolve immediately
  });

  it("validates arguments when a step is queued", () => {
    const cases: Array<[() => unknown, RegExp]> = [
      [() => anvil.cheats.increaseTime(-1), /increaseTime: /],
      [() => anvil.cheats.mine(1, { days: 0.5 }), /mine.days/],
      [() => anvil.cheats.setIntervalMining(-1), /setIntervalMining/],
      [() => anvil.cheats.setNextBlockTimestamp(new Date("x")), /invalid Date/],
      [() => anvil.cheats.setTime(1.5), /setTime/],
      [
        () => anvil.cheats.setBlockTimestampInterval(-2),
        /setBlockTimestampInterval/,
      ],
      [() => anvil.cheats.setBalanceEther(A, "lots"), /lots/],
    ];
    for (const [run, message] of cases) expect(run).toThrow(message);
  });

  it("names the failing step, keeps the cause and skips later steps", async () => {
    rpc.failNext.set("anvil_setMinGasPrice", {
      code: -32602,
      message: "anvil_setMinGasPrice is not supported when EIP-1559 is active",
    });
    const error = (await anvil.cheats
      .setBalance(A, 1n)
      .setMinGasPrice(1n)
      .mine()
      .catch((e: unknown) => e)) as AnvilTestClientError;
    expect(error).toBeInstanceOf(AnvilTestClientError);
    expect(error.code).toBe("CHEAT_FAILED");
    expect(error.message).toBe(
      "anvil.cheats step 2/3 setMinGasPrice(1n) failed: Invalid parameters were provided to the RPC method: " +
        "anvil_setMinGasPrice is not supported when EIP-1559 is active (steps 1–1 were applied)",
    );
    expect(error.cause).toBeDefined();
    expect(rpc.callsFor("anvil_mine")).toHaveLength(0);

    const first = (await anvil.cheats
      .step(() => Promise.reject(new Error("custom")), "my step")
      .catch((e: unknown) => e)) as Error;
    expect(first.message).toBe("anvil.cheats step 1/1 my step failed: custom");
    const plain = (await anvil.cheats
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      .step(() => Promise.reject("text"))
      .catch((e: unknown) => e)) as Error;
    expect(plain.message).toBe("anvil.cheats step 1/1 step failed: text");
  });

  it("supports then / catch / finally like a promise", async () => {
    let finished = false;
    await anvil.cheats.mine().finally(() => (finished = true));
    expect(finished).toBe(true);
    await expect(anvil.cheats.mine().catch(() => "unused")).resolves.toBe(
      undefined,
    );
    await expect(anvil.cheats.mine().then(() => "done")).resolves.toBe("done");
    rpc.failNext.set("anvil_mine", { code: -32602, message: "x" });
    await expect(
      anvil.cheats.mine().then(undefined, () => "handled"),
    ).resolves.toBe("handled");
  });
});
