/**
 * Workflow: asserting reverts — decoded custom errors from simulations and
 * estimations, and reverted transactions that were actually mined.
 */
import {
  AnvilContainer,
  AnvilTransactionRevertedError,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import {
  type Address,
  type BaseError,
  decodeErrorResult,
  encodeFunctionData,
  type Hex,
  maxUint256,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deployToken, exampleToken, expectRevert, mint } from "../../src";

let token: Address;

const anvil = useAnvil(
  new AnvilContainer().withTestClient((client) => client.withAccount(0)),
  { setup: async (node) => void (token = await deployToken(node.testClient)) },
);

describe("custom errors and reverts", () => {
  it("decodes custom errors with their arguments", async () => {
    const [, alice, bob] = await anvil.addresses();
    // #region custom-error
    await expectRevert(
      anvil.testClientFor(alice).simulateContract({
        address: token,
        abi: exampleToken.abi,
        functionName: "transfer",
        args: [bob, 1n],
      }),
      "InsufficientBalance",
      [alice, 0n, 1n],
    );
    // #endregion custom-error
  });

  it("writes: local signers fail before sending, node signers are mined and revert", async () => {
    const [, mallory] = await anvil.accounts();
    // #region write-reverts
    // Locally signed: viem estimates gas first, so the revert surfaces
    // immediately, decoded, and nothing is sent.
    const local = anvil.testClientFor(privateKeyToAccount(mallory.privateKey!));
    const revert = await expectRevert(
      local.writeContract({
        address: token,
        abi: exampleToken.abi,
        functionName: "mint",
        args: [mallory.address, parseEther("1000000")],
      }),
      "NotOwner",
    );
    expect(revert.args).toEqual([mallory.address]);

    // Signed by anvil (dev/impersonated account): sent as-is, mined, reverted.
    const hash = await anvil.testClientFor(mallory.address).writeContract({
      address: token,
      abi: exampleToken.abi,
      functionName: "mint",
      args: [mallory.address, parseEther("1000000")],
    });
    await expect(anvil.confirm(hash)).rejects.toBeInstanceOf(
      AnvilTransactionRevertedError,
    );
    // #endregion write-reverts
  });

  it("reports wrong expectations clearly", async () => {
    const [, alice, bob] = await anvil.addresses();
    await expect(
      expectRevert(
        anvil.testClientFor(alice).simulateContract({
          address: token,
          abi: exampleToken.abi,
          functionName: "transfer",
          args: [bob, 1n],
        }),
        "NotOwner",
      ),
    ).rejects.toThrow(
      /Expected a revert with NotOwner, but it reverted with InsufficientBalance/,
    );
  });

  it("inspects reverted transactions that were mined", async () => {
    const [, alice, bob] = await anvil.addresses();
    // #region mined-revert
    const hash = await anvil.testClientFor(alice).writeContract({
      address: token,
      abi: exampleToken.abi,
      functionName: "transfer",
      args: [bob, 1n],
    }); // signed by anvil: mined even though it reverts

    const error = await anvil.confirm(hash).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnvilTransactionRevertedError);
    expect(
      (error as AnvilTransactionRevertedError).receipt.gasUsed,
    ).toBeGreaterThan(0n);

    // Or get the receipt without throwing:
    const receipt = await anvil.confirm(hash, { throwOnRevert: false });
    expect(receipt.status).toBe("reverted");
    // #endregion mined-revert
  });

  it("decodes panics such as arithmetic overflow", async () => {
    const [, alice] = await anvil.addresses();
    await mint(anvil.testClient, token, alice, maxUint256);
    // #region panic
    const panic = await expectRevert(
      anvil.testClient.simulateContract({
        address: token,
        abi: exampleToken.abi,
        functionName: "mint",
        args: [alice, 1n], // totalSupply would overflow uint256
      }),
      "Panic",
      [0x11n], // 0x11: arithmetic underflow or overflow
    );
    expect(panic.reason).toMatch(/overflow/);
    // #endregion panic
  });

  it("decodes raw revert data from a low-level call", async () => {
    const [, alice, bob] = await anvil.addresses();
    // #region raw-revert
    const error = (await anvil.testClient
      .call({
        account: alice,
        to: token,
        data: encodeFunctionData({
          abi: exampleToken.abi,
          functionName: "transfer",
          args: [bob, 1n],
        }),
      })
      .catch((e: unknown) => e)) as BaseError;

    // The raw revert bytes sit on one error of the chain.
    const data = (
      error.walk((e) => typeof (e as { data?: unknown }).data === "string") as {
        data?: Hex;
      } | null
    )?.data;
    const decoded = decodeErrorResult({
      abi: exampleToken.abi,
      data: data!,
    });
    expect(decoded.errorName).toBe("InsufficientBalance");
    expect(decoded.args).toEqual([alice, 0n, 1n]);
    // #endregion raw-revert
  });
});
