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
 * Every anvil flag, in groups mirroring `anvil --help`. Invalid values and
 * conflicts throw at once; dependencies are checked by `validate()` / `start()`.
 * @example new AnvilOptions().account.withAccounts(5).evm.withChainId(1337).mining.withBlockTime(1)
 * @see {@link https://hellalabs.dev/foundryanvil-testcontainers-nodejs/docs/reference/anvil-options | Every flag, by group} (docs)
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
