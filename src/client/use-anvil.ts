import type { Account } from "viem";
import type {
  AnvilCheckpoint,
  StartedAnvilContainer,
} from "../container/started-anvil-container";
import { AnvilTestClientError } from "../errors";

type Hook = (fn: () => Promise<void>, timeout?: number) => unknown;

/**
 * Hooks for {@link useAnvil}: taken from the globals of Jest, Vitest
 * (`globals: true`), Mocha and Jasmine, or passed explicitly.
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
  /** `"test"` (default): each test starts from the post-`setup` state; `"none"`: state carries over. */
  readonly isolation?: "test" | "none";
  /** Runs once after start, before the isolation baseline: deploy fixtures, fund accounts… */
  readonly setup?: (anvil: StartedAnvilContainer<TAccount>) => unknown;
  /** Start/setup and stop hook timeout in ms (default 120 000: time to pull the image). */
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
 * One node per test file: started (and `setup`) in `beforeAll`, restored after
 * each test, stopped in `afterAll`. The handle works in tests and hooks only
 * (`NOT_STARTED` earlier).
 * @example
 * const anvil = useAnvil(new AnvilContainer().withTestClient((c) => c.withAccount(0)), { setup });
 * @see {@link https://hellalabs.dev/foundryanvil-testcontainers-nodejs/docs/tasks/test-suites/share-a-node | Share one node per test file} (docs)
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
      // evm_revert keeps pending transactions (they would leak into the next
      // test), and snapshots don't include the pool: empty it while the state
      // is restored — one round trip less per test.
      const [dropped, restored] = await Promise.allSettled([
        started.testClient.dropAllTransactions(),
        baseline.restore(),
      ]);
      if (restored.status === "rejected") {
        const error: unknown = restored.reason;
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
      if (dropped.status === "rejected") throw dropped.reason;
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
