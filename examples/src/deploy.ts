/**
 * Fixture helpers: deploy the example contracts with any test client that
 * has a default account, and read their state with typed results.
 *
 * JSON ABIs are typed as viem's generic `Abi`, so viem cannot infer return
 * types from them; these helpers narrow the results once, so tests stay
 * free of casts.
 */
import type { AnvilTestClient } from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import { type Account, type Address, getAddress } from "viem";
import {
  type ContractArtifact,
  exampleToken,
  fixedPriceOracle,
  priceConsumer,
  timeLockVault,
} from "./artifacts";

/** A test client that signs with a default account. */
export type SignerClient = AnvilTestClient<Account>;
/** Any test client (reads need no account). */
export type ReaderClient = AnvilTestClient<Account | undefined>;

// #region deploy-helper
/**
 * Deploys an artifact and returns the new contract's checksummed address
 * (receipts carry it lowercase; contract reads return checksummed addresses).
 */
export async function deployContract(
  client: SignerClient,
  artifact: ContractArtifact,
  args: readonly unknown[] = [],
): Promise<Address> {
  const hash = await client.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args,
  });
  const { contractAddress } = await client.confirmTransaction({ hash });
  if (!contractAddress) throw new Error(`${hash} created no contract`);
  return getAddress(contractAddress);
}
// #endregion deploy-helper

/** Deploys ExampleToken; the client's account is its owner. */
export function deployToken(
  client: SignerClient,
  name = "Example Token",
  symbol = "EXT",
): Promise<Address> {
  return deployContract(client, exampleToken, [name, symbol]);
}

/** Deploys a TimeLockVault for `token`. */
export function deployVault(
  client: SignerClient,
  token: Address,
  lockDurationSeconds: bigint,
): Promise<Address> {
  return deployContract(client, timeLockVault, [token, lockDurationSeconds]);
}

/** Deploys a PriceConsumer reading `oracle`. */
export function deployPriceConsumer(
  client: SignerClient,
  oracle: Address,
): Promise<Address> {
  return deployContract(client, priceConsumer, [oracle]);
}

/** Deploys a FixedPriceOracle (e.g. to copy its runtime code elsewhere). */
export function deployFixedPriceOracle(client: SignerClient): Promise<Address> {
  return deployContract(client, fixedPriceOracle);
}

/** Mints `amount` of `token` to `to` (the client's account must own the token). */
export async function mint(
  client: SignerClient,
  token: Address,
  to: Address,
  amount: bigint,
): Promise<void> {
  await client.confirmTransaction({
    hash: await client.writeContract({
      address: token,
      abi: exampleToken.abi,
      functionName: "mint",
      args: [to, amount],
    }),
  });
}

/** ERC-20 balance of `account`. */
export async function balanceOf(
  client: ReaderClient,
  token: Address,
  account: Address,
): Promise<bigint> {
  return (await client.readContract({
    address: token,
    abi: exampleToken.abi,
    functionName: "balanceOf",
    args: [account],
  })) as bigint;
}

/** ERC-20 allowance of `spender` over `owner`'s tokens. */
export async function allowance(
  client: ReaderClient,
  token: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  return (await client.readContract({
    address: token,
    abi: exampleToken.abi,
    functionName: "allowance",
    args: [owner, spender],
  })) as bigint;
}

/** A TimeLockVault deposit: locked amount and unlock time (unix seconds). */
export async function vaultLock(
  client: ReaderClient,
  vault: Address,
  account: Address,
): Promise<{ amount: bigint; unlockTime: bigint }> {
  const [amount, unlockTime] = (await client.readContract({
    address: vault,
    abi: timeLockVault.abi,
    functionName: "locks",
    args: [account],
  })) as readonly [bigint, bigint];
  return { amount, unlockTime };
}

/** PriceConsumer quote: USD value (8 decimals) of `amount` tokens. */
export async function quote(
  client: ReaderClient,
  consumer: Address,
  amount: bigint,
): Promise<bigint> {
  return (await client.readContract({
    address: consumer,
    abi: priceConsumer.abi,
    functionName: "quote",
    args: [amount],
  })) as bigint;
}
