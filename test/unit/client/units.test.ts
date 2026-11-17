import { durationToSeconds, timestampToSeconds } from "../../../src";

describe("units", () => {
  it("converts durations (seconds or summed unit objects)", () => {
    expect(durationToSeconds(60)).toBe(60n);
    expect(durationToSeconds(7n)).toBe(7n);
    expect(durationToSeconds({ days: 7 })).toBe(604_800n);
    expect(
      durationToSeconds({
        weeks: 1,
        days: 1,
        hours: 1,
        minutes: 1,
        seconds: 1,
      }),
    ).toBe(604_800n + 86_400n + 3_600n + 60n + 1n);
  });

  it("rejects invalid durations with the label and value", () => {
    const cases: Array<[unknown, RegExp]> = [
      [
        -1,
        /increaseTime: expected a non-negative whole number of seconds, received -1/,
      ],
      [1.5, /received 1\.5/],
      [Number.NaN, /received NaN/],
      [-1n, /received -1n/],
      ["60", /received 60/],
      [{}, /expected at least one of weeks, days, hours, minutes, seconds/],
      [{ months: 1 }, /unknown unit "months"/],
      [{ days: -1 }, /increaseTime\.days: .*received -1/],
      [{ hours: 0.5 }, /increaseTime\.hours/],
    ];
    for (const [value, message] of cases) {
      expect(() => durationToSeconds(value as never, "increaseTime")).toThrow(
        message,
      );
    }
    expect(() => durationToSeconds(null as never)).toThrow(RangeError);
  });

  it("converts timestamps (seconds, bigint or Date)", () => {
    expect(timestampToSeconds(1_700_000_000)).toBe(1_700_000_000n);
    expect(timestampToSeconds(5n)).toBe(5n);
    expect(timestampToSeconds(new Date(1_700_000_002_999))).toBe(
      1_700_000_002n,
    );
    expect(() => timestampToSeconds(new Date("nope"), "setTime")).toThrow(
      "setTime: invalid Date",
    );
    expect(() => timestampToSeconds(new Date(-5_000))).toThrow(RangeError);
    expect(() => timestampToSeconds(-1)).toThrow(/timestamp: /);
  });
});
