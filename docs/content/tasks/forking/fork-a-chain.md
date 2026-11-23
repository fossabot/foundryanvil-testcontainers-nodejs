---
title: Fork a live chain
description: Run tests against real deployed state at a pinned block, change anything locally.
---

Pin the block for reproducible tests:

```ts snippet="examples/test/e2e/forking.e2e.test.ts#fork"
const options = new AnvilOptions().fork
  .withForkUrl(forkUrl, forkBlock) // pin the block: reproducible tests
  .withRetries(2) // upstream hiccups…
  .withForkRetryBackoff(500) // …are retried after 500 ms
  .withTimeout(10_000) // per upstream request
  .noStorageCaching() // don't persist fetched state to anvil's disk cache
  .noRateLimit() // a local upstream needs no compute-unit throttling
  // anvil derives a fork's hardfork from chain id + block number; for
  // "chain 1 at block 3" that is Frontier, so pin it explicitly.
  .evm.withHardfork(Hardfork.Cancun);

const container = new AnvilContainer(options).withTestClient((client) =>
  // Act as the holder: impersonated at startup, typed default account.
  client.withAccount(HOLDER, { impersonate: true }),
);
```

`forkUrl` is your provider's URL, resolved *inside the container*
(`host.docker.internal` for your machine). The fork sees upstream state at the
fork block:

```ts snippet="examples/test/e2e/forking.e2e.test.ts#fork-state"
expect(fork.chainId).toBe(1); // the client follows the forked chain
expect(await balanceOf(fork.testClient, token, HOLDER)).toBe(
  parseEther("1000000"), // the later mint is not part of the fork
);
const { forkedNetwork } = await fork.metadata();
expect(forkedNetwork).toMatchObject({
  chainId: 1,
  forkBlockNumber: Number(forkBlock),
});
```

Changes stay local:

```ts snippet="examples/test/e2e/forking.e2e.test.ts#fork-local"
await fork.cheats.setBalanceEther(HOLDER, 1); // gas for the holder
await fork.confirm(
  fork.testClient.writeContract({
    address: token,
    abi: exampleToken.abi,
    functionName: "transfer",
    args: [alice, parseEther("250000")],
  }),
);
expect(await balanceOf(fork.testClient, token, alice)).toBe(
  parseEther("250000"),
);
expect(await balanceOf(mainnet.testClient, token, alice)).toBe(0n);
```

## Choose the fork point

Right before a transaction:

```ts snippet="examples/test/e2e/forking.e2e.test.ts#fork-at-transaction"
const fork = await startFork(
  new AnvilOptions().fork
    .withForkUrl(forkUrl)
    .withForkTransactionHash(payment.transactionHash)
    .evm.withHardfork(Hardfork.Cancun),
);
try {
  // Forked at the block before the payment: it has not happened yet.
  expect(await fork.testClient.getBlockNumber()).toBe(
    payment.blockNumber - 1n,
  );
  expect(await fork.getBalance(RECIPIENT)).toBe(0n);
} finally {
  await fork.stop();
}
```

Relative to the latest block:

```ts snippet="examples/test/e2e/forking.e2e.test.ts#fork-relative-block"
const latest = await mainnet.testClient.getBlockNumber();
const fork = await startFork(
  new AnvilOptions().fork
    .withForkUrl(forkUrl)
    .withForkBlockNumber(-1) // negative: blocks before the latest
    .evm.withHardfork(Hardfork.Cancun),
);
try {
  const { forkedNetwork } = await fork.metadata();
  expect(forkedNetwork?.forkBlockNumber).toBe(Number(latest - 1n));
} finally {
  await fork.stop();
}
```

## Real providers

Offline chain id, credentials, rate limits:

```ts snippet="examples/test/e2e/forking.e2e.test.ts#fork-offline-chain-id"
const fork = await startFork(
  new AnvilOptions().fork
    .withForkUrl(forkUrl, forkBlock) // needs a block number or tx hash
    .withForkChainId(1) // skips eth_chainId on startup
    .evm.withHardfork(Hardfork.Cancun),
);
try {
  expect(fork.chainId).toBe(1);
  expect(await balanceOf(fork.testClient, token, HOLDER)).toBe(
    parseEther("1000000"),
  );
} finally {
  await fork.stop();
}
```

```ts snippet="examples/test/e2e/forking.e2e.test.ts#fork-provider"
const fork = await startFork(
  new AnvilOptions().fork
    .withForkUrl(forkUrl, forkBlock)
    .withForkHeader("Authorization: Bearer <api-key>") // every upstream request
    .withComputeUnitsPerSecond(100) // stay under the provider's rate limit
    .evm.withHardfork(Hardfork.Cancun),
);
try {
  expect(await balanceOf(fork.testClient, token, HOLDER)).toBe(
    parseEther("1000000"),
  );
} finally {
  await fork.stop();
}
```

```ts snippet="examples/test/unit/options.test.ts#fork-headers"
const options = new AnvilOptions().fork
  .withForkUrl("https://rpc.example@19000000") // url@block works too
  .withForkHeaders("Authorization: Bearer <key>", "X-Team: qa") // replace all
  .withForkHeader("X-Run: 42"); // add one
expect(options.toCommand()).toBe(
  "anvil --host 0.0.0.0 --fork-url https://rpc.example --fork-block-number 19000000 " +
    "--fork-header 'Authorization: Bearer <key>' --fork-header 'X-Team: qa' " +
    "--fork-header 'X-Run: 42'",
);
```

| Need | Option |
|---|---|
| retries / backoff | `withRetries(n)`, `withForkRetryBackoff(ms)` |
| per-request timeout | `withTimeout(ms)` |
| rate limits | `withComputeUnitsPerSecond(cups)`, `noRateLimit()` |
| no disk cache | `noStorageCaching()` |
| multicall | test client `withMulticall3()` |

Slow upstreams may need `container.withStartupTimeout(ms)`.

## Fork a node in another container

Join a Docker network with aliases (`withNetwork()`, `withNetworkAliases()`;
the examples' `network` helper wraps them):

```ts snippet="examples/test/e2e/forking.e2e.test.ts#upstream"
mainnet = await network
  .attach(
    new AnvilContainer(new AnvilOptions().evm.withChainId(1)),
    "mainnet",
    "mainnet-backup", // a second endpoint, see setRpcUrl below
  )
  .withTestClient((client) => client.withAccount(0))
  .start();
token = await deployToken(mainnet.testClient, "Mainnet USD", "mUSD");
await mint(mainnet.testClient, token, HOLDER, parseEther("1000000"));
forkBlock = await mainnet.testClient.getBlockNumber();
await mint(mainnet.testClient, token, HOLDER, 1n); // after the fork block
forkUrl = network.urlOf(mainnet, "mainnet");
```

## Concepts

- [A fork's hardfork follows the forked chain](../../concepts/anvil-behaviours.md#forks)
- Reference: [`.fork` options](../../reference/anvil-options.md#fork)
