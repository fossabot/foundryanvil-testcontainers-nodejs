---
title: Run without Docker
description: Run the same tests against a local anvil binary on machines without Docker.
---

Override `AnvilContainer.startRuntime()` to run anvil elsewhere. The examples'
local runtime spawns the `anvil` binary on a free port:

```ts snippet="examples/test/support/local-anvil.ts#local-container"
/**
 * An `AnvilContainer` that runs anvil as a local process. Same API, same
 * validation and the same started node type, without Docker.
 */
export class LocalAnvilContainer<
  TAccount extends Account | undefined = undefined,
> extends AnvilContainer<TAccount> {
  protected override startRuntime(): Promise<StartedTestContainer> {
    return startLocal(this.prepare(), this.startupTimeoutMs ?? 60_000);
  }
}
```

Use `new LocalAnvilContainer(options)`, or route every container to it from a
setup file (the examples' `--no-docker` mode):

```ts snippet="examples/test/support/setup-runtime.ts#use-local-runtime"
type WithRuntime = { startRuntime: unknown };

/** Routes `AnvilContainer.startRuntime()` to the local runtime. */
export function useLocalRuntime(): void {
  (AnvilContainer.prototype as unknown as WithRuntime).startRuntime = (
    LocalAnvilContainer.prototype as unknown as WithRuntime
  ).startRuntime;
}

if (E2E_MODE === "local") useLocalRuntime();
```

Copy [`local-anvil.ts`](https://github.com/hella-labs/foundryanvil-testcontainers-nodejs/blob/main/examples/test/support/local-anvil.ts);
get a binary from `@foundry-rs/anvil` or `foundryup`:

```shell
npm install -D @foundry-rs/anvil
```

:::warning Local testing only
It skips the container (image, ports, file copies): run CI in Docker. Files
copied *out* (`withDumpState()`, `withState()`, `withConfigOut()`) aren't
supported; use [`dumpStateToFile()`](../tasks/state/save-and-load-state.md).
:::

## Deep dive

- [Runtimes: Docker and local binaries](../deep-dives/runtimes.md)
- [Startup, readiness and file transfers](../deep-dives/startup-and-files.md)
