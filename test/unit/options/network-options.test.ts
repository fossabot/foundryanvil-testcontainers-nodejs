import { AnvilOptions, NETWORK_FLAGS, NetworkOptions } from "../../../src";

describe("NetworkOptions", () => {
  let options: AnvilOptions;

  beforeEach(() => {
    options = new AnvilOptions();
  });

  it("is reachable from any view", () => {
    expect(options.network).toBeInstanceOf(NetworkOptions);
    expect(options.state.network.withCelo()).toBeInstanceOf(NetworkOptions);
  });

  it("withOptimism toggles --optimism", () => {
    options.network.withOptimism();
    expect(options.toArgs()).toEqual(["--host", "0.0.0.0", "--optimism"]);
    options.network.withOptimism(false);
    expect(options.has("--optimism")).toBe(false);
    expect(() => options.network.withOptimism(1 as unknown as boolean)).toThrow(
      /expected a boolean/,
    );
  });

  it("withCelo toggles --celo", () => {
    options.network.withCelo();
    expect(options.toArgs()).toEqual(["--host", "0.0.0.0", "--celo"]);
    options.network.withCelo(false);
    expect(options.has("--celo")).toBe(false);
  });

  it("optimism and celo are mutually exclusive in both orders", () => {
    options.network.withOptimism();
    expect(() => options.network.withCelo()).toThrow(
      /cannot be combined with --optimism/,
    );
    options.network.withOptimism(false).withCelo();
    expect(() => options.network.withOptimism()).toThrow(
      /cannot be combined with --celo/,
    );
  });

  it("reset removes every network flag", () => {
    options.network.withCelo().account.withAccounts(1);
    options.network.reset();
    for (const flag of NETWORK_FLAGS) expect(options.has(flag)).toBe(false);
    expect(options.has("--accounts")).toBe(true);
  });
});
