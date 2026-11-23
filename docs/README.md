# Documentation site

The [Docusaurus](https://docusaurus.io) site published at
<https://hellalabs.dev/foundryanvil-testcontainers-nodejs/>.

A separate npm project (own `package.json`, lockfile, TypeScript, ESLint and
tests), excluded from the library's builds, lint and tests.

## Link/sync: no hand-written code

| Content | Source of truth | Kept in sync by |
|---|---|---|
| Code samples | `// #region name` blocks of `../examples` (type-checked, linted, unit- and e2e-tested) | `npm run sync`; `npm run check` and the build fail on drift |
| Reference tables (`<!-- generated:… -->`) | the built library (`../dist`): flag registry, error codes, enums, constants | same |
| The repository README's quick start | an example region | same |

A sample is a code fence with a `snippet` attribute; its body is generated:

````text
```ts snippet="examples/test/e2e/time-travel.e2e.test.ts#fast-forward"
```
````

Rules (enforced by `npm run check`, the unit tests and `docusaurus build`):

- every code fence is linked, except `shell`, `bash`, `sh` and `text`;
- samples come from `examples/test/**` or `examples/src/**` only;
- every region in those folders is shown on at least one page;
- task pages start with the answer, show at least one sample, stay under
  250 words of prose and end with a `## Concepts` section;
- every public API member, flag and error code is documented, and
  demonstrated by a sample (`test/unit/api-coverage.test.mts`).

During `npm start`, pages show the current regions (re-save a page to pick
up an edited example); `docusaurus build` fails on stale samples.

## Scripts

From the repository root (builds the library when stale, installs this
project when its lockfile changed):

| Root script | What it does |
|---|---|
| `pnpm docs:start` | dev server |
| `pnpm docs:sync` | rewrite samples and generated tables |
| `pnpm docs:unit [--coverage]` | sync check + typecheck + lint + unit tests |
| `pnpm docs:e2e [--no-docker] [--skip-examples]` | run the examples behind the samples against anvil, build the site, check the built pages |
| `pnpm docs:build` / `pnpm docs:serve` | production build in `build/` / serve it |

Inside `docs/`, like any npm project (after `pnpm build` at the root):

| Script | What it does |
|---|---|
| `npm start` / `npm run build` / `npm run serve` | Docusaurus |
| `npm run sync` / `npm run check` | link/sync (write / verify) |
| `npm run typecheck` / `npm run lint` | `tsc`, ESLint + Prettier |
| `npm run test:unit` / `npm run test:coverage` | Node's test runner (coverage thresholds enforced) |
| `npm run test:e2e [-- --no-build]` | build the site and check it |
| `npm run verify` | all of the above |

The site's URLs (`SITE_URL`, `BASE_URL`, `DOCS_URL`), the repository and the
package name live in `src/lib/site.mts`, the single source for the config,
plugins, scripts and tests.

## Layout

```text
docs/
├── content/            pages: get-started/, tasks/, reference/, concepts/
├── plugins/
│   ├── snippets/       regions, Markdown fences, sync engine, remark plugin
│   └── reference/      tables generated from the built library
├── scripts/            sync.mts (CLI), e2e.mts (build + site checks)
├── src/                landing page, CSS, landing task list
├── test/unit/          library tests, content rules, API coverage
├── test/e2e/           checks of the built site
├── docusaurus.config.ts
└── sidebars.ts         task-based navigation: Tasks, Reference, Concepts
```

Node-run TypeScript uses `.mts` and Node's built-in type stripping (no
build step); the site itself is not `"type": "module"` because Docusaurus'
generated client code is CommonJS-flavoured.

## Deployment

`.github/workflows/docs.yml` runs on changes to `docs/`, `examples/`, `src/`
or the README: sync check, typecheck, lint, unit tests with coverage, the
examples behind the samples (Docker), site build and built-page checks, then
publishes `build/` to GitHub Pages (pushes to `main`). Enable Pages with
"GitHub Actions" as the source in the repository settings.
