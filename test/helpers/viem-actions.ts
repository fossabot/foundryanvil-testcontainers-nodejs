import { createClient, custom, testActions } from "viem";

/**
 * Names of every viem test action, read from the installed viem at runtime,
 * so a viem upgrade that adds actions fails the coverage tests until the
 * library maps (and documents) them.
 */
export const VIEM_TEST_ACTIONS: readonly string[] = Object.freeze(
  Object.keys(
    testActions({ mode: "anvil" })(
      createClient({ transport: custom({ request: () => Promise.resolve() }) }),
    ),
  ).sort(),
);

/**
 * viem test actions that only read, so they have no `AnvilCheats` step
 * (they are available on `testClient`).
 */
export const READ_ONLY_TEST_ACTIONS: ReadonlySet<string> = new Set([
  "dumpState",
  "getAutomine",
  "getTxpoolContent",
  "getTxpoolStatus",
  "inspectTxpool",
  "snapshot",
  "revert",
  "sendUnsignedTransaction",
]);

/** viem test action → `AnvilCheats` step name, where they differ. */
export const CHEAT_NAMES: Readonly<Record<string, string>> = {
  impersonateAccount: "impersonate",
  stopImpersonatingAccount: "stopImpersonating",
};

/** Wraps a client and records the names of the methods called on it. */
export function trackCalls<T extends object>(
  target: T,
  invoked: Set<string>,
): T {
  return new Proxy(target, {
    get(object, property, receiver) {
      const value: unknown = Reflect.get(object, property, receiver);
      if (typeof value !== "function" || typeof property !== "string") {
        return value;
      }
      return (...args: unknown[]) => {
        invoked.add(property);
        return (value as (...a: unknown[]) => unknown).apply(object, args);
      };
    },
  });
}
