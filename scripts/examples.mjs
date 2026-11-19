#!/usr/bin/env node
/**
 * Runs the examples project (examples/, a separate npm project that consumes
 * this library through `npm link`) from the repository root.
 *
 *   pnpm examples:setup                  build if stale → npm ci if needed → npm link
 *   pnpm examples:typecheck              setup + tsc
 *   pnpm examples:lint                   setup + eslint
 *   pnpm examples:unit [--coverage]      setup + typecheck + lint + unit tests
 *   pnpm examples:e2e [--no-docker]      setup + typecheck + lint + workflows against anvil
 *
 * Extra arguments are forwarded to the examples' scripts (Jest for tests).
 */
import * as path from "node:path";
import {
  cliArgs,
  dispatch,
  ensureBuilt,
  ensureInstalled,
  heading,
  npm,
  npmEnv,
  root,
  run,
} from "./lib/projects.mjs";

const examples = path.join(root, "examples");
const { task, args } = cliArgs();

function setup() {
  ensureBuilt();
  ensureInstalled(examples, "examples");
  // npm ci removes links, so (re-)link every time; a no-op when linked.
  run(process.execPath, ["scripts/link-library.mjs"], {
    cwd: examples,
    env: npmEnv(),
  });
}

function staticChecks() {
  heading("examples: typecheck");
  npm(examples, ["run", "typecheck"]);
  heading("examples: lint");
  npm(examples, ["run", "lint"]);
}

function unit() {
  setup();
  staticChecks();
  heading(
    `examples: unit tests${args.includes("--coverage") ? " (coverage)" : ""}`,
  );
  npm(examples, ["run", "test:unit", "--", ...args]);
}

const tasks = {
  setup,
  typecheck() {
    setup();
    heading("examples: typecheck");
    npm(examples, ["run", "typecheck"]);
  },
  lint() {
    setup();
    heading("examples: lint");
    npm(examples, ["run", "lint"]);
  },
  unit,
  /** Alias of `unit`. */
  test: unit,
  e2e() {
    setup();
    staticChecks();
    heading(
      `examples: e2e${args.includes("--no-docker") ? " (--no-docker)" : ""}`,
    );
    npm(examples, ["run", "test:e2e", "--", ...args]);
  },
};

dispatch(tasks, task, "unit");
