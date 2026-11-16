import { groupFlags } from "../flags/registry";
import {
  OptionsGroup,
  registerOptionsGroup,
  StoreHandle,
} from "./options-view";

/** Flags of {@link NetworkOptions}. */
export const NETWORK_FLAGS = groupFlags("network");

/** Network features (`.network`). Optimism and Celo are mutually exclusive. */
export class NetworkOptions extends OptionsGroup {
  protected readonly groupName = "network";

  /** @internal */
  constructor(store: StoreHandle) {
    super(store);
  }

  /** OP Stack features (`--optimism`); hardforks must then be {@link OpHardfork}s. */
  public withOptimism(enabled = true): this {
    return this.toggleFlag("--optimism", enabled);
  }

  /** Celo features (`--celo`). */
  public withCelo(enabled = true): this {
    return this.toggleFlag("--celo", enabled);
  }
}

registerOptionsGroup("network", (store) => new NetworkOptions(store));
