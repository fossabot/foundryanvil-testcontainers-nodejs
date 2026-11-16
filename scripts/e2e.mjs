#!/usr/bin/env node
/**
 * Runs the end-to-end test suite (test/e2e).
 *
 *   pnpm test:e2e                 # Docker / Testcontainers (default, used in CI/CD)
 *   pnpm test:e2e --no-docker     # local anvil binary – LOCAL TESTING ONLY
 *
 * Any other argument is forwarded to Jest, e.g. `pnpm test:e2e --no-docker -t parity`.
 */
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { resolveAnvilBinary } = require("./anvil-binary.cjs");
const { isDockerAvailable } = require("./docker-runtime.cjs");

const argv = process.argv.slice(2).filter((arg) => arg !== "--");
const noDocker = argv.includes("--no-docker");
const jestArgs = argv.filter((arg) => arg !== "--no-docker");

const useColor = process.stderr.isTTY && !process.env.NO_COLOR;
const yellow = (text) => (useColor ? `\u001b[33m${text}\u001b[0m` : text);
const bold = (text) => (useColor ? `\u001b[1m${text}\u001b[0m` : text);
const red = (text) => (useColor ? `\u001b[31m${text}\u001b[0m` : text);

function defaultImageTag() {
  try {
    const source = fs.readFileSync(path.join(root, "src", "container", "anvil-container.ts"), "utf8");
    return /DEFAULT_ANVIL_IMAGE\s*=\s*"([^"]+)"/.exec(source)?.[1];
  } catch {
    return undefined;
  }
}

const env = { ...process.env };

if (noDocker) {
  const resolved = resolveAnvilBinary(process.env, root);
  if (!resolved) {
    console.error(
      red(bold("✖ --no-docker: no local anvil binary found.\n")) +
        (process.env.ANVIL_BINARY
          ? `  ANVIL_BINARY points to "${process.env.ANVIL_BINARY}", which does not exist.\n`
          : "  The bundled @foundry-rs/anvil devDependency has no binary for this platform\n" +
            `  (${process.platform}/${process.arch}) or was not installed (\`pnpm install\`).\n`) +
        "  Alternatives: install Foundry (https://getfoundry.sh: `foundryup`) or set ANVIL_BINARY.",
    );
    process.exit(1);
  }
  const binary = resolved.path;
  const version = (spawnSync(binary, ["--version"], { encoding: "utf8" }).stdout || "unknown")
    .split("\n")[0]
    .trim();
  const image = defaultImageTag();
  const imageVersion = image?.split(":").pop()?.replace(/^v/, "");
  const inCi = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);

  const lines = [
    "",
    bold("⚠  WARNING: running the e2e suite in --no-docker mode"),
    "",
    `   anvil binary : ${binary}`,
    `   source       : ${resolved.source}`,
    `   version      : ${version}`,
    "",
    "   This mode runs the tests against a LOCAL anvil process and is ONLY meant",
    "   for local testing on machines without Docker. It does not exercise the",
    "   container lifecycle (image, entrypoint, port mapping, file copies,",
    "   graceful `docker stop`).",
    "",
    "   For CI/CD (e.g. GitHub Actions) Docker is available and MUST be used:",
    "   run `pnpm test:e2e` without --no-docker.",
  ];
  if (imageVersion && !version.includes(imageVersion)) {
    lines.push(
      "",
      `   Note: the default Docker image is ${image}; your local anvil (${version})`,
      "   may behave differently from the version used in Docker mode.",
    );
  }
  if (inCi) {
    lines.push(
      "",
      bold("   A CI environment was detected (CI / GITHUB_ACTIONS is set)."),
      "   Remove --no-docker from your pipeline and use Docker instead.",
    );
  }
  lines.push("");
  console.warn(yellow(lines.join("\n")));

  env.ANVIL_E2E_MODE = "local";
  env.ANVIL_BINARY = binary;
} else {
  if (!isDockerAvailable()) {
    console.error(
      red(bold("✖ No container runtime detected.\n")) +
        "  The e2e suite runs anvil in Docker by default (this is what CI/CD uses).\n" +
        "  Start Docker (or set DOCKER_HOST), or – for local testing only – run:\n\n" +
        "    pnpm test:e2e --no-docker\n",
    );
    process.exit(1);
  }
  env.ANVIL_E2E_MODE = "docker";
}

const jestBin = require.resolve("jest/bin/jest");
const child = spawn(
  process.execPath,
  [jestBin, "--colors", "--injectGlobals", "test/e2e", ...jestArgs],
  { cwd: root, env, stdio: "inherit" },
);
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
