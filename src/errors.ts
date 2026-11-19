import type { TransactionReceipt } from "viem";
import type { AnvilFlag } from "./flags/registry";

/** Invalid value, conflicting flags or unmet dependency; names the methods and flags involved. */
export class AnvilConfigurationError extends Error {
  /** Flag that triggered the error. */
  public readonly flag?: AnvilFlag;
  /** Other flags involved (conflicts / dependencies). */
  public readonly relatedFlags: readonly AnvilFlag[];

  constructor(
    message: string,
    details: { flag?: AnvilFlag; relatedFlags?: readonly AnvilFlag[] } = {},
  ) {
    super(message);
    this.name = "AnvilConfigurationError";
    this.flag = details.flag;
    this.relatedFlags = details.relatedFlags ?? [];
  }
}

/** anvil exited, timed out or Docker failed; carries the command and log tail. */
export class AnvilStartupError extends Error {
  public readonly command: readonly string[];
  public readonly logs?: string;

  constructor(
    message: string,
    details: { command: readonly string[]; logs?: string; cause?: unknown },
  ) {
    super(message, { cause: details.cause });
    this.name = "AnvilStartupError";
    this.command = details.command;
    this.logs = details.logs;
  }
}

/** Invalid {@link TestClientOptions}, detected before start. */
export class AnvilTestClientConfigurationError extends AnvilConfigurationError {
  /** `TestClientOptions` setting involved, e.g. `"withAccount"`. */
  public readonly setting: string;

  constructor(
    setting: string,
    message: string,
    details: { flag?: AnvilFlag; relatedFlags?: readonly AnvilFlag[] } = {},
  ) {
    super(`TestClientOptions.${setting}(): ${message}`, details);
    this.name = "AnvilTestClientConfigurationError";
    this.setting = setting;
  }
}

/** Machine-readable reason of an {@link AnvilTestClientError}. */
export type AnvilTestClientErrorCode =
  /** The node was stopped; the client can no longer be used. */
  | "CONTAINER_STOPPED"
  /** `evm_revert` target does not exist (already reverted, or cleared by `reset`). */
  | "SNAPSHOT_NOT_FOUND"
  /** `useAnvil()` handle used before `beforeAll` started the node. */
  | "NOT_STARTED"
  /** `useAnvil()` found no `beforeAll` / `afterAll` test hooks. */
  | "TEST_HOOKS_UNAVAILABLE"
  /** The configured default account could not be resolved on the node. */
  | "ACCOUNT_UNAVAILABLE"
  /** A transaction was mined but reverted. */
  | "TRANSACTION_REVERTED"
  /** A step of an {@link AnvilCheats} chain failed. */
  | "CHEAT_FAILED"
  /** An {@link AnvilCheats} chain was extended after it had run. */
  | "CHEATS_ALREADY_RUN";

/** Every {@link AnvilTestClientErrorCode} with its meaning. */
export const ANVIL_TEST_CLIENT_ERROR_CODES: Readonly<
  Record<AnvilTestClientErrorCode, string>
> = Object.freeze({
  CONTAINER_STOPPED: "the node was stopped; the client can no longer be used",
  SNAPSHOT_NOT_FOUND:
    "evm_revert target does not exist (already reverted, or cleared by reset / loadState)",
  NOT_STARTED: "useAnvil() handle used before beforeAll started the node",
  TEST_HOOKS_UNAVAILABLE: "useAnvil() found no beforeAll / afterAll hooks",
  ACCOUNT_UNAVAILABLE:
    "the configured default account could not be resolved on the node",
  TRANSACTION_REVERTED: "a transaction was mined but reverted",
  CHEAT_FAILED: "a step of an AnvilCheats chain failed",
  CHEATS_ALREADY_RUN: "an AnvilCheats chain was extended after it had run",
});

/** Runtime misuse or failure of the test client; `code` tells which. */
export class AnvilTestClientError extends Error {
  /** Machine-readable reason, see {@link ANVIL_TEST_CLIENT_ERROR_CODES}. */
  public readonly code: AnvilTestClientErrorCode;

  constructor(
    code: AnvilTestClientErrorCode,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message, options);
    this.name = "AnvilTestClientError";
    this.code = code;
  }
}

/** A mined transaction reverted; carries the receipt and, when recoverable, the reason. */
export class AnvilTransactionRevertedError extends AnvilTestClientError {
  /** Hash of the reverted transaction. */
  public readonly hash: `0x${string}`;
  /** Its receipt (`status: "reverted"`). */
  public readonly receipt: TransactionReceipt;
  /** Revert reason from replaying the call, when available. */
  public readonly reason?: string;

  constructor(
    receipt: TransactionReceipt,
    reason?: string,
    options: { cause?: unknown } = {},
  ) {
    super(
      "TRANSACTION_REVERTED",
      `Transaction ${receipt.transactionHash} reverted in block ${receipt.blockNumber}` +
        (reason ? `: ${reason}` : " (no revert reason available)") +
        `. Pass { throwOnRevert: false } to get the receipt instead.`,
      options,
    );
    this.name = "AnvilTransactionRevertedError";
    this.hash = receipt.transactionHash;
    this.receipt = receipt;
    this.reason = reason;
  }
}

/** @internal viem's short message plus the node's `details`, on one line. */
export function errorReason(error: unknown): string {
  const { shortMessage, details } = (error ?? {}) as {
    shortMessage?: string;
    details?: string;
  };
  const short = shortMessage?.split("\n")[0].replace(/\.$/, "");
  if (short && details && !short.includes(details)) {
    return `${short}: ${details}`;
  }
  if (short) return short;
  return error instanceof Error ? error.message : String(error);
}
