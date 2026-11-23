---
title: Run in CI
description: Run anvil-backed tests on GitHub Actions and other CI systems.
---

GitHub Actions runners (`ubuntu-latest`) have Docker: nothing to configure.

```shell
pnpm test
```

- **Timeouts.** The first start pulls the image: `useAnvil()` allows 120 s;
  for manual starts raise the hook timeout and `withStartupTimeout()`:

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

- **Parallelism.** Each Jest worker's file gets its own node and port.
- **Pin the image** for reproducibility: `new AnvilContainer(options, "ghcr.io/foundry-rs/foundry:<tag>")`.
- **Forks** read the upstream URL from a secret, e.g. `process.env.MAINNET_RPC_URL`.

Example: this repository's
[`main.yml`](https://github.com/hella-labs/foundryanvil-testcontainers-nodejs/blob/main/.github/workflows/main.yml).

## Concepts

- [Performance: fast suites](../concepts/performance.md)
- [Runtimes: Docker and local binaries](../concepts/runtimes.md)
