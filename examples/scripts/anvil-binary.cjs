"use strict";
/**
 * Finds a local anvil for `--no-docker` runs (LOCAL TESTING ONLY):
 * `ANVIL_BINARY`, then the `@foundry-rs/anvil` devDependency (its platform
 * package is executed directly so SIGTERM reaches anvil), then the `PATH`,
 * then foundryup's `~/.foundry/bin`.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const EXECUTABLE = process.platform === "win32" ? "anvil.exe" : "anvil";
const ARCH = { x64: "amd64", arm64: "arm64" };

/** @returns {{ path: string, source: string } | undefined} */
function resolveAnvilBinary(env = process.env) {
  if (env.ANVIL_BINARY) {
    return fs.existsSync(env.ANVIL_BINARY)
      ? { path: path.resolve(env.ANVIL_BINARY), source: "ANVIL_BINARY" }
      : undefined;
  }
  const arch = ARCH[process.arch];
  if (arch) {
    try {
      const wrapper = require.resolve("@foundry-rs/anvil/package.json");
      const manifest = require.resolve(
        `@foundry-rs/anvil-${process.platform}-${arch}/package.json`,
        { paths: [path.dirname(wrapper)] },
      );
      const binary = path.join(path.dirname(manifest), "bin", EXECUTABLE);
      if (fs.existsSync(binary)) {
        return { path: binary, source: "@foundry-rs/anvil devDependency" };
      }
    } catch {
      // Not installed for this platform: fall through.
    }
  }
  for (const directory of (env.PATH || "").split(path.delimiter)) {
    const candidate = directory && path.join(directory, EXECUTABLE);
    if (candidate && fs.existsSync(candidate))
      return { path: candidate, source: "PATH" };
  }
  const foundryup = path.join(os.homedir(), ".foundry", "bin", EXECUTABLE);
  return fs.existsSync(foundryup)
    ? { path: foundryup, source: "~/.foundry/bin" }
    : undefined;
}

module.exports = { resolveAnvilBinary };
