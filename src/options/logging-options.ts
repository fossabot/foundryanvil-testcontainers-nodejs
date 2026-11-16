import { groupFlags } from "../flags/registry";
import { Color, LogVerbosity } from "../types";
import {
  OptionsGroup,
  registerOptionsGroup,
  StoreHandle,
} from "./options-view";
import { enumArg, fail } from "./validators";

/** Flags of {@link LoggingOptions}. */
export const LOGGING_FLAGS = groupFlags("logs");

/** Verbosity accepted by {@link LoggingOptions.verboseLogs}. */
export type VerbosityLevel = LogVerbosity | 1 | 2 | 3 | 4 | 5;

/** Log format and verbosity (`.logs`). Readiness doesn't depend on logs, so all modes are safe. */
export class LoggingOptions extends OptionsGroup {
  protected readonly groupName = "logs";

  /** @internal */
  constructor(store: StoreHandle) {
    super(store);
  }

  /** Log colours (`--color`, default auto). Conflicts with `jsonLogFormat`. */
  public withColor(color: Color): this {
    return this.setValue("--color", enumArg("--color", color, Color, "color"));
  }

  /** JSON logs (`--json`). Conflicts with `quiet`, `withColor`, `withMarkdownFormat`. */
  public jsonLogFormat(enabled = true): this {
    return this.toggleFlag("--json", enabled);
  }

  /** Markdown logs (`--md`). Conflicts with `jsonLogFormat`. */
  public withMarkdownFormat(enabled = true): this {
    return this.toggleFlag("--md", enabled);
  }

  /** No log output (`--quiet`). Conflicts with `verboseLogs`, `jsonLogFormat`. */
  public quiet(enabled = true): this {
    return this.toggleFlag("--quiet", enabled);
  }

  /** Verbosity 1–5 (`-v` … `-vvvvv`). Conflicts with `quiet`. */
  public verboseLogs(level: VerbosityLevel): this {
    if (!Number.isInteger(level) || level < 1 || level > 5) {
      fail(
        "--verbosity",
        `expected a verbosity level between 1 and 5, received ${JSON.stringify(level)}`,
      );
    }
    return this.setValue("--verbosity", level);
  }

  /** Don't print Solidity `console.log` (`--disable-console-log`). */
  public disableConsoleLog(enabled = true): this {
    return this.toggleFlag("--disable-console-log", enabled);
  }
}

registerOptionsGroup("logs", (store) => new LoggingOptions(store));
