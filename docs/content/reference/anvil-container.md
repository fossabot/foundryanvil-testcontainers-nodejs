---
title: AnvilContainer
description: The Testcontainers module that turns options and test client settings into a started node.
---

`AnvilContainer<TAccount>` extends Testcontainers' `GenericContainer`: every
builder stays available (`withStartupTimeout`, `withNetwork`,
`withNetworkAliases`, `withEnvironment`, …). `TAccount` is the test client's
default account type.

| Member | Description |
|---|---|
| `new AnvilContainer(options?, image?)` | anvil defaults and `DEFAULT_ANVIL_IMAGE` when omitted |
| `withTestClient(options \| (c) => c…)` | configures `StartedAnvilContainer.testClient` ([`TestClientOptions`](test-client-options.md)); returns a container typed with the default account |
| `testClientOptions` | the test client settings in use |
| `anvilOptions` | the `AnvilOptions` in use |
| `withArtifactsDir(dir)` | base directory of `contractAbi()` / `contractBytecode()` (default `<cwd>/test/artifacts`) |
| `prepare()` | validates anvil **and** test client options and applies entrypoint, command, port, file copies and wait strategy; returns the `AnvilConfiguration`; needs no Docker |
| `start()` | prepares, starts, waits for JSON-RPC, sets up the test client; throws `AnvilConfigurationError` before Docker, `AnvilStartupError` after |
| `startRuntime()` | *protected* extension point that starts the prepared container; override it to run anvil elsewhere ([Run without Docker](../get-started/run-without-docker.md)) |
| `withWaitStrategy(strategy)` | replaces the default `AnvilReadyWaitStrategy` (rarely needed) |

`AnvilReadyWaitStrategy(port, command)` probes JSON-RPC until anvil answers
and fails fast with anvil's output when it exits.

```ts snippet="examples/test/unit/configuration.test.ts#container-getters"
const options = new AnvilOptions().mining.withBlockTime(2);
const container = new AnvilContainer(options).withTestClient((client) =>
  client.withAccount(0),
);

expect(container.anvilOptions).toBe(options);
expect(container.testClientOptions.build().account?.kind).toBe("index");
expect(container.prepare().command.join(" ")).toBe(
  "anvil --host 0.0.0.0 --block-time 2",
);
```

Tasks: [Share a node](../tasks/test-suites/share-a-node.md),
[Manage the lifecycle](../tasks/test-suites/manage-the-lifecycle.md).
