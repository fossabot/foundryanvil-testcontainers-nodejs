/**
 * scripts/lockfiles.mjs: the lockfiles install native tools (anvil, swc,
 * rollup, …) on macOS and Linux, and platform builds pruned by resolving on
 * a partial registry mirror can be restored exactly.
 */
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SCRIPT = path.join(ROOT, "scripts", "lockfiles.mjs");
const LIBRARY = path.join(ROOT, "scripts", "lib", "lockfiles.mjs");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** Calls an export of scripts/lib/lockfiles.mjs (ESM) in a child process. */
function callLibrary<T>(name: string, ...args: unknown[]): T {
  const code = `import(${JSON.stringify(LIBRARY)}).then((lib) => process.stdout.write(JSON.stringify(lib.${name}(...${JSON.stringify(args)}))))`;
  return JSON.parse(
    execFileSync(process.execPath, ["-e", code], { encoding: "utf8" }),
  ) as T;
}

function run(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
  });
}

// A pnpm lockfile with one native package (three builds) and fsevents,
// a macOS-only addon that is not a build of its parent.
const PNPM_FULL = `lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      tool:
        specifier: ^1.0.0
        version: 1.0.0

packages:

  '@tool/tool-darwin-arm64@1.0.0':
    resolution: {integrity: sha512-darwinarm}
    cpu: [arm64]
    os: [darwin]

  '@tool/tool-darwin-x64@1.0.0':
    resolution: {integrity: sha512-darwinx64}
    cpu: [x64]
    os: [darwin]

  '@tool/tool-linux-arm64-gnu@1.0.0':
    resolution: {integrity: sha512-linuxarm}
    cpu: [arm64]
    os: [linux]
    libc: [glibc]

  '@tool/tool-linux-x64-gnu@1.0.0':
    resolution: {integrity: sha512-linuxx64}
    cpu: [x64]
    os: [linux]
    libc: [glibc]

  fsevents@2.3.3:
    resolution: {integrity: sha512-fsevents}
    os: [darwin]

  tool@1.0.0:
    resolution: {integrity: sha512-tool}

snapshots:

  '@tool/tool-darwin-arm64@1.0.0':
    optional: true

  '@tool/tool-darwin-x64@1.0.0':
    optional: true

  '@tool/tool-linux-arm64-gnu@1.0.0':
    optional: true

  '@tool/tool-linux-x64-gnu@1.0.0':
    optional: true

  fsevents@2.3.3:
    optional: true

  tool@1.0.0:
    optionalDependencies:
      '@tool/tool-darwin-arm64': 1.0.0
      '@tool/tool-darwin-x64': 1.0.0
      '@tool/tool-linux-arm64-gnu': 1.0.0
      '@tool/tool-linux-x64-gnu': 1.0.0
      fsevents: 2.3.3
`;

/** What pnpm writes after resolving on a mirror with Linux x64 builds only. */
function prunePnpm(lock: string): string {
  return lock
    .replace(
      /\n {2}'@tool\/tool-(darwin-\w+|linux-arm64-gnu)@1\.0\.0':\n(?: {4}.*\n)+/g,
      "\n",
    )
    .replace(/ {6}'@tool\/tool-(darwin-\w+|linux-arm64-gnu)': 1\.0\.0\n/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

const NPM_FULL = `${JSON.stringify(
  {
    name: "fixture",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { devDependencies: { tool: "^1.0.0" } },
      "node_modules/tool": {
        version: "1.0.0",
        optionalDependencies: {
          "@tool/tool-darwin-arm64": "1.0.0",
          "@tool/tool-darwin-x64": "1.0.0",
          "@tool/tool-linux-arm64-gnu": "1.0.0",
          "@tool/tool-linux-x64-gnu": "1.0.0",
        },
      },
      "node_modules/@tool/tool-darwin-arm64": {
        version: "1.0.0",
        optional: true,
        os: ["darwin"],
        cpu: ["arm64"],
      },
      "node_modules/@tool/tool-darwin-x64": {
        version: "1.0.0",
        optional: true,
        os: ["darwin"],
        cpu: ["x64"],
      },
      "node_modules/@tool/tool-linux-arm64-gnu": {
        version: "1.0.0",
        optional: true,
        os: ["linux"],
        cpu: ["arm64"],
        libc: ["glibc"],
      },
      "node_modules/@tool/tool-linux-x64-gnu": {
        version: "1.0.0",
        optional: true,
        os: ["linux"],
        cpu: ["x64"],
        libc: ["glibc"],
      },
    },
  },
  null,
  2,
)}\n`;

function pruneNpm(lock: string): string {
  const parsed = JSON.parse(lock) as { packages: Record<string, unknown> };
  for (const key of Object.keys(parsed.packages)) {
    if (/tool-(darwin|linux-arm64)/.test(key)) delete parsed.packages[key];
  }
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

/** A git checkout with full lockfiles committed and pruned ones in the worktree. */
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lockfiles-"));
  roots.push(root);
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  write("pnpm-lock.yaml", PNPM_FULL);
  write("examples/package-lock.json", NPM_FULL);
  write("docs/package-lock.json", NPM_FULL);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "full");
  write("pnpm-lock.yaml", prunePnpm(PNPM_FULL));
  write("examples/package-lock.json", pruneNpm(NPM_FULL));
  return {
    root,
    read: (file: string) => fs.readFileSync(path.join(root, file), "utf8"),
  };
}

describe("lockfiles", () => {
  it("the repository's lockfiles install native tools on macOS and Linux", () => {
    const result = run(["check"]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(
      /darwin-arm64, darwin-x64, linux-x64, linux-arm64/,
    );
  });

  it("reports native packages that lost platform builds", () => {
    expect(callLibrary("checkLockfile", "pnpm", PNPM_FULL)).toEqual([]);
    expect(callLibrary("checkLockfile", "pnpm", prunePnpm(PNPM_FULL))).toEqual([
      "tool@1.0.0: no darwin-arm64 build of @tool/tool-*",
      "tool@1.0.0: no darwin-x64 build of @tool/tool-*",
      "tool@1.0.0: no linux-arm64 build of @tool/tool-*",
    ]);
    expect(callLibrary("checkLockfile", "npm", NPM_FULL)).toEqual([]);
    expect(
      callLibrary("checkLockfile", "npm", pruneNpm(NPM_FULL)),
    ).toHaveLength(3);
  });

  it("needs a glibc build on Linux", () => {
    const muslOnly = PNPM_FULL.replace(/libc: \[glibc\]/g, "libc: [musl]");
    expect(callLibrary("checkLockfile", "pnpm", muslOnly)).toEqual([
      "tool@1.0.0: no linux-x64 build of @tool/tool-*",
      "tool@1.0.0: no linux-arm64 build of @tool/tool-*",
    ]);
  });

  it("leaves unchanged lockfiles byte-for-byte identical", () => {
    expect(
      callLibrary<{ lock: string }>("restorePnpmLock", PNPM_FULL, PNPM_FULL)
        .lock,
    ).toBe(PNPM_FULL);
    expect(
      callLibrary<{ lock: string }>("restoreNpmLock", NPM_FULL, NPM_FULL).lock,
    ).toBe(NPM_FULL);
  });

  it("restores pruned builds exactly from a git ref, then checks", () => {
    const { root, read } = fixture();
    const failing = run(["check", "--root", root]);
    expect(failing.status).toBe(1);
    expect(failing.stderr).toMatch(
      /pnpm-lock\.yaml: tool@1\.0\.0: no darwin-arm64 build/,
    );
    expect(failing.stderr).toMatch(/run `pnpm lockfiles:restore`/);

    const restored = run(["restore", "--from", "HEAD", "--root", root]);
    expect(restored.status).toBe(0);
    expect(restored.stdout).toMatch(
      /pnpm-lock\.yaml: restored 3 platform packages from HEAD/,
    );
    expect(restored.stdout).toMatch(
      /examples\/package-lock\.json: restored 3 platform packages/,
    );
    expect(restored.stdout).toMatch(
      /docs\/package-lock\.json: nothing to restore/,
    );
    expect(read("pnpm-lock.yaml")).toBe(PNPM_FULL);
    expect(read("examples/package-lock.json")).toBe(NPM_FULL);
  });

  it("does not restore builds of a version that changed", () => {
    const bumped = prunePnpm(PNPM_FULL).replace(/tool@1\.0\.0/g, "tool@1.1.0");
    const result = callLibrary<{ restored: string[] }>(
      "restorePnpmLock",
      bumped,
      PNPM_FULL,
    );
    expect(result.restored).toEqual([]);
  });

  it("explains its usage and skips lockfiles missing from the ref", () => {
    expect(run(["nope"]).stderr).toMatch(
      /Usage: lockfiles\.mjs check \| restore/,
    );
    const { root } = fixture();
    const result = run(["restore", "--from", "no-such-ref", "--root", root]);
    expect(result.stdout).toMatch(
      /pnpm-lock\.yaml: not in no-such-ref, skipped/,
    );
  });
});
