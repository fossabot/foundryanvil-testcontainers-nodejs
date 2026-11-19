---
title: Startup, readiness and file transfers
description: What start() does, how readiness is detected, and how host files reach the container and back.
---

## `start()`, step by step

1. **Prepare** (no Docker): validate all options, register file copies, set
   the command and port.
2. **Start** the runtime (`startRuntime()`; Docker by default).
3. **Wait** for JSON-RPC, probed every 10 ms, whatever the log settings. If
   anvil exits, `AnvilStartupError` reports its output at once.
4. **Initialise**: chain id, `--config-out`, test client, default account.

`--host` is always `0.0.0.0`; the container port (`withPort()`) is mapped to a
host port (`getMappedPort()`).

## Files

File options take **host paths** (relative to the working directory):

| Flag | Direction | When |
|---|---|---|
| `--load-state`, `--init` | host → container | before start; the file must exist |
| `--state` | host → container, container → host | before start if it exists; after stop |
| `--dump-state` | container → host | after stop |
| `--config-out` | container → host | right after start |

Files land at `CONTAINER_FILE_PATHS`; `containerPath("/abs")` passes files in
your image through uncopied.

## Graceful stop

anvil writes dumps on exit. With a dump target, `stop()` sends `SIGTERM`,
waits up to 30 s (`DEFAULT_GRACEFUL_STOP_TIMEOUT_MS`), copies the file out,
then removes the container.

Related: [Save and load chain state](../tasks/state/save-and-load-state.md),
[Manage the lifecycle](../tasks/test-suites/manage-the-lifecycle.md).
