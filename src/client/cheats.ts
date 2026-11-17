import {
  type Account,
  type Address,
  type Hash,
  type Hex,
  numberToHex,
  parseEther,
} from "viem";
import { AnvilTestClientError, errorReason } from "../errors";
import type { AnvilResetParameters } from "./anvil-actions";
import type { AnvilTestClient } from "./test-client";
import {
  type Duration,
  durationToSeconds,
  type Timestamp,
  timestampToSeconds,
} from "./units";

type Step<TAccount extends Account | undefined> = {
  readonly label: string;
  readonly run: (client: AnvilTestClient<TAccount>) => Promise<unknown>;
};

function format(value: unknown): string {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value, (_, v: unknown) =>
      typeof v === "bigint" ? `${v}n` : v,
    );
  }
  return String(value);
}

function seconds(label: string, value: Duration): number {
  return Number(durationToSeconds(value, label));
}

/**
 * A fluent, awaitable chain of node manipulations ("cheats") that runs in
 * order when awaited. Every viem test action that changes state has a step,
 * plus the anvil extras (ERC-20 dealing, chain id, time, rollback…).
 *
 * Steps are queued, not executed, until the chain is awaited (or `run()`);
 * a failing step rejects with {@link AnvilTestClientError} `CHEAT_FAILED`
 * naming the step, and later steps are skipped. A chain runs once.
 *
 * @example
 * await anvil.cheats
 *   .setBalanceEther(whale, 1_000)
 *   .impersonate(whale)
 *   .increaseTime({ days: 7 })
 *   .mine();
 */
export class AnvilCheats<
  TAccount extends Account | undefined = undefined,
> implements PromiseLike<void> {
  private readonly steps: Step<TAccount>[] = [];
  private execution?: Promise<void>;

  /** @internal Use `StartedAnvilContainer.cheats`. */
  constructor(private readonly client: AnvilTestClient<TAccount>) {}

  /** Labels of the queued steps, e.g. `["mine(1)"]`. */
  public get plan(): readonly string[] {
    return this.steps.map((step) => step.label);
  }

  // ------------------------------------------------- accounts and balances

  /** Balance in wei (`anvil_setBalance`). */
  public setBalance(address: Address, wei: bigint): this {
    return this.add("setBalance", [address, wei], (c) =>
      c.setBalance({ address, value: wei }),
    );
  }

  /** Balance in Ether, e.g. `"1.5"` or `100`. */
  public setBalanceEther(address: Address, ether: string | number): this {
    const value = parseEther(String(ether));
    return this.add("setBalanceEther", [address, ether], (c) =>
      c.setBalance({ address, value }),
    );
  }

  /** Adds wei to a balance (`anvil_addBalance`). */
  public addBalance(address: Address, wei: bigint): this {
    return this.add("addBalance", [address, wei], (c) =>
      c.addBalance({ address, value: wei }),
    );
  }

  /** ERC-20 balance of `address` in token units (`anvil_dealERC20`). */
  public dealErc20(token: Address, address: Address, amount: bigint): this {
    return this.add("dealErc20", [token, address, amount], (c) =>
      c.dealErc20({ token, address, amount }),
    );
  }

  /** ERC-20 allowance (`anvil_setERC20Allowance`). */
  public setErc20Allowance(
    token: Address,
    owner: Address,
    spender: Address,
    amount: bigint,
  ): this {
    return this.add("setErc20Allowance", [token, owner, spender, amount], (c) =>
      c.setErc20Allowance({ token, owner, spender, amount }),
    );
  }

  /** Runtime bytecode of an address (`anvil_setCode`); `"0x"` removes it. */
  public setCode(address: Address, bytecode: Hex): this {
    return this.add("setCode", [address, bytecode], (c) =>
      c.setCode({ address, bytecode }),
    );
  }

  /** Account nonce (`anvil_setNonce`). */
  public setNonce(address: Address, nonce: number): this {
    return this.add("setNonce", [address, nonce], (c) =>
      c.setNonce({ address, nonce }),
    );
  }

  /**
   * One storage slot (`anvil_setStorageAt`). `value` is a 32-byte word; a
   * `bigint` is encoded for you.
   */
  public setStorageAt(
    address: Address,
    slot: number | Hex,
    value: Hex | bigint,
  ): this {
    const word =
      typeof value === "bigint" ? numberToHex(value, { size: 32 }) : value;
    return this.add("setStorageAt", [address, slot, value], (c) =>
      c.setStorageAt({ address, index: slot, value: word }),
    );
  }

  /** Sends from `address` without its key (`anvil_impersonateAccount`). */
  public impersonate(address: Address): this {
    return this.add("impersonate", [address], (c) =>
      c.impersonateAccount({ address }),
    );
  }

  /** `anvil_stopImpersonatingAccount`. */
  public stopImpersonating(address: Address): this {
    return this.add("stopImpersonating", [address], (c) =>
      c.stopImpersonatingAccount({ address }),
    );
  }

  /** Impersonates every sender (`anvil_autoImpersonateAccount`). */
  public setAutoImpersonate(enabled: boolean): this {
    return this.add("setAutoImpersonate", [enabled], (c) =>
      c.setAutoImpersonate(enabled),
    );
  }

  // ----------------------------------------------------------------- mining

  /** Mines `blocks` (default 1), optionally `interval` apart (`anvil_mine`). */
  public mine(blocks = 1, interval?: Duration): this {
    const args = interval === undefined ? [blocks] : [blocks, interval];
    const gap = interval === undefined ? undefined : seconds("mine", interval);
    return this.add("mine", args, (c) => c.mine({ blocks, interval: gap }));
  }

  /** Mine on every transaction or not (`evm_setAutomine`). */
  public setAutomine(enabled: boolean): this {
    return this.add("setAutomine", [enabled], (c) => c.setAutomine(enabled));
  }

  /** Interval mining; `0` disables it (`evm_setIntervalMining`). */
  public setIntervalMining(interval: Duration): this {
    const period = seconds("setIntervalMining", interval);
    return this.add("setIntervalMining", [interval], (c) =>
      c.setIntervalMining({ interval: period }),
    );
  }

  // ------------------------------------------------------------------- time

  /** Moves time forward for the next block (`evm_increaseTime`). */
  public increaseTime(duration: Duration): this {
    const delta = seconds("increaseTime", duration);
    return this.add("increaseTime", [duration], (c) =>
      c.increaseTime({ seconds: delta }),
    );
  }

  /** Timestamp of the next block (`evm_setNextBlockTimestamp`). */
  public setNextBlockTimestamp(timestamp: Timestamp): this {
    const at = timestampToSeconds(timestamp, "setNextBlockTimestamp");
    return this.add("setNextBlockTimestamp", [timestamp], (c) =>
      c.setNextBlockTimestamp({ timestamp: at }),
    );
  }

  /** Sets the clock; later blocks continue from it (`evm_setTime`). */
  public setTime(timestamp: Timestamp): this {
    const at = timestampToSeconds(timestamp, "setTime");
    return this.add("setTime", [timestamp], (c) =>
      c.setTime({ timestamp: at }),
    );
  }

  /** Fixed timestamp step between blocks (`anvil_setBlockTimestampInterval`). */
  public setBlockTimestampInterval(interval: Duration): this {
    const step = seconds("setBlockTimestampInterval", interval);
    return this.add("setBlockTimestampInterval", [interval], (c) =>
      c.setBlockTimestampInterval({ interval: step }),
    );
  }

  /** `anvil_removeBlockTimestampInterval`. */
  public removeBlockTimestampInterval(): this {
    return this.add("removeBlockTimestampInterval", [], (c) =>
      c.removeBlockTimestampInterval(),
    );
  }

  // --------------------------------------------------------- block and fees

  /** Coinbase of the next blocks (`anvil_setCoinbase`). */
  public setCoinbase(address: Address): this {
    return this.add("setCoinbase", [address], (c) =>
      c.setCoinbase({ address }),
    );
  }

  /** Gas price the node suggests (`eth_gasPrice`) in wei (`anvil_setMinGasPrice`; pre-London hardforks only). */
  public setMinGasPrice(wei: bigint): this {
    return this.add("setMinGasPrice", [wei], (c) =>
      c.setMinGasPrice({ gasPrice: wei }),
    );
  }

  /** Base fee of the next block in wei (`anvil_setNextBlockBaseFeePerGas`). */
  public setNextBlockBaseFeePerGas(wei: bigint): this {
    return this.add("setNextBlockBaseFeePerGas", [wei], (c) =>
      c.setNextBlockBaseFeePerGas({ baseFeePerGas: wei }),
    );
  }

  /** Block gas limit (`evm_setBlockGasLimit`). */
  public setBlockGasLimit(gasLimit: bigint): this {
    return this.add("setBlockGasLimit", [gasLimit], (c) =>
      c.setBlockGasLimit({ gasLimit }),
    );
  }

  // --------------------------------------------------------- mempool (txpool)

  /** Removes a pending transaction (`anvil_dropTransaction`). */
  public dropTransaction(hash: Hash): this {
    return this.add("dropTransaction", [hash], (c) =>
      c.dropTransaction({ hash }),
    );
  }

  /** Removes every pending transaction (`anvil_dropAllTransactions`). */
  public dropAllTransactions(): this {
    return this.add("dropAllTransactions", [], (c) => c.dropAllTransactions());
  }

  /** Removes the pending transactions of a sender (`anvil_removePoolTransactions`). */
  public removePoolTransactions(address: Address): this {
    return this.add("removePoolTransactions", [address], (c) =>
      c.removePoolTransactions({ address }),
    );
  }

  // ------------------------------------------------------- chain, node, state

  /** Chain id (`anvil_setChainId`); the container's client follows. */
  public setChainId(chainId: number): this {
    return this.add("setChainId", [chainId], (c) => c.setChainId({ chainId }));
  }

  /** Fork RPC URL (`anvil_setRpcUrl`). */
  public setRpcUrl(url: string): this {
    return this.add("setRpcUrl", [url], (c) => c.setRpcUrl(url));
  }

  /** Node logging on/off (`anvil_setLoggingEnabled`). */
  public setLoggingEnabled(enabled: boolean): this {
    return this.add("setLoggingEnabled", [enabled], (c) =>
      c.setLoggingEnabled(enabled),
    );
  }

  /** Genesis (or fork block) reset, or re-fork (`anvil_reset`); clears snapshots. */
  public reset(options?: AnvilResetParameters): this {
    return this.add("reset", options ? [options] : [], (c) => c.reset(options));
  }

  /** Removes the last `depth` blocks (default 1) (`anvil_rollback`). */
  public rollback(depth?: number): this {
    return this.add("rollback", depth === undefined ? [] : [depth], (c) =>
      c.rollback({ depth }),
    );
  }

  /** Merges a state dump into the current state (`anvil_loadState`). */
  public loadState(state: Hex): this {
    return this.add("loadState", [`${state.slice(0, 10)}…`], (c) =>
      c.loadState({ state }),
    );
  }

  /**
   * Any custom step, e.g. a transaction between cheats.
   * @example anvil.cheats.impersonate(whale).step((c) => c.sendTransaction({ account: whale, to, value }))
   */
  public step(
    run: (client: AnvilTestClient<TAccount>) => Promise<unknown>,
    label = "step",
  ): this {
    return this.add(label, undefined, run);
  }

  // -------------------------------------------------------------- execution

  /** Runs the queued steps in order (once; later calls return the same promise). */
  public run(): Promise<void> {
    this.execution ??= this.execute();
    return this.execution;
  }

  /** Makes the chain awaitable: `await anvil.cheats.mine()`. */
  public then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }

  /** Runs the chain and handles a failure, like `Promise.catch`. */
  public catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<void | TResult> {
    return this.run().catch(onrejected);
  }

  /** Runs the chain, then `onfinally` either way, like `Promise.finally`. */
  public finally(onfinally?: (() => void) | null): Promise<void> {
    return this.run().finally(onfinally);
  }

  private add(
    name: string,
    args: readonly unknown[] | undefined,
    run: Step<TAccount>["run"],
  ): this {
    if (this.execution) {
      throw new AnvilTestClientError(
        "CHEATS_ALREADY_RUN",
        `Cannot add ${name}() to a cheats chain that has already run; start a new chain with anvil.cheats.`,
      );
    }
    const label = args ? `${name}(${args.map(format).join(", ")})` : name;
    this.steps.push({ label, run });
    return this;
  }

  private async execute(): Promise<void> {
    for (const [index, step] of this.steps.entries()) {
      try {
        await step.run(this.client);
      } catch (error: unknown) {
        throw new AnvilTestClientError(
          "CHEAT_FAILED",
          `anvil.cheats step ${index + 1}/${this.steps.length} ${step.label} failed: ${errorReason(error)}` +
            (index > 0 ? ` (steps 1–${index} were applied)` : ""),
          { cause: error },
        );
      }
    }
  }
}
