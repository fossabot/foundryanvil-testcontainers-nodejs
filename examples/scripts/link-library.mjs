#!/usr/bin/env node
/**
 * Links the library under development into this project with `npm link`,
 * the way an end user tries a local checkout of a package.
 *
 *   npm run link:library
 *
 * - The library is the repository root (override with LIBRARY_PATH).
 * - npm's "global" link folder is kept inside this project (`.npm-link/`), so
 *   the machine's global npm prefix is never touched.
 * - `npm install` / `npm ci` remove links: run this again after installing
 *   (the root `pnpm examples:*` scripts do it for you).
 * - Idempotent: does nothing when the link already points at the library.
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_NAME = "@hellaweb3/foundryanvil-testcontainers-nodejs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const EXAMPLES_DIR = path.resolve(here, "..");

/** Absolute path of the library checkout to link. */
export function libraryPath(env = process.env) {
  return path.resolve(env.LIBRARY_PATH ?? path.join(EXAMPLES_DIR, ".."));
}

/** Where the linked package appears in this project. */
export function linkPath() {
  return path.join(EXAMPLES_DIR, "node_modules", ...PACKAGE_NAME.split("/"));
}

/** `true` when node_modules/<package> is a link to the library checkout. */
export function isLinked(library = libraryPath()) {
  try {
    return (
      fs.lstatSync(linkPath()).isSymbolicLink() &&
      fs.realpathSync(linkPath()) === fs.realpathSync(library)
    );
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(`✖ link:library: ${message}`);
  process.exit(1);
}

function npm(args, env) {
  const execPath = process.env.npm_execpath;
  const [command, prefixArgs] =
    execPath && /npm-cli\.js$/.test(execPath)
      ? [process.execPath, [execPath]]
      : ["npm", []];
  return spawnSync(command, [...prefixArgs, ...args], {
    cwd: EXAMPLES_DIR,
    env,
    stdio: "inherit",
    shell: process.platform === "win32" && command === "npm",
  });
}

function main() {
  const library = libraryPath();
  const manifestPath = path.join(library, "package.json");
  if (!fs.existsSync(manifestPath)) fail(`no package.json in ${library}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.name !== PACKAGE_NAME) {
    fail(`${library} contains "${manifest.name}", expected "${PACKAGE_NAME}"`);
  }
  for (const entry of ["dist/index.cjs", "dist/index.d.cts"]) {
    if (!fs.existsSync(path.join(library, entry))) {
      fail(
        `${entry} is missing: build the library first (\`pnpm build\` in ${library}).`,
      );
    }
  }
  if (isLinked(library)) {
    console.log(`✔ ${PACKAGE_NAME}@${manifest.version} is linked → ${library}`);
    return;
  }

  // npm's global folder layout: <prefix>/lib/node_modules (POSIX) or <prefix>/node_modules (Windows).
  const prefix = path.join(EXAMPLES_DIR, ".npm-link");
  fs.mkdirSync(path.join(prefix, "lib", "node_modules"), { recursive: true });
  fs.mkdirSync(path.join(prefix, "node_modules"), { recursive: true });
  const result = npm(["link", library, "--no-audit", "--no-fund"], {
    ...process.env,
    npm_config_prefix: prefix,
  });
  if (result.status !== 0) fail(`npm link exited with ${result.status}`);
  if (!isLinked(library)) fail(`${linkPath()} does not point at ${library}`);
  console.log(`✔ linked ${PACKAGE_NAME}@${manifest.version} → ${library}`);
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
