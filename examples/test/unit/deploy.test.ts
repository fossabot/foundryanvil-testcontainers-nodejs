/**
 * The fixture helpers of src/deploy.ts, against a stub client: what they
 * send and how they narrow results (the e2e workflows run them for real).
 */
import type { Address, Hash } from "viem";
import {
  allowance,
  balanceOf,
  deployFixedPriceOracle,
  deployPriceConsumer,
  deployToken,
  deployVault,
  exampleToken,
  fixedPriceOracle,
  mint,
  priceConsumer,
  quote,
  type SignerClient,
  timeLockVault,
  vaultLock,
} from "../../src";

const HASH: Hash = `0x${"ab".repeat(32)}`;
const CONTRACT = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
const ALICE: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB: Address = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

function stubClient(
  read: unknown = 7n,
  contractAddress: string | null = CONTRACT,
) {
  const client = {
    deployContract: jest.fn((_call: unknown) => Promise.resolve(HASH)),
    writeContract: jest.fn((_call: unknown) => Promise.resolve(HASH)),
    confirmTransaction: jest.fn((_call: unknown) =>
      Promise.resolve({ contractAddress }),
    ),
    readContract: jest.fn((_call: unknown) => Promise.resolve(read)),
  };
  return { client, signer: client as unknown as SignerClient };
}

describe("fixture helpers", () => {
  it("deploy artifacts and return checksummed addresses", async () => {
    const { client, signer } = stubClient();
    const token = await deployToken(signer);
    expect(token).toBe("0x5FbDB2315678afecb367f032d93F642f64180aa3");
    expect(client.deployContract).toHaveBeenCalledWith({
      abi: exampleToken.abi,
      bytecode: exampleToken.bytecode,
      args: ["Example Token", "EXT"],
    });
    expect(client.confirmTransaction).toHaveBeenCalledWith({ hash: HASH });

    await deployVault(signer, token, 60n);
    await deployPriceConsumer(signer, token);
    await deployFixedPriceOracle(signer);
    expect(client.deployContract.mock.calls.map(([call]) => call)).toEqual([
      expect.anything(),
      expect.objectContaining({ abi: timeLockVault.abi, args: [token, 60n] }),
      expect.objectContaining({ abi: priceConsumer.abi, args: [token] }),
      expect.objectContaining({ abi: fixedPriceOracle.abi, args: [] }),
    ]);
  });

  it("fail when a deployment created no contract", async () => {
    const { signer } = stubClient(0n, null);
    await expect(deployToken(signer)).rejects.toThrow(
      `${HASH} created no contract`,
    );
  });

  it("mint and wait for the receipt", async () => {
    const { client, signer } = stubClient();
    await mint(signer, CONTRACT, ALICE, 5n);
    expect(client.writeContract).toHaveBeenCalledWith({
      address: CONTRACT,
      abi: exampleToken.abi,
      functionName: "mint",
      args: [ALICE, 5n],
    });
    expect(client.confirmTransaction).toHaveBeenCalledWith({ hash: HASH });
  });

  it("narrow read results", async () => {
    const { client, signer } = stubClient();
    expect(await balanceOf(signer, CONTRACT, ALICE)).toBe(7n);
    expect(await allowance(signer, CONTRACT, ALICE, BOB)).toBe(7n);
    expect(await quote(signer, CONTRACT, 1n)).toBe(7n);
    expect(client.readContract.mock.calls.map(([call]) => call)).toEqual([
      expect.objectContaining({ functionName: "balanceOf", args: [ALICE] }),
      expect.objectContaining({
        functionName: "allowance",
        args: [ALICE, BOB],
      }),
      expect.objectContaining({ functionName: "quote", args: [1n] }),
    ]);

    const { signer: vaultReader } = stubClient([3n, 1_700_000_000n]);
    expect(await vaultLock(vaultReader, CONTRACT, ALICE)).toEqual({
      amount: 3n,
      unlockTime: 1_700_000_000n,
    });
  });
});
