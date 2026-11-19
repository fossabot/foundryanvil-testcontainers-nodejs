---
title: Configure the RPC server
description: Port, CORS for browser dApps, request size, IPC, threads and cache path.
---

Configure the server with `.server`; the library maps ports and manages `--host`.

## Port

anvil's port inside the container; the host port is mapped automatically:

```ts snippet="examples/test/e2e/node-configuration.e2e.test.ts#server"
// anvil listens on 9545 inside the container; the host port is mapped.
const custom = useAnvil(
  new AnvilContainer(new AnvilOptions().server.withPort(9545).logs.quiet()),
);

it("maps the configured port to a free host port", async () => {
  const hostPort = custom.getMappedPort(9545);
  expect(custom.rpcUrl).toBe(`http://${custom.getHost()}:${hostPort}`);
  expect(await custom.testClient.getChainId()).toBe(31337);
});

it("starts quietly (no banner) and still knows the dev keys", async () => {
  expect(await custom.logText()).not.toContain("Available Accounts");
  const [first] = await custom.accounts(); // derived from the mnemonic
  expect(first.privateKey).toBeDefined();
});
```

## CORS for browser dApps

```ts snippet="examples/test/e2e/node-configuration.e2e.test.ts#cors"
const open = useAnvil(
  new AnvilContainer(new AnvilOptions().server.withAllowOrigin(ORIGIN)),
);
const closed = useAnvil(
  new AnvilContainer(new AnvilOptions().server.noCors()),
);

it("allows the configured origin", async () => {
  const response = await preflight(open.rpcUrl);
  expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
});

it("rejects cross-origin requests with --no-cors", async () => {
  const response = await preflight(closed.rpcUrl);
  expect(response.ok).toBe(false);
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
});
```

## Large requests

```ts snippet="examples/test/e2e/node-configuration.e2e.test.ts#request-size"
const strict = useAnvil(new AnvilContainer());
const unlimited = useAnvil(
  new AnvilContainer(new AnvilOptions().server.noRequestSizeLimit()),
);
// 2 MB of calldata: a request body of about 4 MB once hex encoded.
const bigCall = {
  to: "0x0000000000000000000000000000000000000001",
  data: `0x${"00".repeat(2_000_000)}`,
  gas: 30_000_000n,
} as const satisfies { to: Address; data: Hex; gas: bigint };

it("rejects very large requests by default", async () => {
  await expect(strict.testClient.call(bigCall)).rejects.toThrow(
    /Invalid request/,
  );
});

it("accepts them with noRequestSizeLimit()", async () => {
  await expect(unlimited.testClient.call(bigCall)).resolves.toBeDefined();
});
```

## IPC, threads, cache path

Paths are inside the container:

```ts snippet="examples/test/unit/options.test.ts#server-paths"
const options = new AnvilOptions().server
  .withIpc() // /tmp/anvil.ipc inside the container
  .withThreads(4) // 0 = one per logical core
  .withCachePath("/tmp/anvil-cache"); // container path
expect(options.toCommand()).toBe(
  "anvil --host 0.0.0.0 --ipc --threads 4 --cache-path /tmp/anvil-cache",
);
```

`--host` is managed by the library (always `0.0.0.0` in the container).

## Deep dive

- [Startup, readiness and file transfers](../../deep-dives/startup-and-files.md)
- Reference: [`.server` options](../../reference/anvil-options.md#server)
