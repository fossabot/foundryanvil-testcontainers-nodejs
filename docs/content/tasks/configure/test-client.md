---
title: Configure the test client
description: Transport, polling, caching, timeouts, retries, batching, chain metadata and presets.
---

Pass `TestClientOptions` (or a function building them) to
`withTestClient()`:

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

## Presets

```ts snippet="examples/test/unit/configuration.test.ts#presets"
const base = new TestClientOptions()
  .withPollingInterval(50)
  .withRetries(0) // fail fast on a local node
  .withChain({ name: "Local" });

const asDeployer = base.clone().withAccount(0);
const readOnly = asDeployer.clone().withoutAccount();
const mainnetFork = base.clone().withMulticall3(); // Multicall3 exists on forks of mainnet

expect(asDeployer.build().account).toEqual({
  kind: "index",
  index: 0,
  signing: "node",
});
expect(readOnly.build().account).toBeUndefined();
expect(mainnetFork.build().chain.contracts?.multicall3?.address).toBe(
  "0xcA11bde05977b3631167028862bE2a173976CA11",
);
expect(base.build().pollingInterval).toBe(50); // presets stay untouched
```

## Extra clients with other settings

```ts snippet="examples/test/e2e/chain-config-and-reorgs.e2e.test.ts#cache-time"
const cached = await anvil.createTestClient((client) =>
  client.withCacheTime(60_000),
);
const height = await cached.getBlockNumber();
await anvil.mine();

expect(await cached.getBlockNumber()).toBe(height); // served from cache
expect(await anvil.testClient.getBlockNumber()).toBe(height + 1n); // default: no cache
```

```ts snippet="examples/test/e2e/multi-actor-flows.e2e.test.ts#batching"
const batched = await anvil.createTestClient(
  (client) => client.withBatch({ wait: 5 }), // collect requests for 5 ms per HTTP call
);
const balances = await Promise.all(
  addresses.map((address) => balanceOf(batched, token, address)),
);
```

## Your own viem clients

Use `anvil.chain` and `anvil.rpcUrl` / `anvil.wsUrl`, and add the anvil
extras with `anvilActions`:

```ts snippet="examples/test/e2e/multi-actor-flows.e2e.test.ts#own-client"
// e.g. the client your application code already creates:
const appClient = createPublicClient({
  chain: anvil.chain, // id, name and URLs of this node
  transport: http(anvil.rpcUrl),
}).extend(anvilActions); // add the anvil extras to any viem client

await appClient.addBalance({ address: alice, value: parseEther("1") });
const balance = await appClient.readContract({
  address: token,
  abi: exampleToken.abi,
  functionName: "balanceOf",
  args: [alice],
});
expect(balance).toBe(parseEther("50"));
```

| Setting | Default |
|---|---|
| `withTransport("http" \| "webSocket")` | `"http"` |
| `withPollingInterval(ms)` | 25 |
| `withCacheTime(ms)` | 0 |
| `withTimeout(ms)` | 10 000 |
| `withRetries(count, delayMs?)` | 3, 150 |
| `withBatch(true \| { batchSize, wait })` | off, HTTP only |
| `withAccount()` / `withLocalAccount()` / `withoutAccount()` | none |
| `withChain({ name, nativeCurrency, contracts, blockExplorers, testnet })` | `Anvil (<id>)`, ETH |
| `withMulticall3(address?)` | – |

## Concepts

- [Architecture: node, test client, cheats](../../concepts/architecture.md)
- [Validation model](../../concepts/validation.md)
- Reference: [`TestClientOptions`](../../reference/test-client-options.md)
