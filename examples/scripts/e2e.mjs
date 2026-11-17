#!/usr/bin/env node
/**
 * Runs the examples' end-to-end tests (test/e2e).
 *
 *   npm run test:e2e                  # anvil in Docker (default, what CI must use)
 *   npm run test:e2e -- --no-docker   # local anvil binary — LOCAL TESTING ONLY
 *
 * Other arguments are forwarded to Jest, e.g. `-- --no-docker -t "time travel"`.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { resolveAnvilBinary } = require("./anvil-binary.cjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2).filter((arg) => arg !== "--");
const noDocker = argv.includes("--no-docker");
const jestArgs = argv.filter((arg) => arg !== "--no-docker");

function dockerAvailable(env = process.env) {
  if (env.DOCKER_HOST || env.TESTCONTAINERS_HOST_OVERRIDE) return true;
  const home = os.homedir();
  return [
    "/var/run/docker.sock",
    path.join(home, ".docker", "run", "docker.sock"),
    path.join(home, ".docker", "desktop", "docker.sock"),
    path.join(home, ".colima", "default", "docker.sock"),
    "/run/podman/podman.sock",
  ].some((socket) => fs.existsSync(socket));
}

const env = { ...process.env };
if (noDocker) {
  const binary = resolveAnvilBinary();
  if (!binary) {
    console.error(
      "✖ --no-docker: no local anvil binary. Run `npm install` (the @foundry-rs/anvil " +
        "devDependency ships one), install Foundry (`foundryup`) or set ANVIL_BINARY.",
    );
    process.exit(1);
  }
  console.warn(
    `\n⚠  examples e2e in --no-docker mode (LOCAL TESTING ONLY)\n` +
      `   anvil: ${binary.path} (${binary.source})\n` +
      "   CI/CD must run the examples in Docker: `npm run test:e2e`.\n",
  );
  env.EXAMPLES_E2E_MODE = "local";
  env.ANVIL_BINARY = binary.path;
} else {
  if (!dockerAvailable()) {
    console.error(
      "✖ No container runtime detected. Start Docker (or set DOCKER_HOST), or — for local " +
        "testing only — run `npm run test:e2e -- --no-docker`.",
    );
    process.exit(1);
  }
  env.EXAMPLES_E2E_MODE = "docker";
}

const jest = require.resolve("jest/bin/jest");
// Docker mode may pull the image when a test starts its first container.
const child = spawn(
  process.execPath,
  [jest, "--colors", "--testTimeout=120000", "test/e2e", ...jestArgs],
  {
    cwd: root,
    env,
    stdio: "inherit",
  },
);
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
