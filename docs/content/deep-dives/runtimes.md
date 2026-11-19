---
title: "Runtimes: Docker and local binaries"
description: The default Docker runtime, custom images, and running anvil as a local process.
---

## Docker (default)

`new AnvilContainer(options, image?)` runs `DEFAULT_ANVIL_IMAGE` (the anvil
version the library is tested with); any image with `anvil` on its `PATH`
works. Docker exercises everything (ports, file copies, graceful stops): use
it in CI.

## Local binary (no Docker)

Override the protected `startRuntime()`: return a ready
`StartedTestContainer` whose `getHost()` / `getMappedPort(port)` reach
JSON-RPC (`this.prepare()` has the command). Validation, test client and
errors stay the library's.

The examples' local runtime binds to `127.0.0.1` on a free port, maps file
paths into a temp directory and stops with `SIGTERM`; files copied *out* are
not supported. Binary lookup: `ANVIL_BINARY` → `@foundry-rs/anvil` → `PATH` →
`~/.foundry/bin/anvil`.

Related: [Run without Docker](../get-started/run-without-docker.md),
[Run in CI](../get-started/run-in-ci.md).
