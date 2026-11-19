---
title: TestClientOptions
description: Validated settings of the pre-configured viem test client.
---

For `AnvilContainer.withTestClient()` and `createTestClient()`.

```ts snippet="examples/test/unit/configuration.test.ts#client-options"
const client = new TestClientOptions()
  .withTransport("webSocket") // eth_subscribe-based watchers
  .withTimeout(5_000) // per request (default 10 000 ms)
  .withRetries(0, 50) // count, base delay in ms (default 3, 150)
  .withCacheTime(1_000) // reuse e.g. the block number for 1 s (default 0)
  .withPollingInterval(10) // watchers and receipt waits (default 25 ms)
  .withLocalAccount(0); // dev account 0, signed locally

expect(client.build()).toMatchObject({
  transport: "webSocket",
  timeout: 5_000,
  retryCount: 0,
  retryDelay: 50,
  account: { kind: "index", index: 0, signing: "local" },
});
// JSON-RPC batching needs HTTP:
expect(() => client.clone().withBatch().build()).toThrow(
  AnvilTestClientConfigurationError,
);
```

| Method | Default | Notes |
|---|---|---|
| `withTransport(transport)` | `"http"` | `"http"` or `"webSocket"` (same port) |
| `withPollingInterval(ms)` | 25 | watchers, receipt waits |
| `withCacheTime(ms)` | 0 | viem's response cache (e.g. block number) |
| `withTimeout(ms)` | 10 000 | per JSON-RPC request |
| `withRetries(count, delayMs?)` | 3, 150 | exponential backoff |
| `withBatch(batch?)` | off | `true`, `{ batchSize, wait }` or `false`; HTTP only |
| `withAccount(index \| address, { impersonate? })` | none | default account **signed by anvil**; `impersonate: true` unlocks a non-dev address at startup |
| `withLocalAccount(index \| privateKey \| LocalAccount)` | none | default account that **signs locally** |
| `withoutAccount()` | – | removes the default account |
| `withChain(overrides)` | `Anvil (<id>)`, ETH | `name`, `nativeCurrency`, `contracts`, `blockExplorers`, `testnet` (`TestClientChainOverrides`) |
| `withMulticall3(address?, blockCreated?)` | – | registers Multicall3 (`MULTICALL3_ADDRESS` by default) |
| `clone()` | – | independent copy |
| `build(configuration?)` | – | validated, frozen `TestClientConfiguration`; with an `AnvilConfiguration`, also checked against the flags |

Setters validate at once; before start, settings are checked against the anvil
options (`AnvilTestClientConfigurationError`):

| Rule | Example |
|---|---|
| A dev account index must exist | `withAccount(5)` with `account.withAccounts(2)` |
| Local signing needs a readable key | random / seeded mnemonic + `logs.quiet()` hides the key banner |
| anvil must be able to sign for an address | not a dev account, no `{ impersonate: true }`, no `autoImpersonate()` |
| Batching needs HTTP | `withBatch()` with `"webSocket"` |

Types: `TestClientConfiguration`, `TestClientTransport`,
`TestClientBatchOptions`, `TestClientChainOverrides`, `TestClientAccountSpec`.
Defaults: `DEFAULT_POLLING_INTERVAL_MS`, `DEFAULT_REQUEST_TIMEOUT_MS`,
`DEFAULT_RETRY_COUNT`, `DEFAULT_RETRY_DELAY_MS` ([Exports](exports.md#constants)).

Task: [Configure the test client](../tasks/configure/test-client.md).
