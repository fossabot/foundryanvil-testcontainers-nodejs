/**
 * Shared plumbing of the root scripts that drive the repository's separate
 * npm projects (examples/, docs/): rebuild the library when stale, install a
 * project when its lockfile changed, and run npm without pnpm's environment.
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root (the library checkout). */
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

/** Prints a step heading. */
export function heading(text) {
  console.log(useColor ? `\n\u001b[1m▶ ${text}\u001b[0m` : `\n▶ ${text}`);
}

/**
 * npm must not inherit pnpm's `npm_*` environment (pnpm exports its own
 * config as npm_config_*, which npm would interpret).
 */
export function npmEnv(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !/^npm_/i.test(key)),
  );
}

/** Runs a command; exits the process with its status when it fails. */
export function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** Runs npm in `directory` with a clean environment. */
export function npm(directory, commandArgs) {
  run("npm", commandArgs, { cwd: directory, env: npmEnv() });
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
export function ensureBuilt() {
  const entry = path.join(root, "dist", "index.cjs");
  const inputs = [
    "src",
    "package.json",
    "tsconfig.json",
    "scripts/compact-dist.mjs",
  ];
  if (
    fs.existsSync(entry) &&
    fs.statSync(entry).mtimeMs >= newestMtime(inputs)
  ) {
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

/** `npm ci` in `directory` when node_modules is missing or older than the lockfile. */
export function ensureInstalled(directory, name = path.basename(directory)) {
  const installed = path.join(directory, "node_modules", ".package-lock.json");
  const lock = path.join(directory, "package-lock.json");
  const manifest = path.join(directory, "package.json");
  if (
    fs.existsSync(installed) &&
    fs.statSync(installed).mtimeMs >=
      Math.max(fs.statSync(lock).mtimeMs, fs.statSync(manifest).mtimeMs)
  ) {
    console.log(`✔ ${name} dependencies are installed`);
    return;
  }
  heading(`installing the ${name} project (npm ci)`);
  npm(directory, ["ci", "--no-audit", "--no-fund"]);
}

/** `true` when Node `version` (e.g. "22.18.0") is at least `minimum`. */
export function nodeSatisfies(version, minimum) {
  const parse = (value) => value.replace(/^v/, "").split(".").map(Number);
  const [a, b] = [parse(version), parse(minimum)];
  for (let index = 0; index < 3; index++) {
    if ((a[index] ?? 0) !== (b[index] ?? 0))
      return (a[index] ?? 0) > (b[index] ?? 0);
  }
  return true;
}

/** Exits with a clear message when Node is older than `minimum`. */
export function requireNode(minimum, why, version = process.versions.node) {
  if (nodeSatisfies(version, minimum)) return;
  console.error(
    `✖ ${why} needs Node.js >= ${minimum} (running ${version}); use the version in .nvmrc (\`nvm use\`).`,
  );
  process.exit(1);
}

/** Command-line arguments after the task name, without npm's `--`. */
export function cliArgs(argv = process.argv.slice(2)) {
  const [task, ...args] = argv.filter((arg) => arg !== "--");
  return { task, args };
}

/** Runs `tasks[task]`, or explains the valid tasks. */
export function dispatch(tasks, task, fallback) {
  const name = task ?? fallback;
  if (!tasks[name]) {
    console.error(
      `Unknown task "${name}". Use one of: ${Object.keys(tasks).join(", ")}`,
    );
    process.exit(1);
  }
  tasks[name]();
}
