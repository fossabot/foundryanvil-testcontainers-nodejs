import {
  AnvilConfigurationError,
  AnvilOptions,
  EVM_FLAGS,
  EvmOptions,
  Hardfork,
  OpHardfork,
} from "../../../src";

describe("EvmOptions", () => {
  let options: AnvilOptions;

  beforeEach(() => {
    options = new AnvilOptions();
  });

  it("is reachable from any view", () => {
    expect(options.evm).toBeInstanceOf(EvmOptions);
    expect(options.account.evm.withChainId(1)).toBeInstanceOf(EvmOptions);
  });

  describe("withHardfork", () => {
    it("accepts every Ethereum hardfork", () => {
      for (const hardfork of Object.values(Hardfork)) {
        if (hardfork === Hardfork.Latest) continue;
        options.evm.withHardfork(hardfork);
        expect(options.get("--hardfork")).toBe(hardfork);
        expect(options.problems()).toEqual([]);
      }
    });

    it("Hardfork.Latest restores anvil's default by removing the flag (anvil rejects 'latest')", () => {
      options.evm.withHardfork(Hardfork.Cancun).withHardfork(Hardfork.Latest);
      expect(options.has("--hardfork")).toBe(false);
      expect(options.toArgs()).toEqual(["--host", "0.0.0.0"]);
      options.network.withOptimism().evm.withHardfork(Hardfork.Latest);
      expect(options.problems()).toEqual([]);
    });

    it("accepts every Optimism hardfork when --optimism is enabled", () => {
      options.network.withOptimism();
      for (const hardfork of Object.values(OpHardfork)) {
        options.evm.withHardfork(hardfork);
        expect(options.problems()).toEqual([]);
      }
    });

    it("rejects Optimism hardforks without --optimism at validation time", () => {
      options.evm.withHardfork(OpHardfork.Ecotone);
      expect(() => options.validate()).toThrow(/requires --optimism/);
      options.network.withOptimism();
      expect(() => options.validate()).not.toThrow();
    });

    it("rejects Ethereum hardforks with --optimism at validation time", () => {
      options.network.withOptimism().evm.withHardfork(Hardfork.Cancun);
      expect(() => options.build()).toThrow(
        /cannot be combined with --optimism/,
      );
      options.network.withOptimism(false);
      expect(() => options.build()).not.toThrow();
    });

    it("rejects unknown names", () => {
      expect(() => options.evm.withHardfork("foo" as Hardfork)).toThrow(
        /unknown hardfork "foo"/,
      );
    });
  });

  describe("numeric setters", () => {
    it.each([
      ["withChainId", "--chain-id", 1337, "1337"],
      [
        "withBlockBaseFeePerGas",
        "--block-base-fee-per-gas",
        1_000_000_000n,
        "1000000000",
      ],
      ["withGasPrice", "--gas-price", 20_000_000_000n, "20000000000"],
      ["withGasLimit", "--gas-limit", 30_000_000, "30000000"],
      ["withCodeSizeLimit", "--code-size-limit", 0x10000, "65536"],
      ["withMemoryLimit", "--memory-limit", 134217728, "134217728"],
    ] as const)("%s sets %s", (method, flag, value, rendered) => {
      (options.evm[method] as (v: number | bigint) => unknown)(value);
      expect(options.get(flag)).toBe(rendered);
      expect(options.toArgs()).toContain(flag);
    });

    it("rejects invalid numbers", () => {
      expect(() => options.evm.withChainId(0)).toThrow(/between 1 and/);
      expect(() => options.evm.withChainId(-1)).toThrow(
        AnvilConfigurationError,
      );
      expect(() => options.evm.withGasLimit(1.1)).toThrow(
        AnvilConfigurationError,
      );
      expect(() => options.evm.withGasPrice(-1n)).toThrow(
        AnvilConfigurationError,
      );
      expect(() => options.evm.withGasPrice(2n ** 128n)).toThrow(
        AnvilConfigurationError,
      );
      expect(() => options.evm.withCodeSizeLimit(NaN)).toThrow(
        AnvilConfigurationError,
      );
      expect(() => options.evm.withMemoryLimit(Infinity)).toThrow(
        AnvilConfigurationError,
      );
    });

    it("accepts u128 gas prices", () => {
      options.evm.withGasPrice(2n ** 128n - 1n);
      expect(options.get("--gas-price")).toBe(
        "340282366920938463463374607431768211455",
      );
    });
  });

  describe("boolean switches", () => {
    it.each([
      ["autoImpersonate", "--auto-impersonate"],
      ["disableBlockGasLimit", "--disable-block-gas-limit"],
      ["disableCodeSizeLimit", "--disable-code-size-limit"],
      ["disableMinPriorityFee", "--disable-min-priority-fee"],
      ["disableDefaultCreate2Deployer", "--disable-default-create2-deployer"],
      ["disablePoolBalanceChecks", "--disable-pool-balance-checks"],
      ["withPrintTraces", "--print-traces"],
      ["withStepsTracing", "--steps-tracing"],
    ] as const)("%s toggles %s", (method, flag) => {
      const toggle = options.evm[method].bind(options.evm) as (
        enabled?: boolean,
      ) => unknown;
      toggle();
      expect(options.has(flag)).toBe(true);
      expect(options.toArgs()).toContain(flag);
      toggle(false);
      expect(options.has(flag)).toBe(false);
      expect(() => toggle("x" as unknown as boolean)).toThrow(
        /expected a boolean/,
      );
    });
  });

  describe("conflicts", () => {
    it("gas limit vs disable block gas limit", () => {
      options.evm.withGasLimit(1);
      expect(() => options.evm.disableBlockGasLimit()).toThrow(
        /cannot be combined/,
      );
      options.unset("--gas-limit").evm.disableBlockGasLimit();
      expect(() => options.evm.withGasLimit(1)).toThrow(/cannot be combined/);
      // Disabling the toggle never conflicts.
      expect(() => options.evm.disableBlockGasLimit(false)).not.toThrow();
    });

    it("code size limit vs disable code size limit", () => {
      options.evm.withCodeSizeLimit(1);
      expect(() => options.evm.disableCodeSizeLimit()).toThrow(
        /cannot be combined/,
      );
    });
  });

  it("build exposes the static chain id", () => {
    expect(options.build().chainId).toBeUndefined();
    options.evm.withChainId(1337);
    expect(options.build().chainId).toBe(1337);
  });

  it("reset removes every evm flag", () => {
    options.evm
      .withChainId(1)
      .withHardfork(Hardfork.Paris)
      .withGasLimit(1)
      .withPrintTraces()
      .account.withAccounts(1);
    options.evm.reset();
    for (const flag of EVM_FLAGS) expect(options.has(flag)).toBe(false);
    expect(options.has("--accounts")).toBe(true);
  });
});
