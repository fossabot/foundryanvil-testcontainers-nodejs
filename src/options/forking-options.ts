import { groupFlags } from "../flags/registry";
import { TransactionHash } from "../types";
import {
  OptionsGroup,
  registerOptionsGroup,
  StoreHandle,
} from "./options-view";
import {
  forkUrlArg,
  headerArg,
  hexArg,
  integerArg,
  Integerish,
} from "./validators";

/** Flags of {@link ForkingOptions}. */
export const FORK_FLAGS = groupFlags("fork");

const I128 = 2n ** 127n;

/**
 * Fork a remote network (`.fork`). Every option requires `withForkUrl()`
 * (checked at build time, so call order doesn't matter). The URL is resolved
 * from inside the container: use `host.docker.internal` for host nodes.
 *
 * @example new AnvilOptions().fork.withForkUrl(url, 18_000_000).withRetries(10).noRateLimit()
 */
export class ForkingOptions extends OptionsGroup {
  protected readonly groupName = "fork";

  /** @internal */
  constructor(store: StoreHandle) {
    super(store);
  }

  /**
   * Remote endpoint (`--fork-url`): `http(s)`/`ws(s)` URL, `localhost:PORT`
   * or IPC path. `url@block` and `blockNumber` set `--fork-block-number`.
   */
  public withForkUrl(url: string, blockNumber?: Integerish): this {
    const parsed = forkUrlArg("--fork-url", url);
    this.setValue("--fork-url", parsed.url);
    const block =
      blockNumber ??
      (parsed.blockNumber === undefined
        ? undefined
        : BigInt(parsed.blockNumber));
    return block === undefined ? this : this.withForkBlockNumber(block);
  }

  /** Block to fork from; negative is relative to `latest` (`--fork-block-number`). Conflicts with `withForkTransactionHash`. */
  public withForkBlockNumber(blockNumber: Integerish): this {
    return this.setValue(
      "--fork-block-number",
      integerArg("--fork-block-number", blockNumber, {
        min: -I128,
        max: I128 - 1n,
      }),
    );
  }

  /** Fork from the state after a transaction (`--fork-transaction-hash`). Conflicts with `withForkBlockNumber`. */
  public withForkTransactionHash(hash: TransactionHash): this {
    return this.setValue(
      "--fork-transaction-hash",
      hexArg("--fork-transaction-hash", hash, 32, "transaction hash"),
    );
  }

  /** Skip fetching the chain id – offline start (`--fork-chain-id`). Also needs a fork block number or transaction hash. */
  public withForkChainId(chainId: Integerish): this {
    return this.setValue(
      "--fork-chain-id",
      integerArg("--fork-chain-id", chainId, { min: 1n }),
    );
  }

  /** Adds an HTTP header `Name: value` for the remote (`--fork-header`, repeatable). */
  public withForkHeader(header: string): this {
    return this.addValue("--fork-header", headerArg("--fork-header", header));
  }

  /** Replaces all remote HTTP headers; none removes the flag. */
  public withForkHeaders(...headers: readonly string[]): this {
    const validated = headers.map((header) =>
      headerArg("--fork-header", header),
    );
    return validated.length === 0
      ? this.unsetFlags(["--fork-header"])
      : this.setValue("--fork-header", validated);
  }

  /** Initial retry backoff in ms (`--fork-retry-backoff`). */
  public withForkRetryBackoff(milliseconds: Integerish): this {
    return this.setValue(
      "--fork-retry-backoff",
      integerArg("--fork-retry-backoff", milliseconds),
    );
  }

  /** Retries for spurious network errors (`--retries`, default 5). */
  public withRetries(retries: Integerish): this {
    return this.setValue(
      "--retries",
      integerArg("--retries", retries, { max: 4294967295n }),
    );
  }

  /** Remote request timeout in ms (`--timeout`, default 45000). */
  public withTimeout(milliseconds: Integerish): this {
    return this.setValue(
      "--timeout",
      integerArg("--timeout", milliseconds, { min: 1n }),
    );
  }

  /** Rate-limit budget (`--compute-units-per-second`, default 330). */
  public withComputeUnitsPerSecond(cups: Integerish): this {
    return this.setValue(
      "--compute-units-per-second",
      integerArg("--compute-units-per-second", cups, { min: 1n }),
    );
  }

  /** Disable rate limiting (`--no-rate-limit`). */
  public noRateLimit(enabled = true): this {
    return this.toggleFlag("--no-rate-limit", enabled);
  }

  /** Read every storage slot from the remote (`--no-storage-caching`). */
  public noStorageCaching(enabled = true): this {
    return this.toggleFlag("--no-storage-caching", enabled);
  }
}

registerOptionsGroup("fork", (store) => new ForkingOptions(store));
