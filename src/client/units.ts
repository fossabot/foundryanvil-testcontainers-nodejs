/**
 * A span of time: seconds (`number` / `bigint`) or a unit object such as
 * `{ days: 7, hours: 12 }` (units are summed).
 * @example await anvil.increaseTime({ days: 7 })
 */
export type Duration =
  | number
  | bigint
  | {
      readonly weeks?: number;
      readonly days?: number;
      readonly hours?: number;
      readonly minutes?: number;
      readonly seconds?: number;
    };

/** A point in time: unix seconds (`number` / `bigint`) or a `Date`. */
export type Timestamp = number | bigint | Date;

const UNIT_SECONDS = {
  weeks: 604_800,
  days: 86_400,
  hours: 3_600,
  minutes: 60,
  seconds: 1,
} as const;

function describe(value: unknown): string {
  if (typeof value === "bigint") return `${value}n`;
  if (value instanceof Date) return `Date(${String(value.getTime())})`;
  return typeof value === "object" && value !== null
    ? JSON.stringify(value)
    : String(value);
}

function wholeSeconds(label: string, value: unknown): bigint {
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new RangeError(
        `${label}: expected a non-negative number of seconds, received ${describe(value)}`,
      );
    }
    return value;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `${label}: expected a non-negative whole number of seconds, received ${describe(value)}`,
    );
  }
  return BigInt(value);
}

/**
 * Converts a {@link Duration} to whole seconds.
 * @throws RangeError for negative, fractional or unknown units.
 */
export function durationToSeconds(
  duration: Duration,
  label = "duration",
): bigint {
  if (typeof duration !== "object" || duration === null) {
    return wholeSeconds(label, duration);
  }
  const entries = Object.entries(duration);
  if (entries.length === 0) {
    throw new RangeError(
      `${label}: expected at least one of ${Object.keys(UNIT_SECONDS).join(", ")}`,
    );
  }
  let total = 0n;
  for (const [unit, amount] of entries) {
    const factor = UNIT_SECONDS[unit as keyof typeof UNIT_SECONDS];
    if (factor === undefined) {
      throw new RangeError(
        `${label}: unknown unit "${unit}"; expected ${Object.keys(UNIT_SECONDS).join(", ")}`,
      );
    }
    total += wholeSeconds(`${label}.${unit}`, amount) * BigInt(factor);
  }
  return total;
}

/**
 * Converts a {@link Timestamp} to unix seconds (a `Date` is floored).
 * @throws RangeError for negative, fractional or invalid values.
 */
export function timestampToSeconds(
  timestamp: Timestamp,
  label = "timestamp",
): bigint {
  if (timestamp instanceof Date) {
    const ms = timestamp.getTime();
    if (Number.isNaN(ms)) throw new RangeError(`${label}: invalid Date`);
    return wholeSeconds(label, Math.floor(ms / 1000));
  }
  return wholeSeconds(label, timestamp);
}
