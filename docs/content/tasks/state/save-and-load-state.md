---
title: Save and load chain state
description: Build an expensive fixture once, save it, and boot or load other nodes from it.
---

Dump the state to a file once, then boot or load other nodes from it.

## Save a fixture to a file

```ts snippet="examples/test/e2e/state-fixtures.e2e.test.ts#build-fixture"
const builder = await new AnvilContainer()
  .withTestClient((client) => client.withAccount(0))
  .start();
try {
  token = await deployToken(builder.testClient);
  holders = await builder.addresses();
  for (const holder of holders) {
    await mint(builder.testClient, token, holder, parseEther("1000"));
  }
  await builder.dumpStateToFile(fixtureFile); // the `--load-state` format
  oracleCode = (await builder.testClient.getCode({
    address: await deployFixedPriceOracle(builder.testClient),
  }))!;
} finally {
  await builder.stop();
}
```

## Boot a node from it

```ts snippet="examples/test/e2e/state-fixtures.e2e.test.ts#boot-from-fixture"
const anvil = await new AnvilContainer(
  new AnvilOptions().state.withLoadState(fixtureFile),
).start();
try {
  expect(await balanceOf(anvil.testClient, token, holders[9])).toBe(
    parseEther("1000"),
  );
} finally {
  await anvil.stop();
}
```

## Load it into a running node

```ts snippet="examples/test/e2e/state-fixtures.e2e.test.ts#load-at-runtime"
await anvil.loadStateFromFile(fixtureFile);
```

Loading merges into the current state and discards snapshots.

## In memory

```ts snippet="examples/test/e2e/state-fixtures.e2e.test.ts#dump-in-memory"
await anvil.setBalanceEther(alice, 42);
const state = await anvil.dumpState(); // hex blob, e.g. to cache between suites

await anvil.reset(); // back to genesis: the balance is gone…
expect(await anvil.getBalance(alice)).toBe(parseEther("10000"));

await anvil.loadState(state); // …and restored
expect(await anvil.getBalance(alice)).toBe(parseEther("42"));
```

## Let anvil dump on stop

`withDumpState()` / `withState()` take host paths, copied in and out by `stop()`:

```ts snippet="examples/test/unit/options.test.ts#state-files"
const configuration = new AnvilOptions().state
  .withDumpState("./out/state.json") // copied to the host by stop()
  .withStateInterval(30) // also dump every 30 s while running
  .withPreserveHistoricalStates() // include historical states in dumps
  .build();

expect(configuration.fileExports).toEqual([
  {
    flag: "--dump-state",
    hostPath: path.resolve("out/state.json"),
    containerPath: "/tmp/anvil-dump-state.json",
    when: "stop",
  },
]);

// --state loads the file when it exists and dumps to it on stop.
const persistent = new AnvilOptions().state
  .withState("./.anvil/state.json")
  .build();
expect(persistent.fileImports[0].required).toBe(false);
expect(persistent.fileExports[0].when).toBe("stop");
```

anvil's resolved configuration, copied out after start:

```ts snippet="examples/test/unit/options.test.ts#config-out"
// anvil's resolved config (incl. dev keys), copied out right after start.
const configuration = new AnvilOptions().state
  .withConfigOut("./out/anvil-config.json")
  .build();
expect(configuration.fileExports[0]).toMatchObject({
  flag: "--config-out",
  when: "start",
});
```

Files in your image: `containerPath()`:

```ts snippet="examples/test/unit/options.test.ts#container-path"
const baked = containerPath("/data/fixture.json"); // not copied
const configuration = new AnvilOptions().state.withLoadState(baked).build();

expect(isContainerPath(baked)).toBe(true);
expect(configuration.args).toContain("/data/fixture.json");
expect(configuration.fileImports).toEqual([]);
```

## Concepts

- [Startup, readiness and file transfers](../../concepts/startup-and-files.md)
- [Performance: fast suites](../../concepts/performance.md)
