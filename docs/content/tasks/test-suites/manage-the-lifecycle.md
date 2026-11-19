---
title: Manage the node lifecycle
description: Start and stop nodes yourself, pass hooks explicitly, run custom start logic, and know what happens after stop().
---

`useAnvil()` fits most suites; start and stop nodes yourself when you need control.

## Start and stop manually

```ts snippet="examples/test/e2e/lifecycle.e2e.test.ts#manual-lifecycle"
let anvil: StartedAnvilContainer;

beforeAll(async () => {
  anvil = await new AnvilContainer(new AnvilOptions().logs.quiet())
    .withStartupTimeout(120_000) // first run: image pull
    .start();
}, 120_000);

afterAll(async () => {
  await anvil?.stop();
});

it("uses the started node", async () => {
  expect(await anvil.testClient.getBlockNumber()).toBe(0n);
});
```

Or `await using anvil = await container.start()` (TypeScript 5.2+).

## Pass hooks explicitly

For runners without Jest-style globals:

```ts snippet="examples/test/e2e/lifecycle.e2e.test.ts#explicit-hooks"
// Pass the hooks yourself when your runner has no Jest-style globals.
const anvil = useAnvil(new AnvilContainer(), {
  hooks: { beforeAll, afterAll, afterEach },
  timeout: 120_000, // start/stop hook timeout
});
```

Mocha is detected automatically but ignores hook timeouts: raise `--timeout`.

## Run custom start logic

`useAnvil()` takes anything with `start()`:

```ts snippet="examples/test/e2e/lifecycle.e2e.test.ts#start-function"
// Any async start logic: the handle works the same way.
const funded = useAnvil({
  start: async () => {
    const node = await new AnvilContainer().start();
    const [first] = await node.addresses();
    await node.setBalanceEther(first, 1);
    return node;
  },
});
```

## After `stop()`

Clients reject instead of hanging:

```ts snippet="examples/test/e2e/lifecycle.e2e.test.ts#after-stop"
const anvil = await new AnvilContainer().start();
const client = anvil.testClient;
await anvil.stop();

expect(anvil.isStopped).toBe(true);
const error = await client.getBlockNumber().catch((e: unknown) => e);
expect(error).toBeInstanceOf(AnvilTestClientError);
expect((error as AnvilTestClientError).code).toBe("CONTAINER_STOPPED");
```

With a state dump configured, `stop()` is graceful and copies the dump out first.

## Deep dive

- [Startup, readiness and file transfers](../../deep-dives/startup-and-files.md)
- Reference: [`useAnvil()`](../../reference/use-anvil.md), [`AnvilContainer`](../../reference/anvil-container.md)
