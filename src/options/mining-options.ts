import { groupFlags } from "../flags/registry";
import {
  OptionsGroup,
  registerOptionsGroup,
  StoreHandle,
} from "./options-view";
import { integerArg, Integerish, positiveNumberArg } from "./validators";

/** Flags of {@link MiningOptions}. */
export const MINING_FLAGS = groupFlags("mining");

/**
 * Mining mode and genesis block (`.mining`). Modes are exclusive: automine
 * (default), interval (`withBlockTime`) or on demand (`withNoMining`).
 */
export class MiningOptions extends OptionsGroup {
  protected readonly groupName = "mining";

  /** @internal */
  constructor(store: StoreHandle) {
    super(store);
  }

  /** A block every `seconds`, fractions allowed (`--block-time`). */
  public withBlockTime(seconds: Integerish): this {
    return this.setValue(
      "--block-time",
      positiveNumberArg("--block-time", seconds),
    );
  }

  /** Interval mining plus automine (`--mixed-mining`). Requires `withBlockTime`. */
  public withMixedMining(enabled = true): this {
    return this.toggleFlag("--mixed-mining", enabled);
  }

  /** Mine only on demand (`--no-mining`). Conflicts with `withBlockTime`. */
  public withNoMining(enabled = true): this {
    return this.toggleFlag("--no-mining", enabled);
  }

  /** Back to automine: removes `--block-time`, `--mixed-mining`, `--no-mining`. */
  public withAutoMining(): this {
    return this.unsetFlags(["--block-time", "--mixed-mining", "--no-mining"]);
  }

  /** Genesis block number (`--number`). */
  public withBlockNumber(blockNumber: Integerish): this {
    return this.setValue("--number", integerArg("--number", blockNumber));
  }

  /** Slots per epoch, drives `safe`/`finalized` (`--slots-in-an-epoch`, default 32). */
  public withSlotsInAnEpoch(slots: Integerish): this {
    return this.setValue(
      "--slots-in-an-epoch",
      integerArg("--slots-in-an-epoch", slots, { min: 1n }),
    );
  }
}

registerOptionsGroup("mining", (store) => new MiningOptions(store));
