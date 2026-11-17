import type { TransactionReceipt } from "viem";
import {
  AnvilConfigurationError,
  AnvilStartupError,
  AnvilTestClientConfigurationError,
  AnvilTestClientError,
  AnvilTransactionRevertedError,
  containerPath,
  isContainerPath,
} from "../../src";
import { errorReason } from "../../src/errors";

describe("errors & small types", () => {
  it("AnvilConfigurationError carries flag metadata", () => {
    const error = new AnvilConfigurationError("msg");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AnvilConfigurationError");
    expect(error.flag).toBeUndefined();
    expect(error.relatedFlags).toEqual([]);
    const detailed = new AnvilConfigurationError("msg", {
      flag: "--accounts",
      relatedFlags: ["--balance"],
    });
    expect(detailed.flag).toBe("--accounts");
    expect(detailed.relatedFlags).toEqual(["--balance"]);
  });

  it("AnvilStartupError carries the command, logs and cause", () => {
    const cause = new Error("root");
    const error = new AnvilStartupError("boom", {
      command: ["anvil", "-q"],
      logs: "log",
      cause,
    });
    expect(error.name).toBe("AnvilStartupError");
    expect(error.command).toEqual(["anvil", "-q"]);
    expect(error.logs).toBe("log");
    expect(error.cause).toBe(cause);
  });

  it("AnvilTestClientConfigurationError is a configuration error naming the setting", () => {
    const error = new AnvilTestClientConfigurationError("withAccount", "bad", {
      flag: "--accounts",
      relatedFlags: ["--accounts"],
    });
    expect(error).toBeInstanceOf(AnvilConfigurationError);
    expect(error.name).toBe("AnvilTestClientConfigurationError");
    expect(error.message).toBe("TestClientOptions.withAccount(): bad");
    expect(error.setting).toBe("withAccount");
    expect(error.flag).toBe("--accounts");
    expect(
      new AnvilTestClientConfigurationError("x", "y").relatedFlags,
    ).toEqual([]);
  });

  it("AnvilTestClientError carries a code and cause", () => {
    const cause = new Error("root");
    const error = new AnvilTestClientError("NOT_STARTED", "msg", { cause });
    expect(error.name).toBe("AnvilTestClientError");
    expect(error.code).toBe("NOT_STARTED");
    expect(error.cause).toBe(cause);
    expect(new AnvilTestClientError("CHEAT_FAILED", "m").cause).toBeUndefined();
  });

  it("AnvilTransactionRevertedError carries the receipt and reason", () => {
    const receipt = {
      transactionHash: "0xabc",
      blockNumber: 7n,
      status: "reverted",
    } as unknown as TransactionReceipt;
    const error = new AnvilTransactionRevertedError(receipt, "nope");
    expect(error).toBeInstanceOf(AnvilTestClientError);
    expect(error.name).toBe("AnvilTransactionRevertedError");
    expect(error.code).toBe("TRANSACTION_REVERTED");
    expect(error.hash).toBe("0xabc");
    expect(error.receipt).toBe(receipt);
    expect(error.reason).toBe("nope");
    expect(error.message).toBe(
      "Transaction 0xabc reverted in block 7: nope. Pass { throwOnRevert: false } to get the receipt instead.",
    );
  });

  it("errorReason() combines viem's short message with the node's details", () => {
    expect(
      errorReason({
        shortMessage: "Invalid parameters.\nMore",
        details: "why",
      }),
    ).toBe("Invalid parameters: why");
    expect(
      errorReason({ shortMessage: "Reverted: why.", details: "why" }),
    ).toBe("Reverted: why");
    expect(errorReason({ shortMessage: "Short." })).toBe("Short");
    expect(errorReason(new Error("plain"))).toBe("plain");
    expect(errorReason("text")).toBe("text");
    expect(errorReason(undefined)).toBe("undefined");
  });

  it("containerPath / isContainerPath", () => {
    expect(containerPath("/x")).toEqual({ containerPath: "/x" });
    expect(isContainerPath({ containerPath: "/x" })).toBe(true);
    expect(isContainerPath("/x")).toBe(false);
    expect(isContainerPath(null)).toBe(false);
    expect(isContainerPath({})).toBe(false);
    expect(() => containerPath(1 as unknown as string)).toThrow(TypeError);
  });
});
