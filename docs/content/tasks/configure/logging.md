---
title: Configure logging
description: Quiet nodes, verbosity, colour, JSON and Markdown formats, and logging at runtime.
---

Set verbosity and format with `.logs`; toggle logging at runtime.

## Verbose, plain-text traces

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

## Formats

```ts snippet="examples/test/unit/options.test.ts#log-formats"
const json = new AnvilOptions().logs.jsonLogFormat().disableConsoleLog();
expect(json.toCommand()).toBe(
  "anvil --host 0.0.0.0 --json --disable-console-log",
);

const markdown = new AnvilOptions().logs
  .withMarkdownFormat()
  .verboseLogs(LogVerbosity.Four);
expect(markdown.toCommand()).toBe("anvil --host 0.0.0.0 --md -vvvv");

// Conflicting log settings fail as soon as they are set.
expect(() => new AnvilOptions().logs.quiet().verboseLogs(2)).toThrow(
  /cannot be combined with --quiet/,
);
```

`logs.quiet()` hides the startup banner; startup readiness does not depend
on logs. With a random mnemonic, quiet nodes cannot report private keys.

## At runtime

```ts snippet="examples/test/e2e/debugging-and-tracing.e2e.test.ts#logging"
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
```

## Deep dive

- [Inspect the node](../debugging/inspect-the-node.md)
- Reference: [`.logs` options](../../reference/anvil-options.md#logs)
