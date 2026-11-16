import {
  ANVIL_EXECUTABLE,
  ANVIL_HOST,
  AnvilConfigurationError,
  AnvilFlag,
  AnvilOptions,
  DEFAULT_ACCOUNT_COUNT,
  DEFAULT_ANVIL_PORT,
  DEFAULT_CHAIN_ID,
  DEFAULT_DERIVATION_PATH,
  DEFAULT_MNEMONIC,
  Hardfork,
  LogVerbosity,
  OptionsView,
} from "../../../src";

describe("AnvilOptions", () => {
  it("starts empty, bound to all interfaces", () => {
    const options = new AnvilOptions();
    expect(options.toArgs()).toEqual(["--host", ANVIL_HOST]);
    expect(options.entryPoint).toEqual([ANVIL_EXECUTABLE, "--host", "0.0.0.0"]);
    expect(options.flags()).toEqual({});
    expect(options).toBeInstanceOf(OptionsView);
  });

  it("instances never share state (regression: shared entrypoint array)", () => {
    const a = new AnvilOptions().account.withAccounts(5);
    const b = new AnvilOptions();
    expect(a.has("--accounts")).toBe(true);
    expect(b.has("--accounts")).toBe(false);
    expect(b.toArgs()).toEqual(["--host", "0.0.0.0"]);
  });

  it("supports cross-group and in-group chaining in any order", () => {
    const options = new AnvilOptions().account
      .withAccounts(5)
      .withBalance(100)
      .evm.withChainId(1337)
      .withHardfork(Hardfork.Cancun)
      .mining.withBlockTime(1)
      .logs.verboseLogs(LogVerbosity.Two)
      .server.withPort(8546)
      .state.withTimestamp(1)
      .network.withCelo();
    expect(options.toArgs()).toEqual([
      "--host",
      "0.0.0.0",
      "--accounts",
      "5",
      "--block-time",
      "1",
      "--balance",
      "100",
      "--hardfork",
      "cancun",
      "--port",
      "8546",
      "--timestamp",
      "1",
      "-vv",
      "--chain-id",
      "1337",
      "--celo",
    ]);
  });

  it("renders the same command regardless of configuration order", () => {
    const a = new AnvilOptions().evm
      .withChainId(1)
      .account.withAccounts(2)
      .logs.quiet();
    const b = new AnvilOptions().logs
      .quiet()
      .account.withAccounts(2)
      .evm.withChainId(1);
    expect(a.toArgs()).toEqual(b.toArgs());
    expect(a.toCommand()).toBe(b.toCommand());
  });

  describe("clone", () => {
    it("creates an independent copy including file transfers and extra args", () => {
      const base = new AnvilOptions().account
        .withAccounts(3)
        .state.withState("/tmp/anvil-test/state.json")
        .withExtraArgs("--future");
      const copy = base.clone();
      expect(copy).toBeInstanceOf(AnvilOptions);
      expect(copy.toArgs()).toEqual(base.toArgs());

      copy.account.withAccounts(9).unset("--state");
      expect(base.get("--accounts")).toBe("3");
      expect(base.has("--state")).toBe(true);
      expect(base.build().fileExports).toHaveLength(1);
      expect(copy.build().fileExports).toHaveLength(0);
    });

    it("works from any group view", () => {
      const copy = new AnvilOptions().account.withAccounts(1).clone();
      expect(copy.get("--accounts")).toBe("1");
    });
  });

  describe("apply / root", () => {
    it("applies presets in order", () => {
      const fast = (o: AnvilOptions) => o.mining.withBlockTime(1);
      const rich = (o: AnvilOptions) => o.account.withBalance(1_000_000);
      const options = new AnvilOptions().apply(fast, rich);
      expect(options.get("--block-time")).toBe("1");
      expect(options.get("--balance")).toBe("1000000");
    });

    it("root() returns an AnvilOptions over the same configuration", () => {
      const group = new AnvilOptions().account.withAccounts(1);
      const root = group.root();
      expect(root).toBeInstanceOf(AnvilOptions);
      root.evm.withChainId(1);
      expect(group.has("--chain-id")).toBe(true);
    });
  });

  describe("unset", () => {
    it("removes flags and is a no-op for absent ones", () => {
      const options = new AnvilOptions().account
        .withAccounts(1)
        .evm.withChainId(1);
      options.unset("--accounts", "--chain-id", "--balance");
      expect(options.toArgs()).toEqual(["--host", "0.0.0.0"]);
    });

    it("rejects unknown and managed flags", () => {
      const options = new AnvilOptions();
      expect(() => options.unset("--nope" as AnvilFlag)).toThrow(
        /Unknown anvil flag/,
      );
      expect(() => options.unset("--host")).toThrow(AnvilConfigurationError);
    });
  });

  describe("withExtraArgs", () => {
    it("appends verbatim arguments after generated flags", () => {
      const options = new AnvilOptions()
        .withExtraArgs("--brand-new", "1")
        .account.withAccounts(2);
      expect(options.toArgs()).toEqual([
        "--host",
        "0.0.0.0",
        "--accounts",
        "2",
        "--brand-new",
        "1",
      ]);
    });

    it("refuses known flags so validation cannot be bypassed", () => {
      expect(() => new AnvilOptions().withExtraArgs("--no-mining")).toThrow(
        /configure it through the fluent API/,
      );
    });
  });

  describe("inspection", () => {
    it("has / get validate the flag name", () => {
      const options = new AnvilOptions();
      expect(() => options.has("--nope" as AnvilFlag)).toThrow(
        /Unknown anvil flag/,
      );
      expect(() => options.get("--nope" as AnvilFlag)).toThrow(
        /Unknown anvil flag/,
      );
      expect(options.has("--host")).toBe(false);
    });

    it("toCommand quotes arguments with spaces", () => {
      const options = new AnvilOptions().account
        .withMnemonic(DEFAULT_MNEMONIC)
        .fork.withForkUrl("https://x")
        .withForkHeader("User-Agent: it's me");
      expect(options.toCommand()).toBe(
        `anvil --host 0.0.0.0 --mnemonic '${DEFAULT_MNEMONIC}' --fork-url https://x --fork-header 'User-Agent: it'\\''s me'`,
      );
    });

    it("toJSON exposes command and flags", () => {
      const options = new AnvilOptions().account.withAccounts(1);
      expect(JSON.parse(JSON.stringify(options))).toEqual({
        command: ["anvil", "--host", "0.0.0.0", "--accounts", "1"],
        flags: { "--accounts": "1" },
      });
    });
  });

  describe("validate / build", () => {
    it("returns this when valid", () => {
      const options = new AnvilOptions();
      expect(options.validate()).toBe(options);
    });

    it("throws a single error for a single problem", () => {
      const options = new AnvilOptions().fork.withRetries(1);
      expect(() => options.validate()).toThrow(AnvilConfigurationError);
      try {
        options.validate();
      } catch (error) {
        expect((error as AnvilConfigurationError).flag).toBe("--retries");
      }
    });

    it("aggregates multiple problems into one numbered message", () => {
      const options = new AnvilOptions().fork
        .withRetries(1)
        .withTimeout(1)
        .mining.withMixedMining();
      expect(options.problems()).toHaveLength(3);
      try {
        options.build();
        throw new Error("expected build() to throw");
      } catch (error) {
        const configError = error as AnvilConfigurationError;
        expect(configError).toBeInstanceOf(AnvilConfigurationError);
        expect(configError.message).toMatch(/3 problems/);
        expect(configError.message).toMatch(/1\. --mixed-mining/);
        expect(configError.message).toMatch(/2\. --retries/);
        expect(configError.message).toMatch(/3\. --timeout/);
        expect(configError.relatedFlags).toEqual([
          "--mixed-mining",
          "--retries",
          "--timeout",
        ]);
      }
    });

    it("build returns a frozen configuration with defaults filled in", () => {
      const built = new AnvilOptions().build();
      expect(Object.isFrozen(built)).toBe(true);
      expect(Object.isFrozen(built.args)).toBe(true);
      expect(built).toMatchObject({
        args: ["--host", "0.0.0.0"],
        command: ["anvil", "--host", "0.0.0.0"],
        port: DEFAULT_ANVIL_PORT,
        chainId: undefined,
        accounts: DEFAULT_ACCOUNT_COUNT,
        mnemonic: DEFAULT_MNEMONIC,
        derivationPath: DEFAULT_DERIVATION_PATH,
        quiet: false,
        forking: false,
        fileImports: [],
        fileExports: [],
        flags: {},
      });
      expect(DEFAULT_CHAIN_ID).toBe(31337);
    });

    it("build reflects configured values", () => {
      const built = new AnvilOptions().account
        .withAccounts(2)
        .withDerivationPath("m/44'/60'/1'/0/")
        .evm.withChainId(10)
        .server.withPort(9000)
        .logs.quiet()
        .fork.withForkUrl("https://x")
        .build();
      expect(built).toMatchObject({
        port: 9000,
        chainId: 10,
        accounts: 2,
        derivationPath: "m/44'/60'/1'/0/",
        quiet: true,
        forking: true,
      });
      expect(built.flags["--fork-url"]).toBe("https://x");
    });

    it("build is repeatable and does not mutate the options", () => {
      const options = new AnvilOptions().account.withAccounts(2);
      expect(options.build().args).toEqual(options.build().args);
      expect(options.get("--accounts")).toBe("2");
    });
  });
});
