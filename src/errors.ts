import type { AnvilFlag } from "./flags/registry";

/**
 * Invalid configuration: bad value, conflicting flags or unmet dependency.
 * The message names the fluent methods and flags involved.
 */
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

/** anvil did not become ready (exited, timed out, Docker failure); carries the command and log tail. */
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
