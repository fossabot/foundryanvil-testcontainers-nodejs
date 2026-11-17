#!/usr/bin/env node
/**
 * Runs the examples project (examples/, a separate npm project that consumes
 * this library through `npm link`) from the repository root.
 *
 *   pnpm examples:setup               build if stale → npm ci if needed → npm link
 *   pnpm examples:typecheck           setup + tsc
 *   pnpm examples:lint                setup + eslint
 *   pnpm examples:test                setup + typecheck + lint + unit tests
 *   pnpm examples:e2e [--no-docker]   setup + workflows against anvil
 *
 * Extra arguments are forwarded to the examples' scripts (Jest for tests).
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const examples = path.join(root, "examples");
const [task = "test", ...args] = process.argv.slice(2).filter((a) => a !== "--");

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const heading = (text) =>
  console.log(useColor ? `\n\u001b[1m▶ ${text}\u001b[0m` : `\n▶ ${text}`);

/**
 * npm must not inherit pnpm's `npm_*` environment (pnpm exports its own
 * config as npm_config_*, which npm would interpret).
 */
function npmEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^npm_/i.test(key)),
  );
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function npm(commandArgs) {
  run("npm", commandArgs, { cwd: examples, env: npmEnv() });
}

function newestMtime(entries) {
  let newest = 0;
  for (const entry of entries) {
    const full = path.join(root, entry);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      for (const file of fs.readdirSync(full, { recursive: true })) {
        const child = path.join(full, String(file));
        if (fs.statSync(child).isFile()) {
          newest = Math.max(newest, fs.statSync(child).mtimeMs);
        }
      }
    } else {
      newest = Math.max(newest, stat.mtimeMs);
    }
  }
  return newest;
}

/** Rebuilds the library when dist/ is missing or older than its inputs. */
function ensureBuilt() {
  const entry = path.join(root, "dist", "index.cjs");
  const inputs = ["src", "package.json", "tsconfig.json", "scripts/compact-dist.mjs"];
  if (fs.existsSync(entry) && fs.statSync(entry).mtimeMs >= newestMtime(inputs)) {
    console.log("✔ library build is up to date");
    return;
  }
  heading("building the library (dist/ is missing or stale)");
  const execPath = process.env.npm_execpath;
  if (execPath && /pnpm/.test(path.basename(execPath))) {
    const isJavaScript = /\.(?:c|m)?js$/i.test(execPath);
    const isWindowsCommandShim =
      process.platform === "win32" && /\.(?:cmd|bat)$/i.test(execPath);
    run(
      isJavaScript ? process.execPath : execPath,
      isJavaScript ? [execPath, "run", "build"] : ["run", "build"],
      { cwd: root, shell: isWindowsCommandShim },
    );
  } else {
    run("pnpm", ["run", "build"], { cwd: root });
  }
}

/** `npm ci` when node_modules is missing or older than the lockfile. */
function ensureInstalled() {
  const installed = path.join(examples, "node_modules", ".package-lock.json");
  const lock = path.join(examples, "package-lock.json");
  const manifest = path.join(examples, "package.json");
  if (
    fs.existsSync(installed) &&
    fs.statSync(installed).mtimeMs >=
      Math.max(fs.statSync(lock).mtimeMs, fs.statSync(manifest).mtimeMs)
  ) {
    console.log("✔ examples dependencies are installed");
    return;
  }
  heading("installing the examples project (npm ci)");
  npm(["ci", "--no-audit", "--no-fund"]);
}

function setup() {
  ensureBuilt();
  ensureInstalled();
  // npm ci removes links, so (re-)link every time; a no-op when linked.
  run(process.execPath, ["scripts/link-library.mjs"], {
    cwd: examples,
    env: npmEnv(),
  });
}

const tasks = {
  setup,
  typecheck() {
    setup();
    heading("examples: typecheck");
    npm(["run", "typecheck"]);
  },
  lint() {
    setup();
    heading("examples: lint");
    npm(["run", "lint"]);
  },
  test() {
    setup();
    heading("examples: typecheck");
    npm(["run", "typecheck"]);
    heading("examples: lint");
    npm(["run", "lint"]);
    heading("examples: unit tests");
    npm(["test", "--", ...args]);
  },
  e2e() {
    setup();
    heading(`examples: e2e${args.includes("--no-docker") ? " (--no-docker)" : ""}`);
    npm(["run", "test:e2e", "--", ...args]);
  },
};

if (!tasks[task]) {
  console.error(`Unknown task "${task}". Use one of: ${Object.keys(tasks).join(", ")}`);
  process.exit(1);
}
tasks[task]();
