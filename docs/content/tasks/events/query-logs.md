---
title: Query logs and filters
description: Query historical events, filter by indexed arguments, and get typed log arguments.
---

Query past events with `getContractEvents` / `getLogs`, or poll a filter.

## By indexed argument

```ts snippet="examples/test/e2e/events-and-subscriptions.e2e.test.ts#history"
const toBob = await anvil.testClient.getContractEvents({
  address: token,
  abi: exampleToken.abi,
  eventName: "Transfer",
  args: { to: bob }, // indexed topic filter
  fromBlock: 0n,
});
// JSON ABIs are untyped (`Abi`), so decoded args need a type here.
const values = toBob.map((log) => (log.args as { value: bigint }).value);
expect(values).toEqual([2n, 3n]);
```

## Typed arguments from an event signature

JSON ABIs are untyped; a human-readable signature gives full inference:

```ts snippet="examples/test/e2e/events-and-subscriptions.e2e.test.ts#event-signature"
// A human-readable event signature gives full type inference for log args,
// even though the JSON ABIs are untyped.
const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
```

```ts snippet="examples/test/e2e/events-and-subscriptions.e2e.test.ts#typed-logs"
const mints = await anvil.testClient.getLogs({
  address: token,
  event: TRANSFER,
  args: { from: zeroAddress },
  fromBlock: 0n,
  toBlock: "latest",
});
const last = mints.at(-1)!;
expect(last.args.to).toBe(alice); // typed: `0x${string}` | undefined
expect(last.args.value).toBe(7n); // typed: bigint | undefined
```

## Poll a filter

```ts snippet="examples/test/e2e/events-and-subscriptions.e2e.test.ts#filter"
const http = await anvil.createTestClient((client) =>
  client.withAccount(0).withTransport("http"),
);
const filter = await http.createEventFilter({
  address: token,
  event: TRANSFER,
  args: { to: bob }, // indexed argument filter
});
await mint(http, token, alice, 1n);
await mint(http, token, bob, 2n);

const changes = await http.getFilterChanges({ filter });
expect(changes).toHaveLength(1); // only the transfer to bob
expect(await http.getFilterChanges({ filter })).toHaveLength(0); // consumed
await http.uninstallFilter({ filter });
```

## Deep dive

- [JSON ABIs are typed as `Abi`](../../deep-dives/anvil-behaviours.md#more)
- Reference: [test client actions](../../reference/test-client.md#public-and-wallet-actions)
