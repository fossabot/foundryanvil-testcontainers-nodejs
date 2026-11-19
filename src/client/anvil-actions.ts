import {
  type Account,
  type Address,
  type Chain,
  type Client,
  formatTransactionRequest,
  type Hash,
  type Hex,
  numberToHex,
  type TransactionReceipt,
  TransactionReceiptNotFoundError,
  type Transport,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import { call, getTransaction, getTransactionReceipt } from "viem/actions";
import {
  AnvilTestClientError,
  AnvilTransactionRevertedError,
  errorReason,
} from "../errors";
import type { AnvilMetadata, AnvilNodeInfo, ReorgTransaction } from "./types";
import { type Timestamp, timestampToSeconds } from "./units";

/** Parameters of {@link AnvilActions.reset}. */
export interface AnvilResetParameters {
  /** Block to fork from; requires a forked node or `jsonRpcUrl`. */
  readonly blockNumber?: bigint | number;
  /** RPC URL to (re-)fork from. */
  readonly jsonRpcUrl?: string;
}

/** Parameters of {@link AnvilActions.confirmTransaction}. */
export interface ConfirmTransactionParameters {
  /** Transaction to confirm. */
  readonly hash: Hash;
  /** Throw {@link AnvilTransactionRevertedError} for reverted transactions (default `true`). */
  readonly throwOnRevert?: boolean;
  /** Receipt timeout in ms (default 30 000). */
  readonly timeout?: number;
}

/**
 * anvil RPC methods viem doesn't wrap, plus fixed `reset()` and strict
 * `revert()` replacing viem's versions.
 */
export type AnvilActions = {
  /** Adds wei to a balance (`anvil_addBalance`). */
  addBalance(args: { address: Address; value: bigint }): Promise<void>;
  /** Sets the ERC-20 balance of `address` of a standard token (`anvil_dealERC20`). */
  dealErc20(args: {
    token: Address;
    address: Address;
    amount: bigint;
  }): Promise<void>;
  /** Sets an ERC-20 allowance (`anvil_setERC20Allowance`). */
  setErc20Allowance(args: {
    token: Address;
    owner: Address;
    spender: Address;
    amount: bigint;
  }): Promise<void>;
  /** Changes the chain id (`anvil_setChainId`); the container's clients follow, your own need a new `chain`. */
  setChainId(args: { chainId: number }): Promise<void>;
  /** Sets the current time; following blocks continue from it (`evm_setTime`). */
  setTime(args: { timestamp: Timestamp }): Promise<void>;
  /** Interval-mining period in seconds, `undefined` when off (`anvil_getIntervalMining`). */
  getIntervalMining(): Promise<number | undefined>;
  /** Toggles impersonation of every sender (`anvil_autoImpersonateAccount`). */
  setAutoImpersonate(enabled: boolean): Promise<void>;
  /** Removes every pending transaction (`anvil_dropAllTransactions`). */
  dropAllTransactions(): Promise<void>;
  /** Removes the pending transactions of a sender (`anvil_removePoolTransactions`). */
  removePoolTransactions(args: { address: Address }): Promise<void>;
  /** Removes the last `depth` blocks (default 1) (`anvil_rollback`). */
  rollback(args?: { depth?: number }): Promise<void>;
  /** Replaces the last `depth` blocks, optionally with `transactions` (`anvil_reorg`). */
  reorg(args: {
    depth: number;
    transactions?: readonly ReorgTransaction[];
  }): Promise<void>;
  /** `anvil_nodeInfo`. */
  getNodeInfo(): Promise<AnvilNodeInfo>;
  /** `anvil_metadata`. */
  getMetadata(): Promise<AnvilMetadata>;
  /**
   * Back to genesis, or to the fork block on a fork (a bare `anvil_reset` would
   * detach it); `{ blockNumber }` / `{ jsonRpcUrl }` re-fork. Discards all snapshots.
   */
  reset(args?: AnvilResetParameters): Promise<void>;
  /**
   * Strict `evm_revert`.
   * @throws AnvilTestClientError `SNAPSHOT_NOT_FOUND` for unknown or used snapshots
   */
  revert(args: { id: Hex }): Promise<void>;
  /**
   * Receipt of a transaction; mines a block when automine is off.
   * @throws AnvilTransactionRevertedError when it reverted (unless `throwOnRevert: false`)
   */
  confirmTransaction(
    args: ConfirmTransactionParameters,
  ): Promise<TransactionReceipt>;
};

/** @internal Called by the container clients' transport after a request succeeded. */
export interface AnvilActionHooks {
  /** Called after `anvil_setChainId` succeeded. */
  onChainIdChanged?(chainId: number): void;
  /** Called after `anvil_reset` succeeded (it may re-fork another chain). */
  onReset?(): Promise<void>;
}

type AnyClient = Client<Transport, Chain | undefined, Account | undefined>;

function request<T>(
  client: AnyClient,
  method: string,
  params: readonly unknown[] = [],
): Promise<T> {
  return client.request<{ Method: string; Parameters: unknown; ReturnType: T }>(
    { method, params },
  );
}

function positiveInteger(label: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(
      `${label}: expected a positive integer, received ${String(value)}`,
    );
  }
  return value;
}

/** `true` for `evm_revert` failures meaning "no such snapshot". */
function isMissingSnapshot(error: unknown): boolean {
  for (
    let current: unknown = error;
    current;
    current = (current as { cause?: unknown }).cause
  ) {
    if ((current as { code?: unknown }).code === -32001) return true;
  }
  return false;
}

/** @internal Strict `evm_revert`. */
export async function strictRevert(client: AnyClient, id: Hex): Promise<void> {
  let reverted: unknown;
  try {
    reverted = await request(client, "evm_revert", [id]);
  } catch (error: unknown) {
    if (!isMissingSnapshot(error)) throw error;
    reverted = false;
  }
  if (reverted === false) {
    throw new AnvilTestClientError(
      "SNAPSHOT_NOT_FOUND",
      `evm_revert(${id}) failed: the snapshot does not exist. A snapshot can be reverted to only once ` +
        "(use checkpoint() to restore repeatedly) and reset() / loadState() discard all snapshots.",
    );
  }
}

async function revertReason(
  client: AnyClient,
  receipt: TransactionReceipt,
): Promise<string | undefined> {
  try {
    const tx = await getTransaction(client, { hash: receipt.transactionHash });
    await call(client, {
      account: tx.from,
      to: tx.to ?? undefined,
      data: tx.input,
      value: tx.value,
      gas: tx.gas,
      blockNumber: receipt.blockNumber > 0n ? receipt.blockNumber - 1n : 0n,
    });
    return undefined;
  } catch (error: unknown) {
    return errorReason(error);
  }
}

/** `eth_getTransactionReceipt`, or `undefined` while the transaction is not mined. */
async function findReceipt(
  client: AnyClient,
  hash: Hash,
): Promise<TransactionReceipt | undefined> {
  try {
    return await getTransactionReceipt(client, { hash });
  } catch (error: unknown) {
    // Pending (or unknown) transactions have no receipt yet; rethrow the rest.
    if (error instanceof TransactionReceiptNotFoundError) return undefined;
    throw error;
  }
}

/** First delay between receipt polls; doubles up to the client's polling interval. */
const FIRST_RECEIPT_POLL_MS = 1;

/**
 * @internal anvil returns an automined hash just before the block is committed:
 * re-read the receipt at once, then with a short backoff (not viem's block watcher).
 */
export async function confirmTransaction(
  client: AnyClient,
  {
    hash,
    throwOnRevert = true,
    timeout = 30_000,
  }: ConfirmTransactionParameters,
): Promise<TransactionReceipt> {
  const deadline = Date.now() + timeout;
  let receipt = await findReceipt(client, hash);
  if (!receipt) {
    const [again, automine] = await Promise.all([
      findReceipt(client, hash),
      request<boolean>(client, "anvil_getAutomine").catch(() => true),
    ]);
    receipt = again;
    if (!receipt && !automine) {
      await request(client, "anvil_mine", [numberToHex(1)]);
    }
    const maxDelay = Math.max(FIRST_RECEIPT_POLL_MS, client.pollingInterval);
    for (let delay = FIRST_RECEIPT_POLL_MS; !receipt;) {
      receipt = await findReceipt(client, hash);
      if (receipt) break;
      if (Date.now() + delay > deadline) {
        throw new WaitForTransactionReceiptTimeoutError({ hash });
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, maxDelay);
    }
  }
  if (receipt.status === "reverted" && throwOnRevert) {
    throw new AnvilTransactionRevertedError(
      receipt,
      await revertReason(client, receipt),
    );
  }
  return receipt;
}

/** @internal The {@link anvilActions} implementation. */
export function createAnvilActions() {
  return (client: AnyClient): AnvilActions => ({
    addBalance: async ({ address, value }) => {
      await request(client, "anvil_addBalance", [address, numberToHex(value)]);
    },
    dealErc20: async ({ token, address, amount }) => {
      await request(client, "anvil_dealERC20", [
        address,
        token,
        numberToHex(amount),
      ]);
    },
    setErc20Allowance: async ({ token, owner, spender, amount }) => {
      await request(client, "anvil_setERC20Allowance", [
        owner,
        spender,
        token,
        numberToHex(amount),
      ]);
    },
    setChainId: async ({ chainId }) => {
      await request(client, "anvil_setChainId", [
        positiveInteger("setChainId", chainId),
      ]);
    },
    setTime: async ({ timestamp }) => {
      await request(client, "evm_setTime", [
        numberToHex(timestampToSeconds(timestamp, "setTime")),
      ]);
    },
    getIntervalMining: async () =>
      (await request<number | null>(client, "anvil_getIntervalMining")) ??
      undefined,
    setAutoImpersonate: async (enabled) => {
      await request(client, "anvil_autoImpersonateAccount", [enabled]);
    },
    dropAllTransactions: async () => {
      await request(client, "anvil_dropAllTransactions");
    },
    removePoolTransactions: async ({ address }) => {
      await request(client, "anvil_removePoolTransactions", [address]);
    },
    rollback: async ({ depth } = {}) => {
      await request(client, "anvil_rollback", [
        depth === undefined ? null : positiveInteger("rollback.depth", depth),
      ]);
    },
    reorg: async ({ depth, transactions = [] }) => {
      await request(client, "anvil_reorg", [
        positiveInteger("reorg.depth", depth),
        transactions.map(({ transaction, block }) => [
          typeof transaction === "string"
            ? transaction
            : formatTransactionRequest(transaction),
          block,
        ]),
      ]);
    },
    getNodeInfo: () => request<AnvilNodeInfo>(client, "anvil_nodeInfo"),
    getMetadata: () => request<AnvilMetadata>(client, "anvil_metadata"),
    reset: async ({ blockNumber, jsonRpcUrl } = {}) => {
      const forking: Record<string, unknown> = {};
      if (jsonRpcUrl !== undefined) forking.jsonRpcUrl = jsonRpcUrl;
      if (blockNumber !== undefined) forking.blockNumber = Number(blockNumber);
      if (jsonRpcUrl === undefined && blockNumber === undefined) {
        // `anvil_reset []` would detach a forked node from its fork (block 0,
        // no fork, stale state): re-fork at the current fork block instead.
        const { forkConfig } = await request<AnvilNodeInfo>(
          client,
          "anvil_nodeInfo",
        );
        if (forkConfig?.forkUrl) {
          forking.jsonRpcUrl = forkConfig.forkUrl;
          if (typeof forkConfig.forkBlockNumber === "number") {
            forking.blockNumber = forkConfig.forkBlockNumber;
          }
        }
      }
      await request(
        client,
        "anvil_reset",
        Object.keys(forking).length === 0 ? [] : [{ forking }],
      );
    },
    revert: ({ id }) => strictRevert(client, id),
    confirmTransaction: (args) => confirmTransaction(client, args),
  });
}

/**
 * Adds {@link AnvilActions} to your own viem clients: `client.extend(anvilActions)`.
 * @see {@link https://hella-labs.github.io/foundryanvil-testcontainers-nodejs/docs/reference/anvil-actions | anvil extras reference} (docs)
 */
export const anvilActions: (client: AnyClient) => AnvilActions =
  createAnvilActions();
