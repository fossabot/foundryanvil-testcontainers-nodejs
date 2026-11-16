import { isDockerAvailable } from "../../scripts/docker-runtime.cjs";

/**
 * How the e2e suite reaches anvil: `docker` (Testcontainers, default and
 * required in CI/CD), `local` (`pnpm test:e2e --no-docker`, local testing
 * only) or `skip` (no runtime detected and no mode requested).
 */
export type E2EMode = "docker" | "local" | "skip";

/** `ANVIL_E2E_MODE` (set by `scripts/e2e.mjs`), else Docker if available, else skip. */
export function resolveE2EMode(env: NodeJS.ProcessEnv = process.env): E2EMode {
  const requested = env.ANVIL_E2E_MODE;
  if (requested === "docker" || requested === "local" || requested === "skip")
    return requested;
  return isDockerAvailable(env) ? "docker" : "skip";
}

export const E2E_MODE: E2EMode = resolveE2EMode();
export const E2E_ENABLED = E2E_MODE !== "skip";

let warned = false;

/** `describe` for e2e suites; skipped (with a one-time hint) when they cannot run. */
export function describeE2E(name: string, fn: () => void): void {
  if (E2E_ENABLED) return describe(name, fn);
  if (!warned && process.env.ANVIL_E2E_MODE !== "skip") {
    warned = true;
    // Direct stderr write: Jest drops console output of fully skipped suites.
    process.stderr.write(
      "[anvil-testcontainers] No container runtime detected – e2e tests are skipped. " +
        "Run `pnpm test:e2e --no-docker` to run them against a local anvil binary (local testing only).\n",
    );
  }
  describe.skip(name, fn);
}
