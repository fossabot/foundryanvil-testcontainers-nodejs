/**
 * End-to-end tests of the docs site: builds it (`docusaurus build`), then
 * checks the built pages (test/e2e).
 *
 *   npm run test:e2e                 build + test
 *   npm run test:e2e -- --no-build   test an existing build
 *
 * The examples that back the samples run from the repository root:
 * `pnpm docs:e2e [--no-docker]` runs them first.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { DOCS_ROOT } from "../plugins/snippets/project.mts";

const require = createRequire(import.meta.url);

/** Runs `node <args>` in the docs project; returns the exit code. */
export function node(args: readonly string[]): number {
  const result = spawnSync(process.execPath, args, {
    cwd: DOCS_ROOT,
    stdio: "inherit",
  });
  return result.status ?? 1;
}

/** Builds the site unless `--no-build`, then runs the e2e tests. */
export function main(
  argv: readonly string[] = process.argv.slice(2),
  run: (args: readonly string[]) => number = node,
): number {
  if (!argv.includes("--no-build")) {
    const docusaurus = require.resolve("@docusaurus/core/bin/docusaurus.mjs");
    const status = run([docusaurus, "build"]);
    if (status !== 0) return status;
  }
  // Node's test runner expands the glob itself (POSIX separators everywhere).
  return run(["--test", "--test-reporter=spec", "test/e2e/**/*.test.mts"]);
}

if (import.meta.main) process.exit(main());
