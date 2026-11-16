import {
  ACCOUNT_FLAGS,
  AccountOptions,
  AnvilConfigurationError,
  AnvilOptions,
  DEFAULT_MNEMONIC,
} from "../../../src";

describe("AccountOptions", () => {
  let options: AnvilOptions;

  beforeEach(() => {
    options = new AnvilOptions();
  });

  it("is reachable from any view and returns itself for chaining", () => {
    const group = options.account;
    expect(group).toBeInstanceOf(AccountOptions);
    expect(group.withAccounts(1)).toBeInstanceOf(AccountOptions);
    expect(options.evm.account).toBeInstanceOf(AccountOptions);
    // A group is a full AnvilOptions view.
    const asOptions: AnvilOptions = options.account.withAccounts(2);
    expect(asOptions.toArgs()).toContain("--accounts");
  });

  describe("withAccounts", () => {
    it("sets --accounts", () => {
      options.account.withAccounts(5);
      expect(options.get("--accounts")).toBe("5");
      expect(options.toArgs()).toEqual([
        "--host",
        "0.0.0.0",
        "--accounts",
        "5",
      ]);
    });

    it("accepts bigint and zero", () => {
      options.account.withAccounts(0n);
      expect(options.get("--accounts")).toBe("0");
    });

    it("rejects invalid values", () => {
      expect(() => options.account.withAccounts(-1)).toThrow(
        AnvilConfigurationError,
      );
      expect(() => options.account.withAccounts(1.5)).toThrow(
        /expected an integer/,
      );
      expect(() =>
        options.account.withAccounts("5" as unknown as number),
      ).toThrow(/expected a number or bigint/);
      expect(() => options.account.withAccounts(2n ** 64n)).toThrow(
        /between 0 and/,
      );
      expect(() =>
        options.account.withAccounts(Number.MAX_SAFE_INTEGER + 2),
      ).toThrow(/safe integer range/);
    });
  });

  describe("withBalance", () => {
    it("sets --balance in whole Ether", () => {
      options.account.withBalance(1_000);
      expect(options.get("--balance")).toBe("1000");
    });

    it("rejects fractional Ether (anvil only accepts u64)", () => {
      expect(() => options.account.withBalance(1.5)).toThrow(
        AnvilConfigurationError,
      );
    });
  });

  describe("withDerivationPath", () => {
    it("accepts BIP-44 style paths", () => {
      options.account.withDerivationPath("m/44'/60'/1'/0/");
      expect(options.get("--derivation-path")).toBe("m/44'/60'/1'/0/");
      options.account.withDerivationPath("m/44'/60'/0'/0");
      expect(options.get("--derivation-path")).toBe("m/44'/60'/0'/0");
    });

    it("rejects malformed paths", () => {
      expect(() => options.account.withDerivationPath("")).toThrow(
        /non-empty string/,
      );
      expect(() => options.account.withDerivationPath("44/60")).toThrow(
        /derivation path like/,
      );
      expect(() => options.account.withDerivationPath("m/abc")).toThrow(
        AnvilConfigurationError,
      );
    });
  });

  describe("mnemonic sources", () => {
    it("withMnemonic normalises whitespace and validates the word count", () => {
      options.account.withMnemonic(
        `  ${DEFAULT_MNEMONIC.replace(/ /g, "   ")}  `,
      );
      expect(options.get("--mnemonic")).toBe(DEFAULT_MNEMONIC);
      expect(() => options.account.withMnemonic("one two three")).toThrow(
        /12, 15, 18, 21, 24 words, received 3/,
      );
      expect(() => options.account.withMnemonic("")).toThrow(
        AnvilConfigurationError,
      );
    });

    it("withRandomMnemonic supports the bare and valued forms", () => {
      options.account.withRandomMnemonic();
      expect(options.get("--mnemonic-random")).toBeNull();
      expect(options.toArgs()).toContain("--mnemonic-random");
      options.account.withRandomMnemonic(24);
      expect(options.toArgs()).toContain("--mnemonic-random=24");
    });

    it("withRandomMnemonic rejects invalid word counts", () => {
      expect(() => options.account.withRandomMnemonic(13)).toThrow(
        /word count must be one of 12, 15, 18, 21, 24/,
      );
      expect(() => options.account.withRandomMnemonic(-1)).toThrow(
        AnvilConfigurationError,
      );
    });

    it("withMnemonicSeedUnsafe requires a u64 seed", () => {
      options.account.withMnemonicSeedUnsafe(42);
      expect(options.get("--mnemonic-seed-unsafe")).toBe("42");
      options.account.withMnemonicSeedUnsafe(2n ** 64n - 1n);
      expect(options.get("--mnemonic-seed-unsafe")).toBe(
        "18446744073709551615",
      );
      expect(() =>
        options.account.withMnemonicSeedUnsafe("seed" as unknown as number),
      ).toThrow(AnvilConfigurationError);
      expect(() => options.account.withMnemonicSeedUnsafe(2n ** 64n)).toThrow(
        AnvilConfigurationError,
      );
    });

    it.each([
      ["withMnemonic", "withRandomMnemonic"],
      ["withMnemonic", "withMnemonicSeedUnsafe"],
      ["withRandomMnemonic", "withMnemonicSeedUnsafe"],
      ["withRandomMnemonic", "withMnemonic"],
      ["withMnemonicSeedUnsafe", "withMnemonic"],
      ["withMnemonicSeedUnsafe", "withRandomMnemonic"],
    ])("rejects %s followed by %s", (first, second) => {
      const call = (name: string) => {
        if (name === "withMnemonic")
          options.account.withMnemonic(DEFAULT_MNEMONIC);
        if (name === "withRandomMnemonic") options.account.withRandomMnemonic();
        if (name === "withMnemonicSeedUnsafe")
          options.account.withMnemonicSeedUnsafe(1);
      };
      call(first);
      expect(() => call(second)).toThrow(/cannot be combined with/);
    });

    it("can switch mnemonic source after unset()", () => {
      options.account.withMnemonic(DEFAULT_MNEMONIC);
      options.unset("--mnemonic").account.withRandomMnemonic();
      expect(options.has("--mnemonic")).toBe(false);
      expect(options.has("--mnemonic-random")).toBe(true);
    });
  });

  describe("autoImpersonate", () => {
    it("toggles --auto-impersonate", () => {
      options.account.autoImpersonate();
      expect(options.has("--auto-impersonate")).toBe(true);
      options.account.autoImpersonate(false);
      expect(options.has("--auto-impersonate")).toBe(false);
      expect(() =>
        options.account.autoImpersonate("yes" as unknown as boolean),
      ).toThrow(/expected a boolean/);
    });
  });

  describe("reset", () => {
    it("removes every account flag and nothing else", () => {
      options.account
        .withAccounts(1)
        .withBalance(2)
        .withDerivationPath("m/44'/60'/0'/0/")
        .withRandomMnemonic()
        .autoImpersonate()
        .evm.withChainId(5);
      options.account.reset();
      for (const flag of ACCOUNT_FLAGS) expect(options.has(flag)).toBe(false);
      expect(options.has("--chain-id")).toBe(true);
    });
  });

  describe("build", () => {
    it("exposes the mnemonic / derivation path used for key derivation", () => {
      expect(options.build().mnemonic).toBe(DEFAULT_MNEMONIC);
      expect(options.build().derivationPath).toBe("m/44'/60'/0'/0/");
      expect(options.build().accounts).toBe(10);

      options.account.withMnemonic(DEFAULT_MNEMONIC).withAccounts(3);
      expect(options.build().accounts).toBe(3);
      expect(options.build().mnemonic).toBe(DEFAULT_MNEMONIC);

      options.unset("--mnemonic").account.withRandomMnemonic();
      expect(options.build().mnemonic).toBeUndefined();

      options.unset("--mnemonic-random").account.withMnemonicSeedUnsafe(1);
      expect(options.build().mnemonic).toBeUndefined();
    });
  });
});
