---
title: Watch events and blocks
description: Subscribe to contract events, blocks and pending transactions over WebSocket.
---

Use the WebSocket transport for `eth_subscribe`-based watchers:

```ts snippet="examples/test/e2e/events-and-subscriptions.e2e.test.ts#websocket"
const anvil = useAnvil(
  new AnvilContainer().withTestClient((client) =>
    client.withAccount(0).withTransport("webSocket"),
  ),
  { setup: async (node) => void (token = await deployToken(node.testClient)) },
);
```

## Contract events

```ts snippet="examples/test/e2e/events-and-subscriptions.e2e.test.ts#watch"
const received: Log[] = [];
const errors: Error[] = [];
const unwatch = anvil.testClient.watchContractEvent({
  address: token,
  abi: exampleToken.abi,
  eventName: "Transfer",
  onLogs: (logs) => received.push(...logs),
  onError: (error) => errors.push(error),
});
try {
  // The subscription starts asynchronously: mint until a log arrives.
  await triggerUntil(
    () => mint(anvil.testClient, token, alice, parseEther("5")),
    () => received.length > 0,
  );
} finally {
  unwatch();
}

expect(errors).toEqual([]);
expect(received[0]).toMatchObject({
  eventName: "Transfer",
  args: { to: alice, value: parseEther("5") },
});
```

## New blocks

```ts snippet="examples/test/e2e/events-and-subscriptions.e2e.test.ts#watch-blocks"
const start = await anvil.testClient.getBlockNumber();
const seen = new Set<bigint>();
const unwatch = anvil.testClient.watchBlocks({
  // viem fetches each announced block separately, so blocks can be
  // reported out of order: collect them, don't assume a sequence.
  onBlock: (block: Block) => seen.add(block.number!),
});
try {
  await triggerUntil(
    () => anvil.mine(),
    () => seen.size >= 2,
  );
} finally {
  unwatch();
}

const latest = await anvil.testClient.getBlockNumber();
for (const number of seen) {
  expect(number).toBeGreaterThan(start); // only newly mined blocks
  expect(number).toBeLessThanOrEqual(latest);
}
```

## Pending transactions

```ts snippet="examples/test/e2e/events-and-subscriptions.e2e.test.ts#pending"
await anvil.cheats.setAutomine(false); // keep transactions pending
const seen = new Set<Hash>();
const sent: Hash[] = [];
const unwatch = anvil.testClient.watchPendingTransactions({
  onTransactions: (hashes) => hashes.forEach((hash) => seen.add(hash)),
});
try {
  await triggerUntil(
    async () =>
      sent.push(
        await anvil.testClient.sendTransaction({ to: alice, value: 1n }),
      ),
    () => sent.some((hash) => seen.has(hash)),
  );
} finally {
  unwatch();
  await anvil.cheats.setAutomine(true); // node setting: restore
}
```

## Your own WebSocket clients

```ts snippet="examples/test/e2e/events-and-subscriptions.e2e.test.ts#own-websocket"
const client = createPublicClient({
  chain: anvil.chain,
  transport: webSocket(anvil.wsUrl),
});
const start = await anvil.testClient.getBlockNumber();
let announced: bigint | undefined;
const unwatch = client.watchBlockNumber({
  onBlockNumber: (blockNumber) => (announced = blockNumber),
});
try {
  await triggerUntil(
    () => anvil.mine(),
    () => announced !== undefined,
  );
  expect(announced).toBeGreaterThan(start);
} finally {
  unwatch();
  // Clients you create are yours to close (the node closes its own).
  (await client.transport.getRpcClient()).close();
}
```

## Don't sleep: trigger until observed

Watchers subscribe asynchronously and viem has no "ready" signal. Repeat the
trigger until the watcher reports:

```ts snippet="examples/src/watchers.ts#trigger-until"
/**
 * Runs `trigger` (e.g. mine a block, send a transaction), then checks
 * `observed`, repeating until it returns `true`.
 *
 * @example
 * const seen = new Set<bigint>();
 * const unwatch = client.watchBlocks({ onBlock: (block) => seen.add(block.number!) });
 * await triggerUntil(() => anvil.mine(), () => seen.size >= 2);
 * unwatch();
 */
export async function triggerUntil(
  trigger: () => Promise<unknown>,
  observed: () => boolean,
  { intervalMs = 50, timeoutMs = 10_000 }: TriggerUntilOptions = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  while (!observed()) {
    if (Date.now() > deadline) {
      throw new Error(
        `triggerUntil: not observed after ${attempts} trigger(s) in ${timeoutMs} ms`,
      );
    }
    await trigger();
    attempts++;
    // Give the watcher a moment to report before triggering again.
    for (let waited = 0; waited < intervalMs && !observed(); waited += 10) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}
```

## Deep dive

- [anvil behaviours worth knowing](../../deep-dives/anvil-behaviours.md#watchers)
- [Configure the test client](../configure/test-client.md)
