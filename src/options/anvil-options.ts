import { FlagStore } from "../flags/flag-store";
import { OptionsView, registerOptionsGroup, StoreHandle } from "./options-view";
// Side-effect imports: each group registers itself.
import "./account-options";
import "./evm-options";
import "./forking-options";
import "./logging-options";
import "./mining-options";
import "./network-options";
import "./server-options";
import "./state-options";

/**
 * Fluent, validated configuration covering every anvil flag. Groups mirror
 * `anvil --help`: `account`, `evm`, `fork`, `mining`, `logs`, `network`,
 * `server`, `state`. Invalid values and conflicting flags throw immediately;
 * dependencies are checked by `validate()` / `build()` / `start()`; arguments
 * render in a deterministic, order-independent way.
 *
 * @example
 * const options = new AnvilOptions()
 *   .account.withAccounts(5).withBalance(1_000)
 *   .evm.withChainId(1337).withHardfork(Hardfork.Cancun)
 *   .mining.withBlockTime(1);
 * const anvil = await new AnvilContainer(options).start();
 */
export class AnvilOptions extends OptionsView {
  /** Creates an empty configuration (anvil defaults). `store` is internal. */
  constructor(store?: StoreHandle) {
    super(
      store instanceof FlagStore
        ? store
        : (new FlagStore() as unknown as StoreHandle),
    );
  }
}

registerOptionsGroup("root", (store) => new AnvilOptions(store));
