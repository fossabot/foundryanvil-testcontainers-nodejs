"use strict";
/**
 * Resolves the anvil executable used by `pnpm test:e2e --no-docker`
 * (LOCAL TESTING ONLY – CI/CD must use Docker).
 *
 * Order:
 *  1. `ANVIL_BINARY` – explicit override,
 *  2. the bundled `@foundry-rs/anvil` devDependency (pinned to the same
 *     version as the default Docker image) – works out of the box,
 *  3. `anvil` on the `PATH`,
 *  4. `~/.foundry/bin/anvil` (foundryup).
 *
 * The platform binary is resolved directly (not the package's Node wrapper
 * script) so signals such as SIGTERM – which makes anvil write
 * `--dump-state` – reach anvil itself.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const EXECUTABLE = process.platform === "win32" ? "anvil.exe" : "anvil";
const ARCH = { x64: "amd64", arm64: "arm64" };

/** npm package containing the prebuilt binary for this platform, if any. */
function platformPackageName() {
  const arch = ARCH[process.arch];
  if (!arch || !["linux", "darwin", "win32"].includes(process.platform)) return undefined;
  return `@foundry-rs/anvil-${process.platform}-${arch}`;
}

/** The binary shipped with the `@foundry-rs/anvil` devDependency, if installed. */
function bundledAnvil(fromDir = process.cwd()) {
  const platformPackage = platformPackageName();
  if (!platformPackage) return undefined;
  try {
    const wrapperManifest = require.resolve("@foundry-rs/anvil/package.json", { paths: [fromDir, __dirname] });
    const manifest = require.resolve(`${platformPackage}/package.json`, {
      paths: [path.dirname(wrapperManifest)],
    });
    const binary = path.join(path.dirname(manifest), "bin", EXECUTABLE);
    if (!fs.existsSync(binary)) return undefined;
    const { version } = JSON.parse(fs.readFileSync(wrapperManifest, "utf8"));
    return { path: binary, source: `bundled @foundry-rs/anvil ${version}` };
  } catch {
    return undefined;
  }
}

/**
 * @returns {{ path: string, source: string } | undefined}
 */
function resolveAnvilBinary(env = process.env, fromDir = process.cwd()) {
  if (env.ANVIL_BINARY) {
    return fs.existsSync(env.ANVIL_BINARY)
      ? { path: path.resolve(env.ANVIL_BINARY), source: "ANVIL_BINARY" }
      : undefined;
  }
  const bundled = bundledAnvil(fromDir);
  if (bundled) return bundled;
  for (const directory of (env.PATH || "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, EXECUTABLE);
    if (fs.existsSync(candidate)) return { path: candidate, source: "PATH" };
  }
  const foundryup = path.join(os.homedir(), ".foundry", "bin", EXECUTABLE);
  if (fs.existsSync(foundryup)) return { path: foundryup, source: "~/.foundry/bin (foundryup)" };
  return undefined;
}

module.exports = { resolveAnvilBinary, bundledAnvil, platformPackageName };
