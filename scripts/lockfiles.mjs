#!/usr/bin/env node
/**
 * Keeps the lockfiles installable on every platform the gate runs on.
 *
 *   pnpm lockfiles:check                      fail when a native package (anvil, swc,
 *                                             rollup, …) lacks a macOS or Linux build
 *   pnpm lockfiles:restore [--from <ref>]     put platform builds that pnpm/npm pruned
 *                                             back from a git ref (default: HEAD)
 *
 * Why: pnpm and npm drop optional platform packages they cannot resolve. A
 * registry mirror that only carries Linux x64 builds therefore produces
 * lockfiles that install nothing native on macOS. After re-resolving a
 * lockfile on such a mirror, run `restore` (versions that did not change
 * get their original entries and integrity back), then `check`.
 *
 * Lockfiles: pnpm-lock.yaml, examples/package-lock.json, docs/package-lock.json.
 * `--root <dir>` points at another checkout (used by the tests).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  checkLockfile,
  REQUIRED_PLATFORMS,
  restoreNpmLock,
  restorePnpmLock,
} from "./lib/lockfiles.mjs";
import { root as repositoryRoot } from "./lib/projects.mjs";

export const LOCKFILES = Object.freeze([
  { file: "pnpm-lock.yaml", kind: "pnpm" },
  { file: "examples/package-lock.json", kind: "npm" },
  { file: "docs/package-lock.json", kind: "npm" },
]);

function option(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function check(root) {
  const problems = LOCKFILES.flatMap(({ file, kind }) =>
    checkLockfile(kind, fs.readFileSync(path.join(root, file), "utf8")).map(
      (problem) => `${file}: ${problem}`,
    ),
  );
  if (problems.length > 0) {
    problems.forEach((problem) => console.error(`✖ ${problem}`));
    console.error(
      "✖ lockfiles must install native tools on macOS and Linux: " +
        "run `pnpm lockfiles:restore` (see scripts/lockfiles.mjs)",
    );
    return 1;
  }
  console.log(
    `✔ lockfiles cover ${REQUIRED_PLATFORMS.join(", ")} for every native package`,
  );
  return 0;
}

function restore(root, ref) {
  for (const { file, kind } of LOCKFILES) {
    const target = path.join(root, file);
    let reference;
    try {
      reference = execFileSync("git", ["show", `${ref}:./${file}`], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      console.log(`– ${file}: not in ${ref}, skipped`);
      continue;
    }
    const current = fs.readFileSync(target, "utf8");
    const { lock, restored } =
      kind === "pnpm"
        ? restorePnpmLock(current, reference)
        : restoreNpmLock(current, reference);
    if (lock !== current) fs.writeFileSync(target, lock);
    console.log(
      restored.length > 0
        ? `✎ ${file}: restored ${restored.length} platform packages from ${ref}`
        : `✔ ${file}: nothing to restore`,
    );
  }
  return check(root);
}

export function main(argv = process.argv.slice(2)) {
  const [task] = argv;
  const root = path.resolve(option(argv, "--root") ?? repositoryRoot);
  if (task === "check") return check(root);
  if (task === "restore")
    return restore(root, option(argv, "--from") ?? "HEAD");
  console.error(
    "Usage: lockfiles.mjs check | restore [--from <git-ref>] [--root <dir>]",
  );
  return 1;
}

process.exit(main());
