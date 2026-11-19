/**
 * Custom-error assertions for viem errors.
 *
 * viem reports a contract revert as a `ContractFunctionRevertedError`
 * somewhere in the error's `cause` chain, with the decoded custom error in
 * `data` (`errorName`, `args`) when the ABI declares it.
 *
 * Errors are matched by **name**, not `instanceof`: with `npm link` (or any
 * setup with two copies of viem) the library and your code load different
 * viem classes, so `instanceof` silently fails.
 */

/** A decoded revert. */
export interface DecodedRevert {
  /** Custom error name, `"Error"` for `require(…, "reason")`, `"Panic"` for panics. */
  readonly errorName: string;
  readonly args: readonly unknown[];
  /** Human readable reason (`require` message or viem's description). */
  readonly reason?: string;
}

interface RevertLike {
  name?: string;
  data?: { errorName?: string; args?: readonly unknown[] };
  reason?: string;
  cause?: unknown;
}

// #region decode-revert
/** Finds the decoded revert in an error chain (`undefined` if it is not a revert). */
export function decodeRevert(error: unknown): DecodedRevert | undefined {
  for (
    let current = error as RevertLike | undefined;
    current && typeof current === "object";
    current = current.cause as RevertLike | undefined
  ) {
    if (current.name === "ContractFunctionRevertedError") {
      return {
        errorName: current.data?.errorName ?? "unknown",
        args: current.data?.args ?? [],
        reason: current.reason,
      };
    }
  }
  return undefined;
}
// #endregion decode-revert

/**
 * Awaits `action` and asserts it reverted with the custom error `errorName`
 * (and `args`, when given). Returns the decoded revert for further checks.
 *
 * @example
 * await expectRevert(
 *   client.simulateContract({ address: vault, abi, functionName: "withdraw" }),
 *   "StillLocked",
 * );
 */
export async function expectRevert(
  action: Promise<unknown>,
  errorName: string,
  args?: readonly unknown[],
): Promise<DecodedRevert> {
  let error: unknown;
  try {
    await action;
  } catch (caught: unknown) {
    error = caught;
  }
  if (error === undefined) {
    throw new Error(
      `Expected a revert with ${errorName}, but the call succeeded`,
    );
  }
  const revert = decodeRevert(error);
  if (!revert) {
    throw new Error(
      `Expected a revert with ${errorName}, but got: ${describeError(error)}`,
      { cause: error },
    );
  }
  if (revert.errorName !== errorName) {
    throw new Error(
      `Expected a revert with ${errorName}, but it reverted with ${revert.errorName}(${revert.args.map(String).join(", ")})`,
      { cause: error },
    );
  }
  if (args !== undefined && !sameArgs(revert.args, args)) {
    throw new Error(
      `${errorName} reverted with (${revert.args.map(String).join(", ")}), expected (${args.map(String).join(", ")})`,
      { cause: error },
    );
  }
  return revert;
}

function sameArgs(
  actual: readonly unknown[],
  expected: readonly unknown[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => {
      const other = expected[index];
      return typeof value === "string" && typeof other === "string"
        ? value.toLowerCase() === other.toLowerCase()
        : value === other;
    })
  );
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : JSON.stringify(error);
}
