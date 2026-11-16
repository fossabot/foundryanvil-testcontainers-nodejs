import {
  AnvilFlag,
  AnvilOptions,
  Color,
  Hardfork,
  LogVerbosity,
  OptionsView,
  Order,
  containerPath,
} from "../../src";

/**
 * Every user-configurable flag mapped to a representative fluent call.
 *
 * Used by the coverage-matrix and combination tests: the registry is the
 * source of truth for *which* flags exist, this catalog proves each one is
 * reachable through the fluent API.
 */
export const FLAG_SETTERS: Record<
  Exclude<AnvilFlag, "--host">,
  (options: AnvilOptions) => OptionsView
> = {
  // General
  "--accounts": (o) => o.account.withAccounts(5),
  "--block-time": (o) => o.mining.withBlockTime(2),
  "--balance": (o) => o.account.withBalance(1_000),
  "--config-out": (o) => o.state.withConfigOut(containerPath("/tmp/c.json")),
  "--derivation-path": (o) => o.account.withDerivationPath("m/44'/60'/1'/0/"),
  "--dump-state": (o) => o.state.withDumpState(containerPath("/tmp/d.json")),
  "--hardfork": (o) => o.evm.withHardfork(Hardfork.Cancun),
  "--init": (o) => o.state.withInit(containerPath("/tmp/genesis.json")),
  "--ipc": (o) => o.server.withIpc("/tmp/anvil.ipc"),
  "--threads": (o) => o.server.withThreads(2),
  "--load-state": (o) => o.state.withLoadState(containerPath("/tmp/l.json")),
  "--mnemonic": (o) =>
    o.account.withMnemonic(
      "test test test test test test test test test test test junk",
    ),
  "--max-persisted-states": (o) => o.state.withMaxPersistedStates(10),
  "--mixed-mining": (o) => o.mining.withMixedMining(),
  "--mnemonic-random": (o) => o.account.withRandomMnemonic(24),
  "--mnemonic-seed-unsafe": (o) => o.account.withMnemonicSeedUnsafe(42),
  "--no-mining": (o) => o.mining.withNoMining(),
  "--number": (o) => o.mining.withBlockNumber(100),
  "--order": (o) => o.state.withOrder(Order.Fifo),
  "--port": (o) => o.server.withPort(8546),
  "--preserve-historical-states": (o) => o.state.withPreserveHistoricalStates(),
  "--prune-history": (o) => o.state.withPruneHistory(100),
  "--state-interval": (o) => o.state.withStateInterval(30),
  "--slots-in-an-epoch": (o) => o.mining.withSlotsInAnEpoch(1),
  "--state": (o) => o.state.withState(containerPath("/tmp/s.json")),
  "--timestamp": (o) => o.state.withTimestamp(1_700_000_000),
  "--transaction-block-keeper": (o) => o.state.withTransactionBlockKeeper(50),
  // Display options
  "--color": (o) => o.logs.withColor(Color.Never),
  "--json": (o) => o.logs.jsonLogFormat(),
  "--md": (o) => o.logs.withMarkdownFormat(),
  "--quiet": (o) => o.logs.quiet(),
  "--verbosity": (o) => o.logs.verboseLogs(LogVerbosity.Three),
  // Server options
  "--allow-origin": (o) => o.server.withAllowOrigin("http://localhost:3000"),
  "--cache-path": (o) => o.server.withCachePath("/tmp/anvil-cache"),
  "--no-cors": (o) => o.server.noCors(),
  "--no-request-size-limit": (o) => o.server.noRequestSizeLimit(),
  // Fork config
  "--compute-units-per-second": (o) => o.fork.withComputeUnitsPerSecond(500),
  "--fork-url": (o) => o.fork.withForkUrl("https://rpc.example.com/v1/key"),
  "--fork-block-number": (o) => o.fork.withForkBlockNumber(18_000_000),
  "--fork-chain-id": (o) => o.fork.withForkChainId(1),
  "--fork-header": (o) => o.fork.withForkHeader("Authorization: Bearer x"),
  "--fork-retry-backoff": (o) => o.fork.withForkRetryBackoff(1_000),
  "--fork-transaction-hash": (o) =>
    o.fork.withForkTransactionHash(`0x${"ab".repeat(32)}`),
  "--no-rate-limit": (o) => o.fork.noRateLimit(),
  "--no-storage-caching": (o) => o.fork.noStorageCaching(),
  "--retries": (o) => o.fork.withRetries(3),
  "--timeout": (o) => o.fork.withTimeout(60_000),
  // Environment config
  "--block-base-fee-per-gas": (o) =>
    o.evm.withBlockBaseFeePerGas(1_000_000_000n),
  "--chain-id": (o) => o.evm.withChainId(1337),
  "--code-size-limit": (o) => o.evm.withCodeSizeLimit(0x10000),
  "--disable-block-gas-limit": (o) => o.evm.disableBlockGasLimit(),
  "--disable-code-size-limit": (o) => o.evm.disableCodeSizeLimit(),
  "--disable-min-priority-fee": (o) => o.evm.disableMinPriorityFee(),
  "--gas-limit": (o) => o.evm.withGasLimit(30_000_000),
  "--gas-price": (o) => o.evm.withGasPrice(20_000_000_000n),
  // EVM options
  "--auto-impersonate": (o) => o.evm.autoImpersonate(),
  "--disable-console-log": (o) => o.logs.disableConsoleLog(),
  "--disable-default-create2-deployer": (o) =>
    o.evm.disableDefaultCreate2Deployer(),
  "--disable-pool-balance-checks": (o) => o.evm.disablePoolBalanceChecks(),
  "--memory-limit": (o) => o.evm.withMemoryLimit(128 * 1024 * 1024),
  "--print-traces": (o) => o.evm.withPrintTraces(),
  "--steps-tracing": (o) => o.evm.withStepsTracing(),
  // Networks
  "--celo": (o) => o.network.withCelo(),
  "--optimism": (o) => o.network.withOptimism(),
};

/** Every user-configurable flag. */
export const SETTABLE_FLAGS = Object.keys(FLAG_SETTERS) as Array<
  keyof typeof FLAG_SETTERS
>;

/** Applies the representative setter of `flag` to `options`. */
export function applyFlag(options: AnvilOptions, flag: AnvilFlag): void {
  if (flag === "--host") throw new Error("--host is managed");
  FLAG_SETTERS[flag](options);
}

/**
 * Tiny seeded PRNG (mulberry32) so randomised combination tests are
 * reproducible.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle with a seeded PRNG. */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Parses rendered arguments back into the set of flags they contain. Handles
 * `--flag value`, `--flag=value`, bare switches and `-vvv`.
 */
export function flagsInArgs(args: readonly string[]): Set<string> {
  const flags = new Set<string>();
  for (const arg of args) {
    if (/^-v+$/.test(arg)) {
      flags.add("--verbosity");
    } else if (arg.startsWith("--")) {
      flags.add(arg.split("=")[0]);
    }
  }
  return flags;
}
