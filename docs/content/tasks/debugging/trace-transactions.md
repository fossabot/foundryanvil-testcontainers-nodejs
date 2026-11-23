---
title: Trace a failed transaction
description: Find the failing inner call with call traces, opcode traces and anvil's trace logs.
---

Enable tracing on the node:

```ts snippet="examples/test/e2e/debugging-and-tracing.e2e.test.ts#tracing-node"
const anvil = useAnvil(
  new AnvilContainer(
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
```

## The failing inner call

```ts snippet="examples/test/e2e/debugging-and-tracing.e2e.test.ts#call-tracer"
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
```

## Opcodes (`--steps-tracing`)

```ts snippet="examples/test/e2e/debugging-and-tracing.e2e.test.ts#struct-logs"
const { structLogs } = await anvil.rpc<{
  structLogs: { op: string; depth: number }[];
}>("debug_traceTransaction", [hash, {}]);
expect(structLogs.length).toBeGreaterThan(100);
expect(structLogs.filter((step) => step.op === "REVERT")).toHaveLength(2); // token, then vault
```

## A call, without sending it

```ts snippet="examples/test/e2e/debugging-and-tracing.e2e.test.ts#trace-call"
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
```

## anvil's own trace output (`--print-traces`)

```ts snippet="examples/test/e2e/debugging-and-tracing.e2e.test.ts#print-traces"
const logs = await anvil.logText(200); // last 200 lines of anvil's output
const selector = "0x192b9e4e"; // InsufficientAllowance(address,uint256,uint256)
expect(logs).toContain(`[Revert] custom error ${selector}`);
```

`trace_transaction` (Parity style) works through `anvil.rpc()` too.

## Concepts

- [Signing: why anvil-signed reverts are mined](../../concepts/signing.md)
- [Assert reverts and custom errors](../transactions/assert-reverts.md)
