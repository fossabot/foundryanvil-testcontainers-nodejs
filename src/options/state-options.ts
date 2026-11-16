import * as fs from "node:fs";
import * as path from "node:path";
import { groupFlags } from "../flags/registry";
import { FilePath, isContainerPath, Order } from "../types";
import {
  OptionsGroup,
  registerOptionsGroup,
  StoreHandle,
} from "./options-view";
import {
  enumArg,
  integerArg,
  Integerish,
  stringArg,
  timestampArg,
} from "./validators";

/** Flags of {@link StateOptions}. */
export const STATE_FLAGS = groupFlags("state");

/** Container paths used for host files (directly under `/tmp`, writable by any user). */
export const CONTAINER_FILE_PATHS = Object.freeze({
  "--load-state": "/tmp/anvil-load-state.json",
  "--init": "/tmp/anvil-genesis.json",
  "--dump-state": "/tmp/anvil-dump-state.json",
  "--state": "/tmp/anvil-state.json",
  "--config-out": "/tmp/anvil-config-out.json",
} as const);

type FileFlag = keyof typeof CONTAINER_FILE_PATHS;
type Transfer = "import" | "export-on-start" | "export-on-stop" | "state";

/**
 * State persistence, genesis, history and mempool order (`.state`).
 *
 * File options take a {@link FilePath}: a plain string is a **host** path,
 * copied into the container before start (inputs) or back after start/stop
 * (outputs); `containerPath("/abs")` is used verbatim. Dumps on exit need a
 * graceful stop, which {@link StartedAnvilContainer.stop} performs.
 *
 * @example new AnvilOptions().state.withState("./.anvil/state.json").withStateInterval(30)
 */
export class StateOptions extends OptionsGroup {
  protected readonly groupName = "state";

  /** @internal */
  constructor(store: StoreHandle) {
    super(store);
  }

  /** Start from a state snapshot (`--load-state`); the host file must exist. Conflicts with `withInit`, `withState`. */
  public withLoadState(file: FilePath): this {
    return this.file("--load-state", file, "import");
  }

  /** Genesis from a `genesis.json` (`--init`). Conflicts with the load/dump/state options. */
  public withInit(file: FilePath): this {
    return this.file("--init", file, "import");
  }

  /**
   * Dump state on exit / every `withStateInterval` (`--dump-state`), copied to
   * the host on stop; an existing directory becomes `<dir>/state.json`.
   * Conflicts with `withInit`, `withState`.
   */
  public withDumpState(file: FilePath): this {
    return this.file("--dump-state", file, "export-on-stop");
  }

  /** Load (if present) and dump the same file (`--state`). Conflicts with `withInit`, `withLoadState`, `withDumpState`. */
  public withState(file: FilePath): this {
    return this.file("--state", file, "state");
  }

  /** Write anvil's resolved config incl. keys as JSON, copied to the host after start (`--config-out`). */
  public withConfigOut(file: FilePath): this {
    return this.file("--config-out", file, "export-on-start");
  }

  /** Dump every `seconds` (`--state-interval`). Requires a dump target. */
  public withStateInterval(seconds: Integerish): this {
    return this.setValue(
      "--state-interval",
      integerArg("--state-interval", seconds, { min: 1n }),
    );
  }

  /** Keep historical snapshots in dumps (`--preserve-historical-states`). Requires a dump target. */
  public withPreserveHistoricalStates(enabled = true): this {
    return this.toggleFlag("--preserve-historical-states", enabled);
  }

  /** Max states persisted on disk (`--max-persisted-states`). Conflicts with `withPruneHistory`. */
  public withMaxPersistedStates(count: Integerish): this {
    return this.setValue(
      "--max-persisted-states",
      integerArg("--max-persisted-states", count),
    );
  }

  /** Don't keep full history; optionally keep `count` states in memory (`--prune-history`). */
  public withPruneHistory(count?: Integerish): this {
    return this.setValue(
      "--prune-history",
      count === undefined ? null : integerArg("--prune-history", count),
    );
  }

  /** Blocks with transactions kept in memory (`--transaction-block-keeper`). */
  public withTransactionBlockKeeper(count: Integerish): this {
    return this.setValue(
      "--transaction-block-keeper",
      integerArg("--transaction-block-keeper", count),
    );
  }

  /** Genesis timestamp in seconds or as a `Date` (`--timestamp`). */
  public withTimestamp(timestamp: Integerish | Date): this {
    return this.setValue("--timestamp", timestampArg("--timestamp", timestamp));
  }

  /** Mempool ordering (`--order`, default fees). */
  public withOrder(order: Order): this {
    return this.setValue("--order", enumArg("--order", order, Order, "order"));
  }

  private file(flag: FileFlag, file: FilePath, transfer: Transfer): this {
    this.unsetFlags([flag]); // drop a previous value and its transfer
    if (isContainerPath(file)) {
      return this.setValue(
        flag,
        stringArg(flag, file.containerPath, "container path"),
      );
    }
    let hostPath = path.resolve(stringArg(flag, file, "host path"));
    const exportsOnStop = transfer === "export-on-stop" || transfer === "state";
    if (exportsOnStop && isDirectory(hostPath))
      hostPath = path.join(hostPath, "state.json");
    const containerPath = CONTAINER_FILE_PATHS[flag];
    this.setValue(flag, containerPath);
    if (transfer === "import" || transfer === "state") {
      this.addFileTransfer({
        flag,
        hostPath,
        containerPath,
        required: transfer === "import",
      });
    }
    if (transfer === "export-on-start" || exportsOnStop) {
      this.addFileTransfer({
        flag,
        hostPath,
        containerPath,
        when: transfer === "export-on-start" ? "start" : "stop",
      });
    }
    return this;
  }
}

function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

registerOptionsGroup("state", (store) => new StateOptions(store));
