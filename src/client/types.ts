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
    /** A JSON number, unlike the hex-encoded fields around it. */
    chainId: number;
    gasLimit: Hex;
    gasPrice: Hex;
  };
  /** `null` fields when the node is not forking. */
  forkConfig: {
    forkUrl?: string | null;
    forkBlockNumber?: number | null;
    forkRetryBackoff?: number | null;
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

/** A transaction for `anvil_reorg` (raw or a request from an unlocked account), in new block `block` (0-based). */
export interface ReorgTransaction {
  readonly transaction: Hex | TransactionRequest;
  readonly block: number;
}
