/**
 * Contract artifacts: creation bytecode (`.bin`) and ABI (`.json`) per
 * contract in `artifacts/<Name>/`, the same layout Foundry and Hardhat
 * outputs can be copied into. They are loaded with the library's
 * `loadContractAbi` / `loadContractBytecode`.
 */
import * as path from "node:path";
import {
  loadContractAbi,
  loadContractBytecode,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import type { Abi, Hex } from "viem";

/** `examples/artifacts`, independent of the working directory. */
export const ARTIFACTS_DIR = path.resolve(__dirname, "..", "artifacts");

/** ABI and creation bytecode of one contract. */
export interface ContractArtifact {
  readonly name: string;
  readonly abi: Abi;
  readonly bytecode: Hex;
}

// #region load-artifact
/** Loads `artifacts/<name>/<name>.json` and `.bin`. */
export function loadArtifact(name: string): ContractArtifact {
  return {
    name,
    abi: loadContractAbi(`${name}/${name}.json`, ARTIFACTS_DIR),
    bytecode: loadContractBytecode(`${name}/${name}.bin`, ARTIFACTS_DIR),
  };
}
// #endregion load-artifact

/** ERC-20 with `mint` (owner only) and custom errors `NotOwner`, `InsufficientBalance`, `InsufficientAllowance`. */
export const exampleToken = loadArtifact("ExampleToken");
/** Locks ERC-20 deposits for a duration; custom errors `StillLocked`, `NothingToWithdraw`. */
export const timeLockVault = loadArtifact("TimeLockVault");
/** Quotes amounts in USD from an oracle's `latestPrice()`; custom error `PriceUnavailable`. */
export const priceConsumer = loadArtifact("PriceConsumer");
/** Test-double oracle: `latestPrice()` returns storage slot 0. */
export const fixedPriceOracle = loadArtifact("FixedPriceOracle");

/**
 * Deploys 24,577 bytes of runtime code: one byte over the EIP-170 limit
 * (`PUSH2 0x6001 PUSH1 0 RETURN`), for code-size-limit examples.
 */
export const oversizedContract = loadArtifact("OversizedContract");

/** Every artifact, by contract name. */
export const ARTIFACTS: readonly ContractArtifact[] = [
  exampleToken,
  timeLockVault,
  priceConsumer,
  fixedPriceOracle,
  oversizedContract,
];
