import type { Account } from "viem";
import type {
  AnvilCheckpoint,
  StartedAnvilContainer,
} from "../container/started-anvil-container";
import { AnvilTestClientError } from "../errors";

type Hook = (fn: () => Promise<void>, timeout?: number) => unknown;

/**
 * Test-framework hooks used by {@link useAnvil}. Jest, Vitest (with
 * `globals: true`) and Jasmine provide them as globals; Mocha's `before` /
 * `after` are picked up too (Mocha ignores the timeout argument: raise its
 * `--timeout`). Pass them explicitly otherwise, e.g.
 * `import { beforeAll, afterAll, afterEach } from "vitest"`.
 */
export interface AnvilTestHooks {
  /** Starts the node (Mocha: `before`). */
  readonly beforeAll: Hook;
  /** Stops the node (Mocha: `after`). */
  readonly afterAll: Hook;
  /** Needed for `isolation: "test"` (the default). */
  readonly afterEach?: Hook;
}

/** Anything that starts a node, e.g. an {@link AnvilContainer}. */
export interface AnvilStartable<TAccount extends Account | undefined> {
  /** Starts the node; called once, in `beforeAll`. */
  start(): Promise<StartedAnvilContainer<TAccount>>;
}

/** Settings of {@link useAnvil}. */
export interface UseAnvilSettings<TAccount extends Account | undefined> {
  /**
   * `"test"` (default): every test starts from the state right after
   * `setup`: after each test the mempool is emptied (reverting a snapshot
   * keeps pending transactions) and the post-setup snapshot is restored, in
   * milliseconds. `"none"`: state carries over between tests.
   */
  readonly isolation?: "test" | "none";
  /** Runs once after start, before the isolation baseline: deploy fixtures, fund accounts… */
  readonly setup?: (anvil: StartedAnvilContainer<TAccount>) => unknown;
  /** Timeout of the start/setup and stop hooks in ms (default 120 000, enough to pull the image). */
  readonly timeout?: number;
  /** Explicit hooks instead of the framework globals. */
  readonly hooks?: AnvilTestHooks;
}

/** Default timeout of the {@link useAnvil} hooks. */
export const DEFAULT_USE_ANVIL_TIMEOUT_MS = 120_000;

function resolveHooks(
  explicit: AnvilTestHooks | undefined,
  needsAfterEach: boolean,
): Required<AnvilTestHooks> {
  const globals = globalThis as Record<string, unknown>;
  const pick = (...names: string[]) =>
    names.map((name) => globals[name]).find((h) => typeof h === "function") as
      Hook | undefined;
  const beforeAll = explicit?.beforeAll ?? pick("beforeAll", "before");
  const afterAll = explicit?.afterAll ?? pick("afterAll", "after");
  const afterEach = explicit?.afterEach ?? pick("afterEach");
  const missing = [
    beforeAll ? undefined : "beforeAll",
    afterAll ? undefined : "afterAll",
    afterEach || !needsAfterEach ? undefined : "afterEach",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new AnvilTestClientError(
      "TEST_HOOKS_UNAVAILABLE",
      `useAnvil() needs the test hooks ${missing.join(", ")}, which were not found as globals. ` +
        "Call it inside a test file (Jest, Vitest with `globals: true`, Mocha, Jasmine) or pass them: " +
        "useAnvil(container, { hooks: { beforeAll, afterAll, afterEach } }).",
    );
  }
  return {
    beforeAll: beforeAll!,
    afterAll: afterAll!,
    afterEach: afterEach ?? (() => undefined),
  };
}

/**
 * Starts a node for the current test file and wires it into the test
 * lifecycle: `beforeAll` starts it (and runs `setup`), `afterAll` stops it,
 * and with `isolation: "test"` (default) `afterEach` restores the state of
 * right after setup.
 *
 * Returns a handle with the full {@link StartedAnvilContainer} API that is
 * usable inside tests and hooks; using it earlier (e.g. at `describe` time)
 * throws {@link AnvilTestClientError} `NOT_STARTED`.
 *
 * @example
 * const anvil = useAnvil(new AnvilContainer().withTestClient((c) => c.withAccount(0)), {
 *   setup: async (node) => { token = await deployToken(node) },
 * });
 * it("transfers", async () => {
 *   await anvil.testClient.sendTransaction({ to: bob, value: 1n });
 * });
 */
export function useAnvil<TAccount extends Account | undefined = undefined>(
  container: AnvilStartable<TAccount>,
  settings: UseAnvilSettings<TAccount> = {},
): StartedAnvilContainer<TAccount> {
  if (
    typeof (container as Partial<AnvilStartable<TAccount>>)?.start !==
    "function"
  ) {
    throw new TypeError(
      "useAnvil() expects an AnvilContainer (or any object with start())",
    );
  }
  const isolation = settings.isolation ?? "test";
  if (isolation !== "test" && isolation !== "none") {
    throw new TypeError(
      `useAnvil(): isolation must be "test" or "none", received ${String(isolation)}`,
    );
  }
  const timeout = settings.timeout ?? DEFAULT_USE_ANVIL_TIMEOUT_MS;
  const hooks = resolveHooks(settings.hooks, isolation === "test");

  let started: StartedAnvilContainer<TAccount> | undefined;
  let baseline: AnvilCheckpoint | undefined;

  hooks.beforeAll(async () => {
    started = await container.start();
    await settings.setup?.(started);
    if (isolation === "test") baseline = await started.checkpoint();
  }, timeout);

  if (isolation === "test") {
    hooks.afterEach(async () => {
      if (!started || !baseline) return;
      try {
        // evm_revert keeps pending transactions: they would leak into the next test.
        await started.testClient.dropAllTransactions();
        await baseline.restore();
      } catch (error: unknown) {
        if ((error as AnvilTestClientError).code !== "SNAPSHOT_NOT_FOUND") {
          throw error;
        }
        throw new AnvilTestClientError(
          "SNAPSHOT_NOT_FOUND",
          "useAnvil(): the per-test baseline could not be restored because the test discarded all snapshots " +
            '(reset() or loadState()). Use isolation: "none" for tests that reset the node, or put them in their own file.',
          { cause: error },
        );
      }
    });
  }

  hooks.afterAll(async () => {
    const node = started;
    started = undefined;
    baseline = undefined;
    await node?.stop();
  }, timeout);

  return new Proxy({} as StartedAnvilContainer<TAccount>, {
    get(_target, property) {
      if (!started) {
        // Keep `await handle` and inspection by test runners harmless.
        if (property === "then" || typeof property === "symbol") {
          return undefined;
        }
        throw new AnvilTestClientError(
          "NOT_STARTED",
          `useAnvil(): cannot read "${property}" because the node is not running. ` +
            "It starts in beforeAll and stops in afterAll: use it inside tests and hooks, not at describe/module level.",
        );
      }
      const value: unknown = Reflect.get(started, property, started);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(started)
        : value;
    },
    has(_target, property) {
      return started ? property in started : false;
    },
    getPrototypeOf() {
      return started
        ? (Object.getPrototypeOf(started) as object)
        : Object.prototype;
    },
  });
}
