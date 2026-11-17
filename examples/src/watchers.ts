/**
 * Testing viem watchers (`watchBlocks`, `watchContractEvent`,
 * `watchPendingTransactions`, …) deterministically.
 *
 * Over WebSocket a watcher subscribes asynchronously and viem gives no
 * "subscription is live" signal, so an event triggered right after starting
 * the watcher may happen before `eth_subscribe` completes and never be seen.
 * Sleeping "long enough" is a race. Instead, repeat the trigger until the
 * watcher reports what you are waiting for.
 */

export interface TriggerUntilOptions {
  /** Delay between triggers in ms (default 50). */
  readonly intervalMs?: number;
  /** Give up after this many ms (default 10 000). */
  readonly timeoutMs?: number;
}

/**
 * Runs `trigger` (e.g. mine a block, send a transaction), then checks
 * `observed`, repeating until it returns `true`.
 *
 * @example
 * const seen = new Set<bigint>();
 * const unwatch = client.watchBlocks({ onBlock: (block) => seen.add(block.number!) });
 * await triggerUntil(() => anvil.mine(), () => seen.size >= 2);
 * unwatch();
 */
export async function triggerUntil(
  trigger: () => Promise<unknown>,
  observed: () => boolean,
  { intervalMs = 50, timeoutMs = 10_000 }: TriggerUntilOptions = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  while (!observed()) {
    if (Date.now() > deadline) {
      throw new Error(
        `triggerUntil: not observed after ${attempts} trigger(s) in ${timeoutMs} ms`,
      );
    }
    await trigger();
    attempts++;
    // Give the watcher a moment to report before triggering again.
    for (let waited = 0; waited < intervalMs && !observed(); waited += 10) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}
