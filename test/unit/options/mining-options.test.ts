import {
  AnvilConfigurationError,
  AnvilOptions,
  MINING_FLAGS,
  MiningOptions,
} from "../../../src";

describe("MiningOptions", () => {
  let options: AnvilOptions;

  beforeEach(() => {
    options = new AnvilOptions();
  });

  it("is reachable from any view", () => {
    expect(options.mining).toBeInstanceOf(MiningOptions);
    expect(options.logs.mining.withBlockTime(1)).toBeInstanceOf(MiningOptions);
  });

  describe("withBlockTime", () => {
    it("sets --block-time and accepts fractional seconds", () => {
      options.mining.withBlockTime(1);
      expect(options.get("--block-time")).toBe("1");
      options.mining.withBlockTime(0.5);
      expect(options.get("--block-time")).toBe("0.5");
      options.mining.withBlockTime(2n);
      expect(options.get("--block-time")).toBe("2");
    });

    it("rejects non-positive values", () => {
      expect(() => options.mining.withBlockTime(0)).toThrow(/positive/);
      expect(() => options.mining.withBlockTime(-1)).toThrow(
        AnvilConfigurationError,
      );
      expect(() => options.mining.withBlockTime(0n)).toThrow(/positive/);
      expect(() => options.mining.withBlockTime(NaN)).toThrow(
        AnvilConfigurationError,
      );
      expect(() =>
        options.mining.withBlockTime("1" as unknown as number),
      ).toThrow(AnvilConfigurationError);
    });
  });

  describe("mining modes are mutually exclusive", () => {
    it("interval then on-demand throws", () => {
      options.mining.withBlockTime(1);
      expect(() => options.mining.withNoMining()).toThrow(
        /cannot be combined with --block-time/,
      );
    });

    it("on-demand then interval throws", () => {
      options.mining.withNoMining();
      expect(() => options.mining.withBlockTime(1)).toThrow(
        /cannot be combined with --no-mining/,
      );
    });

    it("withAutoMining restores the default mode", () => {
      options.mining.withBlockTime(1).withMixedMining();
      options.mining.withAutoMining();
      expect(options.has("--block-time")).toBe(false);
      expect(options.has("--mixed-mining")).toBe(false);
      options.mining.withNoMining().withAutoMining();
      expect(options.has("--no-mining")).toBe(false);
      expect(options.toArgs()).toEqual(["--host", "0.0.0.0"]);
    });
  });

  describe("withMixedMining", () => {
    it("requires a block time at validation time, regardless of order", () => {
      options.mining.withMixedMining();
      expect(() => options.validate()).toThrow(
        /--mixed-mining .* requires --block-time/,
      );
      options.mining.withBlockTime(1);
      expect(() => options.validate()).not.toThrow();
      expect(options.toArgs()).toEqual([
        "--host",
        "0.0.0.0",
        "--block-time",
        "1",
        "--mixed-mining",
      ]);
    });

    it("can be disabled", () => {
      options.mining.withBlockTime(1).withMixedMining().withMixedMining(false);
      expect(options.has("--mixed-mining")).toBe(false);
    });
  });

  describe("genesis number / slots", () => {
    it("withBlockNumber sets --number", () => {
      options.mining.withBlockNumber(100);
      expect(options.get("--number")).toBe("100");
      expect(() => options.mining.withBlockNumber(-1)).toThrow(
        AnvilConfigurationError,
      );
    });

    it("withSlotsInAnEpoch sets --slots-in-an-epoch", () => {
      options.mining.withSlotsInAnEpoch(1);
      expect(options.get("--slots-in-an-epoch")).toBe("1");
      expect(() => options.mining.withSlotsInAnEpoch(0)).toThrow(
        AnvilConfigurationError,
      );
    });
  });

  it("reset removes every mining flag", () => {
    options.mining
      .withBlockTime(1)
      .withMixedMining()
      .withBlockNumber(1)
      .withSlotsInAnEpoch(2);
    options.account.withAccounts(1);
    options.mining.reset();
    for (const flag of MINING_FLAGS) expect(options.has(flag)).toBe(false);
    expect(options.has("--accounts")).toBe(true);
  });
});
