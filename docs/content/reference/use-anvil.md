---
title: useAnvil()
description: Wire a node into the test lifecycle with per-test isolation.
---

```text
useAnvil(container: AnvilStartable, settings?: UseAnvilSettings): StartedAnvilContainer
```

Registers `beforeAll` (start, `setup`, baseline), `afterEach` (restore) and
`afterAll` (stop); returns a [`StartedAnvilContainer`](started-anvil-container.md)
handle for tests and hooks.

| Setting | Default | Description |
|---|---|---|
| `setup(node)` | – | runs once after start, before the baseline |
| `isolation` | `"test"` | `"none"`: state carries over between tests |
| `timeout` | `DEFAULT_USE_ANVIL_TIMEOUT_MS` (120 000) | start/stop hook timeout in ms |
| `hooks` | globals | `AnvilTestHooks`: `{ beforeAll, afterAll, afterEach? }` |

- `AnvilStartable`: anything with `start()`, e.g. `{ start: () => … }`.
- Hooks: globals of Jest, Vitest (`globals: true`), Mocha, Jasmine, or `hooks`.
- Errors: `NOT_STARTED` (used outside tests), `TEST_HOOKS_UNAVAILABLE`,
  `SNAPSHOT_NOT_FOUND` (a test called `reset()` / `loadState()`).

```ts snippet="examples/test/e2e/lifecycle.e2e.test.ts#explicit-hooks"
// Pass the hooks yourself when your runner has no Jest-style globals.
const anvil = useAnvil(new AnvilContainer(), {
  hooks: { beforeAll, afterAll, afterEach },
  timeout: 120_000, // start/stop hook timeout
});
```

Tasks: [Share a node](../tasks/test-suites/share-a-node.md),
[Manage the lifecycle](../tasks/test-suites/manage-the-lifecycle.md).
