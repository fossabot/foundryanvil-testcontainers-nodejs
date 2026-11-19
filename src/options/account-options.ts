import { groupFlags } from "../flags/registry";
import {
  OptionsGroup,
  registerOptionsGroup,
  StoreHandle,
} from "./options-view";
import {
  derivationPathArg,
  fail,
  integerArg,
  Integerish,
  MNEMONIC_WORD_COUNTS,
  mnemonicArg,
} from "./validators";

/** Flags of {@link AccountOptions}. */
export const ACCOUNT_FLAGS = groupFlags("account");

/**
 * Dev accounts, balances, mnemonics and impersonation (`.account`).
 * Only one mnemonic source may be configured.
 */
export class AccountOptions extends OptionsGroup {
  protected readonly groupName = "account";

  /** @internal */
  constructor(store: StoreHandle) {
    super(store);
  }

  /** Number of dev accounts (`--accounts`, default 10). */
  public withAccounts(count: Integerish): this {
    return this.setValue("--accounts", integerArg("--accounts", count));
  }

  /** Balance of every dev account in whole Ether (`--balance`, default 10000). */
  public withBalance(ether: Integerish): this {
    return this.setValue("--balance", integerArg("--balance", ether));
  }

  /** BIP-44 derivation path (`--derivation-path`, default `m/44'/60'/0'/0/`). */
  public withDerivationPath(path: string): this {
    return this.setValue(
      "--derivation-path",
      derivationPathArg("--derivation-path", path),
    );
  }

  /** BIP-39 mnemonic of 12–24 words (`--mnemonic`, default `test … junk`). */
  public withMnemonic(phrase: string): this {
    return this.setValue("--mnemonic", mnemonicArg("--mnemonic", phrase));
  }

  /** Random mnemonic (`--mnemonic-random[=words]`, default 12); keys are known unless `--quiet`. */
  public withRandomMnemonic(words?: number): this {
    if (words === undefined) return this.setValue("--mnemonic-random", null);
    const count = integerArg("--mnemonic-random", words);
    if (!MNEMONIC_WORD_COUNTS.includes(Number(count))) {
      fail(
        "--mnemonic-random",
        `word count must be one of ${MNEMONIC_WORD_COUNTS.join(", ")}, received ${count}`,
      );
    }
    return this.setValue("--mnemonic-random", count);
  }

  /** Mnemonic derived from a `u64` seed (`--mnemonic-seed-unsafe`). Testing only. */
  public withMnemonicSeedUnsafe(seed: Integerish): this {
    return this.setValue(
      "--mnemonic-seed-unsafe",
      integerArg("--mnemonic-seed-unsafe", seed),
    );
  }

  /** Impersonates every sender (`--auto-impersonate`); same as `evm.autoImpersonate()`. */
  public autoImpersonate(enabled = true): this {
    return this.toggleFlag("--auto-impersonate", enabled);
  }
}

registerOptionsGroup("account", (store) => new AccountOptions(store));
