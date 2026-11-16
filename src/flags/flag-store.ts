import { AnvilConfigurationError } from "../errors";
import {
  ANVIL_FLAG_LIST,
  AnvilFlag,
  FlagSpec,
  getFlagSpec,
  isAnvilFlag,
} from "./registry";

/** Listen address inside the container; must be `0.0.0.0` for port publishing. */
export const ANVIL_HOST = "0.0.0.0";

/**
 * Stored flag value: `true` (switch), `string` (value), `null` (optional
 * value omitted), `string[]` (repeatable) or `number` (count, `-vvv` = 3).
 */
export type FlagValue = true | string | null | readonly string[] | number;

/** Host file copied into the container before start. */
export interface FileImport {
  readonly flag: AnvilFlag;
  readonly hostPath: string;
  readonly containerPath: string;
  /** `false` for `--state`, whose file may not exist yet. */
  readonly required: boolean;
}

/** Container file copied to the host after start or after stop. */
export interface FileExport {
  readonly flag: AnvilFlag;
  readonly containerPath: string;
  readonly hostPath: string;
  readonly when: "start" | "stop";
}

const isList = (value: unknown): value is readonly string[] =>
  Array.isArray(value);
const methodsOf = (spec: FlagSpec) => spec.methods.join(" / ") || "managed";

/**
 * @internal Typed flag storage enforcing value kinds and conflicts, and the
 * renderer: canonical `--help` order, `--flag=value` for optional values and
 * values starting with `-`, repeated multi-values, `-vvv` counts.
 */
export class FlagStore {
  private readonly values = new Map<AnvilFlag, FlagValue>();
  private readonly imports = new Map<AnvilFlag, FileImport>();
  private readonly exports = new Map<AnvilFlag, FileExport>();
  private rawArgs: string[] = [];

  public clone(): FlagStore {
    const copy = new FlagStore();
    for (const [flag, value] of this.values)
      copy.values.set(flag, isList(value) ? [...value] : value);
    for (const [flag, value] of this.imports) copy.imports.set(flag, value);
    for (const [flag, value] of this.exports) copy.exports.set(flag, value);
    copy.rawArgs = [...this.rawArgs];
    return copy;
  }

  public has(flag: AnvilFlag): boolean {
    return this.values.has(flag);
  }

  public get(flag: AnvilFlag): FlagValue | undefined {
    return this.values.get(flag);
  }

  /** Configured flags in canonical order. */
  public entries(): ReadonlyArray<readonly [AnvilFlag, FlagValue]> {
    return ANVIL_FLAG_LIST.filter((spec) => this.values.has(spec.flag)).map(
      (spec) => [spec.flag, this.values.get(spec.flag)!] as const,
    );
  }

  public toObject(): Readonly<Partial<Record<AnvilFlag, FlagValue>>> {
    const result: Partial<Record<AnvilFlag, FlagValue>> = {};
    for (const [flag, value] of this.entries())
      result[flag] = isList(value) ? [...value] : value;
    return result;
  }

  public fileImports(): readonly FileImport[] {
    return [...this.imports.values()];
  }

  public fileExports(): readonly FileExport[] {
    return [...this.exports.values()];
  }

  /** Sets a value; throws on wrong kind, conflicts or managed flags. */
  public set(flag: AnvilFlag, value: FlagValue): void {
    const spec = getFlagSpec(flag);
    this.assertNotManaged(spec);
    const ok =
      (spec.kind === "boolean" && value === true) ||
      (spec.kind === "value" && typeof value === "string") ||
      (spec.kind === "optional-value" &&
        (value === null || typeof value === "string")) ||
      (spec.kind === "multi-value" && isList(value)) ||
      (spec.kind === "count" &&
        Number.isInteger(value) &&
        (value as number) > 0);
    if (!ok) {
      throw new AnvilConfigurationError(
        `Invalid value for ${flag} (${spec.kind} flag): ${JSON.stringify(value)}`,
        { flag },
      );
    }
    this.assertNoConflict(spec);
    this.values.set(flag, isList(value) ? [...value] : value);
  }

  /** Appends to a repeatable flag. */
  public add(flag: AnvilFlag, value: string): void {
    const spec = getFlagSpec(flag);
    if (spec.kind !== "multi-value") {
      throw new AnvilConfigurationError(
        `${flag} is not a repeatable flag and cannot be added to`,
        { flag },
      );
    }
    this.assertNoConflict(spec);
    const existing = this.values.get(flag);
    this.values.set(flag, [...(isList(existing) ? existing : []), value]);
  }

  /** Sets (`true`) or removes (`false`) a boolean switch. */
  public toggle(flag: AnvilFlag, enabled: boolean): void {
    if (getFlagSpec(flag).kind !== "boolean") {
      throw new AnvilConfigurationError(
        `${flag} is not a boolean switch and cannot be toggled`,
        { flag },
      );
    }
    if (enabled) this.set(flag, true);
    else this.unset(flag);
  }

  /** Removes a flag and its file transfers; no-op when absent. */
  public unset(flag: AnvilFlag): void {
    this.assertNotManaged(getFlagSpec(flag));
    this.values.delete(flag);
    this.imports.delete(flag);
    this.exports.delete(flag);
  }

  public unsetAll(flags: readonly AnvilFlag[]): void {
    for (const flag of flags) this.unset(flag);
  }

  public addImport(transfer: FileImport): void {
    this.imports.set(transfer.flag, transfer);
  }

  public addExport(transfer: FileExport): void {
    this.exports.set(transfer.flag, transfer);
  }

  /** Appends raw args; rejects known flags and `--host`. */
  public addExtraArgs(args: readonly string[]): void {
    for (const arg of args) {
      if (typeof arg !== "string" || arg.length === 0) {
        throw new AnvilConfigurationError(
          "Extra arguments must be non-empty strings",
        );
      }
      if (isAnvilFlag(arg) || arg.startsWith("--host")) {
        throw new AnvilConfigurationError(
          `"${arg}" is a known anvil flag – configure it through the fluent API instead of withExtraArgs()`,
          { flag: isAnvilFlag(arg) ? arg : "--host" },
        );
      }
    }
    this.rawArgs.push(...args);
  }

  /** Conflicts (defensive) and unmet requirements; empty when valid. */
  public violations(): AnvilConfigurationError[] {
    const errors: AnvilConfigurationError[] = [];
    for (const [flag] of this.entries()) {
      const spec = getFlagSpec(flag);
      for (const other of spec.conflicts) {
        if (this.values.has(other) && flag < other)
          errors.push(conflictError(spec, getFlagSpec(other)));
      }
      for (const required of spec.requires) {
        if (!this.values.has(required)) {
          errors.push(
            new AnvilConfigurationError(
              `${flag} (${methodsOf(spec)}) requires ${required} (${methodsOf(getFlagSpec(required))}) to be configured as well`,
              { flag, relatedFlags: [required] },
            ),
          );
        }
      }
      if (
        spec.requiresAnyOf.length > 0 &&
        !spec.requiresAnyOf.some((c) => this.values.has(c))
      ) {
        errors.push(
          new AnvilConfigurationError(
            `${flag} (${methodsOf(spec)}) requires one of ${spec.requiresAnyOf.join(", ")} to be configured as well${spec.stricterThanAnvil ? ` – ${spec.stricterThanAnvil}` : ""}`,
            { flag, relatedFlags: spec.requiresAnyOf },
          ),
        );
      }
    }
    return errors;
  }

  /** Command line arguments without the executable. */
  public render(): string[] {
    const args = ["--host", ANVIL_HOST];
    for (const [flag, value] of this.entries()) {
      const kind = getFlagSpec(flag).kind;
      if (kind === "boolean") args.push(flag);
      else if (kind === "count") args.push(`-${"v".repeat(value as number)}`);
      else if (kind === "optional-value")
        args.push(value === null ? flag : `${flag}=${value as string}`);
      else
        for (const item of isList(value) ? value : [value as string])
          args.push(...renderValue(flag, item));
    }
    return [...args, ...this.rawArgs];
  }

  private assertNotManaged(spec: FlagSpec): void {
    if (spec.managed) {
      throw new AnvilConfigurationError(
        `${spec.flag} is managed by the container integration and cannot be configured manually`,
        { flag: spec.flag },
      );
    }
  }

  private assertNoConflict(spec: FlagSpec): void {
    const other = spec.conflicts.find((flag) => this.values.has(flag));
    if (other) throw conflictError(spec, getFlagSpec(other));
  }
}

function conflictError(
  spec: FlagSpec,
  other: FlagSpec,
): AnvilConfigurationError {
  return new AnvilConfigurationError(
    `${spec.flag} (${methodsOf(spec)}) cannot be combined with ${other.flag} (${methodsOf(other)}): anvil rejects this combination. Remove one of them, or call unset("${other.flag}") first.`,
    { flag: spec.flag, relatedFlags: [other.flag] },
  );
}

/** Values starting with `-` use `--flag=value` so clap never reads them as flags. */
function renderValue(flag: AnvilFlag, value: string): string[] {
  return value.startsWith("-") ? [`${flag}=${value}`] : [flag, value];
}
