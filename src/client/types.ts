import type { Hex, TransactionRequest } from "viem";

/** `anvil_nodeInfo` result. */
export interface AnvilNodeInfo {
  currentBlockNumber: Hex;
  currentBlockTimestamp: number;
  currentBlockHash: Hex;
  hardFork: string;
  transactionOrder: string;
  environment: {
    baseFee: Hex;
    chainId: Hex;
    gasLimit: Hex;
    gasPrice: Hex;
  };
  forkConfig: {
    forkUrl?: string;
    forkBlockNumber?: number;
    forkRetryBackoff?: number;
  };
  [key: string]: unknown;
}

/** `anvil_metadata` result. */
export interface AnvilMetadata {
  clientVersion: string;
  chainId: number;
  instanceId: Hex;
  latestBlockNumber: number;
  latestBlockHash: Hex;
  forkedNetwork?: {
    chainId: number;
    forkBlockNumber: number;
    forkBlockHash: Hex;
  };
  snapshots: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * A transaction replayed by `anvil_reorg`: a signed raw transaction or a
 * request (sent from an unlocked / impersonated account), placed in the
 * `block`-th of the new blocks (0 = the first re-mined block).
 */
export interface ReorgTransaction {
  readonly transaction: Hex | TransactionRequest;
  readonly block: number;
}
