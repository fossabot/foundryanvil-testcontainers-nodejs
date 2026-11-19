/**
 * Jest setup file: with `--no-docker` (EXAMPLES_E2E_MODE=local), every
 * `AnvilContainer` runs anvil as a local process instead of a container.
 *
 * It plugs into the library's public extension point,
 * `AnvilContainer.startRuntime()`, exactly like `LocalAnvilContainer`:
 * validation, the test client and errors stay the library's own, and the
 * examples keep writing `new AnvilContainer(options)` like any user.
 * LOCAL TESTING ONLY: CI runs the examples in Docker.
 */
import { AnvilContainer } from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import { LocalAnvilContainer } from "./local-anvil";
import { E2E_MODE } from "./runtime";

// #region use-local-runtime
type WithRuntime = { startRuntime: unknown };

/** Routes `AnvilContainer.startRuntime()` to the local runtime. */
export function useLocalRuntime(): void {
  (AnvilContainer.prototype as unknown as WithRuntime).startRuntime = (
    LocalAnvilContainer.prototype as unknown as WithRuntime
  ).startRuntime;
}

if (E2E_MODE === "local") useLocalRuntime();
// #endregion use-local-runtime
