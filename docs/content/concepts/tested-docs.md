---
title: How the docs are tested
description: The link/sync contract between this site, the tested examples and the library.
---

No code on this site is written by hand.

## Code samples ← tested example regions

Every sample is a `// #region` of
[`examples/`](https://github.com/hella-labs/foundryanvil-testcontainers-nodejs/tree/main/examples),
which is type-checked, linted and tested against real anvil nodes in CI. A
fence links to its region:

````text
```ts snippet="examples/test/e2e/time-travel.e2e.test.ts#fast-forward"
…copied from the region by `pnpm docs:sync`…
```
````

"Tested in" under each sample links to its lines.

## Reference tables ← the library

`<!-- generated:<name> -->` blocks are rendered from the built library: flags,
error codes, enums, constants.

## What fails the build

| Check | Where |
|---|---|
| a sample differs from its region, or a region/file is missing | `pnpm docs:unit` (sync check) and `docusaurus build` |
| a code block is not linked (only `shell` / `bash` / `sh` / `text` may be) | same |
| an example region is not shown on any page | `pnpm docs:unit` |
| a generated table differs from the library | `pnpm docs:unit` |
| a public API member, flag or error code is undocumented | `pnpm docs:unit` (API coverage) |
| broken links or anchors | `docusaurus build` |
| the built pages don't contain the synced samples | `pnpm docs:e2e` |
| the examples behind the samples fail | `pnpm docs:e2e` (runs them against anvil) |

## Add or change a sample

1. Wrap the code in an example with `// #region my-sample`.
2. Reference it: `` ```ts snippet="examples/<file>#my-sample" `` (empty body).
3. Run `pnpm docs:sync`, then `pnpm docs:unit`.

Scripts: [`docs/README.md`](https://github.com/hella-labs/foundryanvil-testcontainers-nodejs/blob/main/docs/README.md).
