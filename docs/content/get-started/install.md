---
title: Install
description: Add the library to a Node.js test project.
---

```shell
pnpm add -D @hellaweb3/foundryanvil-testcontainers-nodejs
# npm install -D … / yarn add -D …
```

- Node.js ≥ 22.
- A Docker-compatible runtime ([or none](run-without-docker.md)).
- A runner with `beforeAll` / `afterAll`: Jest, Vitest, Mocha, Jasmine.

Add `viem` yourself when your code imports it. ESM, CommonJS and types are
included. The first start pulls `DEFAULT_ANVIL_IMAGE`.

## Concepts

- [Runtimes: Docker and local binaries](../concepts/runtimes.md)
