/**
 * Deterministic installs: the library, its examples and the lockfiles agree
 * on the versions of viem and testcontainers, and everyone runs the pinned
 * pnpm, so `pnpm gate` behaves the same in the sandbox, in CI and locally.
 *
 * TODO: bump viem to ^2.57.20 and testcontainers to ^12.2.1 once the sandbox
 * registry mirror serves them (viem 2.57.20 needs ox 0.14.67). They were
 * rolled back to the newest patch releases the mirror can install. To bump:
 * update package.json (`pnpm add viem@<v> testcontainers@<v>`) and
 * examples/package.json, run `npm install` in examples/ until
 * package-lock.json stops changing, then `pnpm lockfiles:restore` and
 * `pnpm gate` (see CONTRIBUTING.md, "Dependencies and lockfiles"). The same
 * TODO is in pnpm-workspace.yaml.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..", "..");

/** Versions pinned until the TODO above is done. */
const PINNED = { viem: "2.57.1", testcontainers: "12.2.0" } as const;

function json<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")) as T;
}

type Manifest = {
  dependencies: Record<string, string>;
  packageManager?: string;
};
type NpmLock = { packages: Record<string, { version?: string }> };

/** Versions pnpm-lock.yaml resolves for the root importer's dependencies. */
function pnpmImporterVersions(): Record<string, string> {
  const lock = fs.readFileSync(path.join(ROOT, "pnpm-lock.yaml"), "utf8");
  const importer = lock.slice(
    lock.indexOf("\n  .:\n"),
    lock.indexOf("\npackages:"),
  );
  return Object.fromEntries(
    [
      ...importer.matchAll(
        /\n {6}'?([^'\s:]+)'?:\n {8}specifier: \S+\n {8}version: ([^(\s]+)/g,
      ),
    ].map(([, name, version]) => [name, version]),
  );
}

describe("dependency pins", () => {
  const root = json<Manifest>("package.json");
  const examples = json<Manifest>("examples/package.json");
  const examplesLock = json<NpmLock>("examples/package-lock.json");
  const resolved = pnpmImporterVersions();

  it("the library resolves the pinned viem and testcontainers", () => {
    expect(root.dependencies.viem).toBe(`^${PINNED.viem}`);
    expect(root.dependencies.testcontainers).toBe(`^${PINNED.testcontainers}`);
    expect(resolved.viem).toBe(PINNED.viem);
    expect(resolved.testcontainers).toBe(PINNED.testcontainers);
  });

  it("the examples use the same versions as the library", () => {
    expect(examples.dependencies.viem).toBe(PINNED.viem);
    expect(examplesLock.packages["node_modules/viem"].version).toBe(
      PINNED.viem,
    );
    expect(examplesLock.packages["node_modules/testcontainers"].version).toBe(
      PINNED.testcontainers,
    );
  });

  it("keeps the bump TODO where the pins live", () => {
    const workspace = fs.readFileSync(
      path.join(ROOT, "pnpm-workspace.yaml"),
      "utf8",
    );
    expect(workspace).toMatch(
      /TODO: bump viem to \^2\.57\.20 and testcontainers to \^12\.2\.1/,
    );
  });

  it("runs under the pinned pnpm", () => {
    expect(root.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    // Set when the tests run through pnpm (`pnpm test:unit`, `pnpm gate`).
    const agent = /\bpnpm\/(\S+)/.exec(process.env.npm_config_user_agent ?? "");
    if (agent) expect(`pnpm@${agent[1]}`).toBe(root.packageManager);
  });
});
