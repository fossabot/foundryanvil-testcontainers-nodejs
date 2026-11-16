import { AnvilConfigurationError } from "../../../src";
import {
  booleanArg,
  derivationPathArg,
  enumArg,
  forkUrlArg,
  headerArg,
  hexArg,
  integerArg,
  mnemonicArg,
  portArg,
  positiveNumberArg,
  stringArg,
  timestampArg,
  U128_MAX,
  U64_MAX,
} from "../../../src/options/validators";

const F = "--accounts";

describe("validators", () => {
  it("integerArg", () => {
    expect(integerArg(F, 5)).toBe("5");
    expect(integerArg(F, 5n)).toBe("5");
    expect(integerArg(F, U64_MAX)).toBe(U64_MAX.toString());
    expect(integerArg(F, -5, { min: -10n })).toBe("-5");
    expect(() => integerArg(F, U64_MAX + 1n)).toThrow(AnvilConfigurationError);
    expect(() => integerArg(F, 1.5)).toThrow(
      /expected an integer, received 1.5/,
    );
    expect(() => integerArg(F, "5")).toThrow(
      /expected a number or bigint, received "5"/,
    );
    expect(() => integerArg(F, null)).toThrow(/received null/);
    expect(() => integerArg(F, 2 ** 53)).toThrow(/safe integer range/);
    expect(() => integerArg(F, 7n, { max: 6n })).toThrow(/received 7n/);
    expect(U128_MAX).toBe(2n ** 128n - 1n);
  });

  it("positiveNumberArg", () => {
    expect(positiveNumberArg(F, 0.25)).toBe("0.25");
    expect(positiveNumberArg(F, 3n)).toBe("3");
    expect(() => positiveNumberArg(F, 0)).toThrow(/positive finite number/);
    expect(() => positiveNumberArg(F, -0.1)).toThrow(AnvilConfigurationError);
    expect(() => positiveNumberArg(F, Infinity)).toThrow(
      AnvilConfigurationError,
    );
    expect(() => positiveNumberArg(F, -1n)).toThrow(/received -1n/);
    expect(() => positiveNumberArg(F, "1")).toThrow(AnvilConfigurationError);
  });

  it("stringArg trims", () => {
    expect(stringArg(F, "  x ")).toBe("x");
    expect(() => stringArg(F, "   ")).toThrow(/non-empty string for the value/);
    expect(() => stringArg(F, 1, "thing")).toThrow(/for the thing, received 1/);
  });

  it("enumArg", () => {
    enum Sample {
      A = "a",
      B = "b",
    }
    expect(enumArg(F, "a", Sample, "sample")).toBe("a");
    expect(() => enumArg(F, "c", Sample, "sample")).toThrow(
      /unknown sample "c"; expected one of a, b/,
    );
    expect(() => enumArg(F, 1, Sample, "sample")).toThrow(
      AnvilConfigurationError,
    );
  });

  it("booleanArg", () => {
    expect(booleanArg(F, true)).toBe(true);
    expect(booleanArg(F, false)).toBe(false);
    expect(() => booleanArg(F, "true")).toThrow(/expected a boolean/);
  });

  it("hexArg", () => {
    const hash = `0x${"00".repeat(32)}`;
    expect(hexArg(F, hash, 32, "hash")).toBe(hash);
    expect(() => hexArg(F, hash.slice(0, -2), 32, "hash")).toThrow(
      /32-byte hex hash/,
    );
    expect(() => hexArg(F, hash.replace("0x", ""), 32, "hash")).toThrow(
      AnvilConfigurationError,
    );
    expect(() => hexArg(F, 5, 32, "hash")).toThrow(AnvilConfigurationError);
  });

  it("derivationPathArg", () => {
    expect(derivationPathArg(F, "m/44'/60'/0'/0/")).toBe("m/44'/60'/0'/0/");
    expect(derivationPathArg(F, "m/0")).toBe("m/0");
    expect(() => derivationPathArg(F, "m")).toThrow(AnvilConfigurationError);
    expect(() => derivationPathArg(F, "m//0")).toThrow(AnvilConfigurationError);
  });

  it("mnemonicArg", () => {
    const words = Array.from({ length: 15 }, () => "word").join("  ");
    expect(mnemonicArg(F, words).split(" ")).toHaveLength(15);
    expect(() => mnemonicArg(F, "a b")).toThrow(/received 2/);
  });

  it("headerArg", () => {
    expect(headerArg(F, "A: b")).toBe("A: b");
    expect(headerArg(F, "A:b")).toBe("A:b");
    expect(() => headerArg(F, "A")).toThrow(/Name: value/);
    expect(() => headerArg(F, ":A")).toThrow(/Name: value/);
    expect(() => headerArg(F, "A: b\n")).not.toThrow(); // trimmed first
    expect(() => headerArg(F, "A: b\nC: d")).toThrow(/Name: value/);
  });

  it("forkUrlArg", () => {
    expect(forkUrlArg(F, "https://x@5")).toEqual({
      url: "https://x",
      blockNumber: "5",
    });
    expect(forkUrlArg(F, "https://x@-5")).toEqual({
      url: "https://x",
      blockNumber: "-5",
    });
    expect(forkUrlArg(F, "https://u:p@x")).toEqual({
      url: "https://u:p@x",
      blockNumber: undefined,
    });
    expect(forkUrlArg(F, "/tmp/x.ipc")).toEqual({
      url: "/tmp/x.ipc",
      blockNumber: undefined,
    });
    expect(forkUrlArg(F, "localhost:8545@1")).toEqual({
      url: "localhost:8545",
      blockNumber: "1",
    });
    expect(() => forkUrlArg(F, "localhost")).toThrow(AnvilConfigurationError);
    expect(() => forkUrlArg(F, "file:///x")).toThrow(
      /unsupported fork URL scheme "file:"/,
    );
  });

  it("portArg", () => {
    expect(portArg(F, 8545)).toBe(8545);
    expect(portArg(F, 1n)).toBe(1);
    expect(() => portArg(F, 0)).toThrow(AnvilConfigurationError);
    expect(() => portArg(F, 70000)).toThrow(AnvilConfigurationError);
  });

  it("timestampArg", () => {
    expect(timestampArg(F, 10)).toBe("10");
    expect(timestampArg(F, 10n)).toBe("10");
    expect(timestampArg(F, new Date(1_000))).toBe("1");
    expect(timestampArg(F, new Date(1_999))).toBe("1");
    expect(() => timestampArg(F, new Date(NaN))).toThrow(/invalid Date/);
    expect(() => timestampArg(F, -1)).toThrow(AnvilConfigurationError);
  });
});
