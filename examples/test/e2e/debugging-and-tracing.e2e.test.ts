/**
 * Workflow: finding out *why* something failed — call traces, opcode traces,
 * anvil's own trace logs, and RPC methods beyond viem's actions.
 */
import {
  AnvilOptions,
  AnvilTransactionRevertedError,
  Color,
  LogVerbosity,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import {
  type Address,
  decodeErrorResult,
  encodeFunctionData,
  type Hash,
  type Hex,
  parseEther,
} from "viem";
import {
  deployToken,
  deployVault,
  exampleToken,
  mint,
  timeLockVault,
} from "../../src";
import { anvilContainer } from "../support/runtime";

/** A frame of geth's `callTracer` output. */
interface CallFrame {
  type: string;
  from: Address;
  to: Address;
  input: Hex;
  output?: Hex;
  error?: string;
  calls?: CallFrame[];
}

let token: Address;
let vault: Address;

// #region tracing-node
const anvil = useAnvil(
  anvilContainer(
    new AnvilOptions().evm
      .withPrintTraces() // call traces in anvil's log output
      .withStepsTracing() // opcode-level debug_traceTransaction
      .logs.verboseLogs(LogVerbosity.Three)
      .withColor(Color.Never), // plain text, easy to search
  ).withTestClient((client) => client.withAccount(0)),
  {
    setup: async (node) => {
      const [, alice] = await node.addresses();
      token = await deployToken(node.testClient);
      vault = await deployVault(node.testClient, token, 0n);
      await mint(node.testClient, token, alice, parseEther("10"));
    },
  },
);
// #endregion tracing-node

/** Alice deposits without approving first: the vault's token pull reverts. */
async function failedDeposit(): Promise<Hash> {
  const [, alice] = await anvil.addresses();
  const hash = await anvil.testClientFor(alice).writeContract({
    address: vault,
    abi: timeLockVault.abi,
    functionName: "deposit",
    args: [1n],
  });
  await expect(anvil.confirm(hash)).rejects.toBeInstanceOf(
    AnvilTransactionRevertedError,
  );
  return hash;
}

describe("debugging and tracing", () => {
  it("finds the failing inner call with the call tracer", async () => {
    const hash = await failedDeposit();
    // #region call-tracer
    const trace = await anvil.rpc<CallFrame>("debug_traceTransaction", [
      hash,
      { tracer: "callTracer" },
    ]);
    expect(trace.to.toLowerCase()).toBe(vault.toLowerCase());
    expect(trace.error).toBe("execution reverted");

    // The revert originated one level down, in the token:
    const [inner] = trace.calls!;
    expect(inner.to.toLowerCase()).toBe(token.toLowerCase());
    const cause = decodeErrorResult({
      abi: exampleToken.abi,
      data: inner.output!,
    });
    expect(cause.errorName).toBe("InsufficientAllowance");
    expect(cause.args).toEqual([vault, 0n, 1n]); // spender, allowance, needed
    // #endregion call-tracer
  });

  it("steps through opcodes (--steps-tracing)", async () => {
    const hash = await failedDeposit();
    // #region struct-logs
    const { structLogs } = await anvil.rpc<{
      structLogs: { op: string; depth: number }[];
    }>("debug_traceTransaction", [hash, {}]);
    expect(structLogs.length).toBeGreaterThan(100);
    expect(structLogs.filter((step) => step.op === "REVERT")).toHaveLength(2); // token, then vault
    // #endregion struct-logs
  });

  it("traces a call without sending a transaction", async () => {
    const [, alice, bob] = await anvil.addresses();
    // #region trace-call
    const trace = await anvil.rpc<CallFrame>("debug_traceCall", [
      {
        from: alice,
        to: token,
        data: encodeFunctionData({
          abi: exampleToken.abi,
          functionName: "transfer",
          args: [bob, 1n],
        }),
      },
      "latest",
      { tracer: "callTracer" },
    ]);
    expect(trace.type).toBe("CALL");
    expect(trace.error).toBeUndefined();
    // #endregion trace-call
  });

  it("returns Parity-style traces too", async () => {
    const hash = await failedDeposit();
    const traces = await anvil.rpc<
      { error?: string; traceAddress: number[] }[]
    >("trace_transaction", [hash]);
    expect(traces.map((trace) => trace.traceAddress)).toEqual([[], [0]]);
    expect(traces.every((trace) => trace.error)).toBe(true);
  });

  it("prints call traces to its logs (--print-traces)", async () => {
    await failedDeposit();
    // #region print-traces
    const logs = await anvil.logText(200); // last 200 lines of anvil's output
    const selector = "0x192b9e4e"; // InsufficientAllowance(address,uint256,uint256)
    expect(logs).toContain(`[Revert] custom error ${selector}`);
    // #endregion print-traces
  });

  it("silences node logging at runtime", async () => {
    const [, alice] = await anvil.addresses();
    // #region logging
    await anvil.setLoggingEnabled(false);
    try {
      const hash = await anvil.testClient.sendTransaction({
        to: alice,
        value: 1n,
      });
      await anvil.confirm(hash);
      expect(await anvil.logText()).not.toContain(hash);
    } finally {
      await anvil.setLoggingEnabled(true); // node setting: restore
    }
    // #endregion logging
  });

  it("reaches any RPC method, e.g. Otterscan's, with rpc()", async () => {
    const [deployer] = await anvil.addresses();
    // #region raw-rpc
    const { creator } = await anvil.rpc<{ hash: Hash; creator: Address }>(
      "ots_getContractCreator",
      [token],
    );
    expect(creator.toLowerCase()).toBe(deployer.toLowerCase());
    // #endregion raw-rpc
  });
});
