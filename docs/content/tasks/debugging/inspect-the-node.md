---
title: Inspect the node
description: Node info, metadata, the exact command line, client settings and logs.
---

```ts snippet="examples/test/e2e/chain-config-and-reorgs.e2e.test.ts#node-info"
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
```

| Member | Returns |
|---|---|
| `nodeInfo()` / `testClient.getNodeInfo()` | `anvil_nodeInfo`: block, hardfork, fees, fork config |
| `metadata()` / `testClient.getMetadata()` | `anvil_metadata`: version, chain id, fork, snapshots |
| `configuration` | the validated anvil configuration (`command`, `flags`, …) |
| `testClientConfiguration` | the test client settings in effect |
| `logText(tail?)` | anvil's output so far |
| `rpcUrl`, `wsUrl`, `chainId`, `chain` | connection details |

## Logs

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

- [Configure logging](../configure/logging.md)
- Reference: [`StartedAnvilContainer`](../../reference/started-anvil-container.md#diagnostics)
