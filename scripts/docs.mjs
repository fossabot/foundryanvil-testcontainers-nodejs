#!/usr/bin/env node
/**
 * Runs the docs site (docs/, a separate Docusaurus project) from the
 * repository root. Its code samples are synced from the tested #region
 * blocks of examples/ and its reference tables from the built library.
 *
 *   pnpm docs:setup                        build the library if stale → npm ci if needed
 *   pnpm docs:sync                         rewrite samples and generated tables
 *   pnpm docs:start                        dev server (pages show the current example regions)
 *   pnpm docs:build                        production build (docs/build)
 *   pnpm docs:serve                        serve the production build
 *   pnpm docs:typecheck / docs:lint        static checks
 *   pnpm docs:unit [--coverage]            sync check + typecheck + lint + unit tests
 *   pnpm docs:e2e [--no-docker]            the examples behind the samples (against anvil)
 *                  [--skip-examples]       + site build + checks of the built pages
 *
 * Extra arguments of start/build/serve are forwarded to Docusaurus.
 */
import * as path from "node:path";
import {
  cliArgs,
  dispatch,
  ensureBuilt,
  ensureInstalled,
  heading,
  npm,
  requireNode,
  root,
  run,
} from "./lib/projects.mjs";

const docs = path.join(root, "docs");
const { task, args } = cliArgs();

/** The library build feeds the generated reference and the API coverage tests. */
function setup() {
  // The docs' scripts and tests are TypeScript run by Node's type stripping.
  requireNode("22.18.0", "The docs project");
  ensureBuilt();
  ensureInstalled(docs, "docs");
}

function check() {
  heading("docs: samples and generated tables in sync");
  npm(docs, ["run", "check"]);
}

function staticChecks() {
  heading("docs: typecheck");
  npm(docs, ["run", "typecheck"]);
  heading("docs: lint");
  npm(docs, ["run", "lint"]);
}

function docusaurus(command) {
  return () => {
    setup();
    heading(`docs: ${command}`);
    npm(docs, ["run", command, "--", ...args]);
  };
}

const tasks = {
  setup,
  sync() {
    setup();
    heading("docs: sync samples and generated tables");
    npm(docs, ["run", "sync"]);
  },
  check() {
    setup();
    check();
  },
  typecheck() {
    setup();
    heading("docs: typecheck");
    npm(docs, ["run", "typecheck"]);
  },
  lint() {
    setup();
    heading("docs: lint");
    npm(docs, ["run", "lint"]);
  },
  unit() {
    setup();
    check();
    staticChecks();
    const coverage = args.includes("--coverage");
    heading(`docs: unit tests${coverage ? " (coverage)" : ""}`);
    npm(docs, ["run", coverage ? "test:coverage" : "test:unit"]);
  },
  e2e() {
    setup();
    if (!args.includes("--skip-examples")) {
      heading("docs: the examples behind every sample");
      run(
        process.execPath,
        [
          path.join(root, "scripts", "examples.mjs"),
          "e2e",
          ...args.filter((arg) => arg === "--no-docker"),
        ],
        { cwd: root },
      );
    }
    heading("docs: build the site and check the built pages");
    npm(docs, ["run", "test:e2e"]);
  },
  start: docusaurus("start"),
  build: docusaurus("build"),
  serve: docusaurus("serve"),
};

dispatch(tasks, task, "unit");
