import {
  BaseError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
} from "viem";
import { decodeRevert, expectRevert, timeLockVault } from "../../src";

/** A real viem error chain, as thrown by simulateContract / writeContract. */
function revertError(
  errorName: "StillLocked" | "NothingToWithdraw",
  args: readonly unknown[],
) {
  const reverted = new ContractFunctionRevertedError({
    abi: timeLockVault.abi,
    functionName: "withdraw",
    data: encodeErrorResult({
      abi: timeLockVault.abi,
      errorName,
      args: args,
    }),
  });
  return new ContractFunctionExecutionError(reverted, {
    abi: timeLockVault.abi,
    functionName: "withdraw",
  });
}

const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describe("revert helpers", () => {
  it("decodes a custom error from a viem error chain", () => {
    expect(decodeRevert(revertError("StillLocked", [10n, 5n]))).toMatchObject({
      errorName: "StillLocked",
      args: [10n, 5n],
    });
    expect(decodeRevert(new Error("network down"))).toBeUndefined();
    expect(decodeRevert(new BaseError("not a revert"))).toBeUndefined();
    expect(decodeRevert(undefined)).toBeUndefined();
  });

  it("expectRevert passes for the expected error and arguments", async () => {
    const error = revertError("NothingToWithdraw", [ACCOUNT]);
    await expect(
      expectRevert(Promise.reject(error), "NothingToWithdraw", [
        ACCOUNT.toLowerCase(),
      ]),
    ).resolves.toMatchObject({ errorName: "NothingToWithdraw" });
  });

  it("expectRevert explains every kind of mismatch", async () => {
    await expect(
      expectRevert(Promise.resolve(1), "StillLocked"),
    ).rejects.toThrow(
      "Expected a revert with StillLocked, but the call succeeded",
    );
    await expect(
      expectRevert(Promise.reject(new Error("timeout")), "StillLocked"),
    ).rejects.toThrow("Expected a revert with StillLocked, but got: timeout");
    await expect(
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      expectRevert(Promise.reject({ code: 1 }), "StillLocked"),
    ).rejects.toThrow(
      'Expected a revert with StillLocked, but got: {"code":1}',
    );
    await expect(
      expectRevert(
        Promise.reject(revertError("StillLocked", [1n, 0n])),
        "NothingToWithdraw",
      ),
    ).rejects.toThrow(
      "Expected a revert with NothingToWithdraw, but it reverted with StillLocked(1, 0)",
    );
    await expect(
      expectRevert(
        Promise.reject(revertError("StillLocked", [1n, 0n])),
        "StillLocked",
        [2n, 0n],
      ),
    ).rejects.toThrow("StillLocked reverted with (1, 0), expected (2, 0)");
  });
});
