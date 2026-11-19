import { AnvilConfigurationError } from "../errors";
import { AnvilFlag, getFlagSpec } from "../flags/registry";

/** Largest Rust `u64`. */
export const U64_MAX = 18446744073709551615n;

/** Largest Rust `u128`. */
export const U128_MAX = 340282366920938463463374607431768211455n;

/** Numeric input accepted by numeric setters. */
export type Integerish = number | bigint;

/** Word counts allowed by BIP-39. */
export const MNEMONIC_WORD_COUNTS: readonly number[] = Object.freeze([
  12, 15, 18, 21, 24,
]);

/** Throws, prefixed with the method(s) and flag: `account.withAccounts() (--accounts): …`. */
export function fail(flag: AnvilFlag, reason: string): never {
  const methods = getFlagSpec(flag).methods.join(" / ");
  throw new AnvilConfigurationError(`${methods} (${flag}): ${reason}`, {
    flag,
  });
}

function show(value: unknown): string {
  if (typeof value === "bigint") return `${value}n`;
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

/** Validates an integer in `[min, max]` (default `[0, u64::MAX]`); returns it as a decimal string. */
export function integerArg(
  flag: AnvilFlag,
  value: unknown,
  { min = 0n, max = U64_MAX }: { min?: bigint; max?: bigint } = {},
): string {
  let big: bigint;
  if (typeof value === "bigint") {
    big = value;
  } else if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      fail(flag, `expected an integer, received ${show(value)}`);
    }
    if (!Number.isSafeInteger(value)) {
      fail(
        flag,
        `${show(value)} is outside the safe integer range – pass a bigint instead`,
      );
    }
    big = BigInt(value);
  } else {
    fail(flag, `expected a number or bigint, received ${show(value)}`);
  }
  if (big < min || big > max) {
    fail(
      flag,
      `expected an integer between ${min} and ${max}, received ${show(value)}`,
    );
  }
  return big.toString();
}

/** Validates a finite number > 0; returns its decimal string. */
export function positiveNumberArg(flag: AnvilFlag, value: unknown): string {
  const ok =
    typeof value === "bigint"
      ? value > 0n
      : typeof value === "number" && Number.isFinite(value) && value > 0;
  if (!ok)
    fail(flag, `expected a positive finite number, received ${show(value)}`);
  return String(value);
}

/** Validates a non-empty string; returns it trimmed. */
export function stringArg(
  flag: AnvilFlag,
  value: unknown,
  label = "value",
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(
      flag,
      `expected a non-empty string for the ${label}, received ${show(value)}`,
    );
  }
  return value.trim();
}

/** Validates membership of a string enum. */
export function enumArg<T extends string>(
  flag: AnvilFlag,
  value: unknown,
  enumObject: Record<string, T>,
  label: string,
): T {
  const allowed = Object.values(enumObject);
  if (!allowed.includes(value as T)) {
    fail(
      flag,
      `unknown ${label} ${show(value)}; expected one of ${allowed.join(", ")}`,
    );
  }
  return value as T;
}

/** Validates a boolean. */
export function booleanArg(flag: AnvilFlag, value: unknown): boolean {
  if (typeof value !== "boolean") {
    fail(flag, `expected a boolean, received ${show(value)}`);
  }
  return value;
}

/** Validates a `0x`-prefixed hex string of `bytes` bytes. */
export function hexArg(
  flag: AnvilFlag,
  value: unknown,
  bytes: number,
  label: string,
): `0x${string}` {
  if (
    typeof value !== "string" ||
    !new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(value)
  ) {
    fail(
      flag,
      `expected a 0x-prefixed ${bytes}-byte hex ${label}, received ${show(value)}`,
    );
  }
  return value as `0x${string}`;
}

/** Validates a BIP-44 style derivation path such as `m/44'/60'/0'/0/`. */
export function derivationPathArg(flag: AnvilFlag, value: unknown): string {
  const path = stringArg(flag, value, "derivation path");
  if (!/^m(\/\d+'?)+\/?$/.test(path)) {
    fail(
      flag,
      `expected a derivation path like "m/44'/60'/0'/0/", received ${show(value)}`,
    );
  }
  return path;
}

/** Validates a BIP-39 word count (anvil validates the words); normalises whitespace. */
export function mnemonicArg(flag: AnvilFlag, value: unknown): string {
  const words = stringArg(flag, value, "mnemonic").split(/\s+/);
  if (!MNEMONIC_WORD_COUNTS.includes(words.length)) {
    fail(
      flag,
      `a BIP-39 mnemonic must have ${MNEMONIC_WORD_COUNTS.join(", ")} words, received ${words.length}`,
    );
  }
  return words.join(" ");
}

/** Validates an HTTP header line `Name: value`. */
export function headerArg(flag: AnvilFlag, value: unknown): string {
  const header = stringArg(flag, value, "header");
  if (header.indexOf(":") <= 0 || /[\r\n]/.test(header)) {
    fail(
      flag,
      `expected a header in the form "Name: value", received ${show(value)}`,
    );
  }
  return header;
}

/**
 * Validates a fork URL: `http(s)`/`ws(s)` URL, `localhost:PORT` or absolute
 * IPC path. Splits anvil's `url@block` shorthand.
 */
export function forkUrlArg(
  flag: AnvilFlag,
  value: unknown,
): { url: string; blockNumber?: string } {
  const raw = stringArg(flag, value, "fork URL");
  const suffix = /^(.*)@(-?\d+)$/.exec(raw);
  const url = suffix ? suffix[1] : raw;
  const result = { url, blockNumber: suffix?.[2] };
  if (url.startsWith("/") || /^localhost:\d{1,5}(\/.*)?$/.test(url))
    return result;
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    fail(
      flag,
      `expected an http(s)/ws(s) URL, "localhost:PORT" or an absolute IPC path, received ${show(value)}`,
    );
  }
  if (!["http:", "https:", "ws:", "wss:"].includes(protocol)) {
    fail(
      flag,
      `unsupported fork URL scheme "${protocol}" in ${show(value)}; expected http, https, ws or wss`,
    );
  }
  return result;
}

/** Validates a TCP port (1–65535). */
export function portArg(flag: AnvilFlag, value: unknown): number {
  return Number(integerArg(flag, value, { min: 1n, max: 65535n }));
}

/** Validates a unix timestamp in seconds (number/bigint) or a `Date`. */
export function timestampArg(flag: AnvilFlag, value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) fail(flag, "received an invalid Date");
    return integerArg(flag, Math.floor(value.getTime() / 1000));
  }
  return integerArg(flag, value);
}
