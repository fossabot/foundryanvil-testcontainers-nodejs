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
} from "viem";
import {
  call,
  getTransaction,
  getTransactionReceipt,
  waitForTransactionReceipt,
} from "viem/actions";
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
 * anvil-specific actions added to the test client (viem style: one object
 * argument). They cover anvil RPC methods viem does not wrap and replace two
 * viem test actions with stricter versions:
 *
 * - `reset()` without arguments resets a non-forked node to genesis (viem's
 *   version fails there) and re-forks a forked node at its fork block (a
 *   bare `anvil_reset` would detach it from the fork);
 * - `revert()` throws when the snapshot does not exist (viem ignores
 *   anvil's `false`, so the test would silently continue on dirty state).
 */
export type AnvilActions = {
  /** Adds wei to a balance (`anvil_addBalance`). */
  addBalance(args: { address: Address; value: bigint }): Promise<void>;
  /**
   * Sets the ERC-20 balance of `address` (`anvil_dealERC20`); works for
   * standard tokens by locating the balance storage slot.
   */
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
  /**
   * Changes the chain id (`anvil_setChainId`). The container's test client,
   * `chain` and `chainId` follow automatically; clients you built yourself
   * need a new `chain`.
   */
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
  /**
   * Replaces the last `depth` blocks with new ones, optionally containing
   * `transactions` (`anvil_reorg`).
   */
  reorg(args: {
    depth: number;
    transactions?: readonly ReorgTransaction[];
  }): Promise<void>;
  /** `anvil_nodeInfo`. */
  getNodeInfo(): Promise<AnvilNodeInfo>;
  /** `anvil_metadata`. */
  getMetadata(): Promise<AnvilMetadata>;
  /**
   * `anvil_reset`. Without arguments: a non-forked node returns to genesis,
   * a forked node re-forks at its current fork block (read from
   * `anvil_nodeInfo`; a bare `anvil_reset` would detach it from the fork).
   * `{ blockNumber }` re-forks a forked node at another block, `{ jsonRpcUrl }`
   * (re-)forks from a URL. Discards local changes and all snapshots.
   */
  reset(args?: AnvilResetParameters): Promise<void>;
  /**
   * `evm_revert`, strict: throws {@link AnvilTestClientError}
   * `SNAPSHOT_NOT_FOUND` when the snapshot does not exist.
   */
  revert(args: { id: Hex }): Promise<void>;
  /**
   * Waits for a receipt, mining a block first when automine is off (so
   * tests never hang on `--no-mining`). Throws
   * {@link AnvilTransactionRevertedError} (with the revert reason when
   * recoverable) unless `throwOnRevert: false`.
   */
  confirmTransaction(
    args: ConfirmTransactionParameters,
  ): Promise<TransactionReceipt>;
};

/** @internal Hooks used by the container's own client. */
export interface AnvilActionHooks {
  /** Called after `anvil_setChainId` succeeded. */
  onChainIdChanged?(chainId: number): void;
  /** Called after `anvil_reset` succeeded. */
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

/** @internal */
export async function confirmTransaction(
  client: AnyClient,
  {
    hash,
    throwOnRevert = true,
    timeout = 30_000,
  }: ConfirmTransactionParameters,
): Promise<TransactionReceipt> {
  let receipt = await getTransactionReceipt(client, { hash }).catch(
    (error: unknown) => {
      // Pending (or unknown) transactions have no receipt yet; rethrow the rest.
      if (error instanceof TransactionReceiptNotFoundError) return undefined;
      throw error;
    },
  );
  if (!receipt) {
    const automine = await request<boolean>(client, "anvil_getAutomine").catch(
      () => true,
    );
    if (!automine) await request(client, "anvil_mine", [numberToHex(1)]);
    receipt = await waitForTransactionReceipt(client, { hash, timeout });
  }
  if (receipt.status === "reverted" && throwOnRevert) {
    throw new AnvilTransactionRevertedError(
      receipt,
      await revertReason(client, receipt),
    );
  }
  return receipt;
}

/** @internal {@link anvilActions} with hooks for the container's own client. */
export function createAnvilActions(hooks: AnvilActionHooks = {}) {
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
      hooks.onChainIdChanged?.(chainId);
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
      await hooks.onReset?.();
    },
    revert: ({ id }) => strictRevert(client, id),
    confirmTransaction: (args) => confirmTransaction(client, args),
  });
}

/**
 * viem decorator adding {@link AnvilActions} to any client, e.g. one you
 * build yourself: `createTestClient({ mode: "anvil", … }).extend(anvilActions)`.
 * The container's `testClient` already includes it.
 */
export const anvilActions: (client: AnyClient) => AnvilActions =
  createAnvilActions();
