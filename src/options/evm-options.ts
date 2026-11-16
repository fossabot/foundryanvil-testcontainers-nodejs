import { groupFlags } from "../flags/registry";
import { Hardfork, OpHardfork } from "../types";
import {
  OptionsGroup,
  registerOptionsGroup,
  StoreHandle,
} from "./options-view";
import { fail, integerArg, Integerish, U128_MAX } from "./validators";

/** Flags of {@link EvmOptions}. */
export const EVM_FLAGS = groupFlags("evm");

const HARDFORKS: readonly string[] = [
  ...Object.values(Hardfork),
  ...Object.values(OpHardfork),
];

/** Chain identity, fees, execution limits and tracing (`.evm`). Fees are in wei. */
export class EvmOptions extends OptionsGroup {
  protected readonly groupName = "evm";

  /** @internal */
  constructor(store: StoreHandle) {
    super(store);
  }

  /**
   * EVM hardfork (`--hardfork`): a {@link Hardfork}, or an {@link OpHardfork}
   * with `network.withOptimism()`. `Hardfork.Latest` removes the flag (anvil's
   * default) because anvil rejects a literal `latest`.
   */
  public withHardfork(hardfork: Hardfork | OpHardfork): this {
    if (!HARDFORKS.includes(hardfork)) {
      fail(
        "--hardfork",
        `unknown hardfork ${JSON.stringify(hardfork)}; expected one of ${HARDFORKS.join(", ")}`,
      );
    }
    return hardfork === Hardfork.Latest
      ? this.unsetFlags(["--hardfork"])
      : this.setValue("--hardfork", hardfork);
  }

  /** Chain id (`--chain-id`, default 31337 or the fork's). */
  public withChainId(chainId: Integerish): this {
    return this.setValue(
      "--chain-id",
      integerArg("--chain-id", chainId, { min: 1n }),
    );
  }

  /** Base fee per gas of every block (`--block-base-fee-per-gas`). */
  public withBlockBaseFeePerGas(fee: Integerish): this {
    return this.setValue(
      "--block-base-fee-per-gas",
      integerArg("--block-base-fee-per-gas", fee),
    );
  }

  /** Gas price (`--gas-price`, u128). */
  public withGasPrice(price: Integerish): this {
    return this.setValue(
      "--gas-price",
      integerArg("--gas-price", price, { max: U128_MAX }),
    );
  }

  /** Don't enforce a minimum priority fee (`--disable-min-priority-fee`). */
  public disableMinPriorityFee(enabled = true): this {
    return this.toggleFlag("--disable-min-priority-fee", enabled);
  }

  /** Block gas limit (`--gas-limit`). Conflicts with `disableBlockGasLimit`. */
  public withGasLimit(limit: Integerish): this {
    return this.setValue("--gas-limit", integerArg("--gas-limit", limit));
  }

  /** Drop `call.gas_limit <= block.gas_limit` (`--disable-block-gas-limit`). Conflicts with `withGasLimit`. */
  public disableBlockGasLimit(enabled = true): this {
    return this.toggleFlag("--disable-block-gas-limit", enabled);
  }

  /** EIP-170 code size limit in bytes (`--code-size-limit`, default 0x6000). Conflicts with `disableCodeSizeLimit`. */
  public withCodeSizeLimit(bytes: Integerish): this {
    return this.setValue(
      "--code-size-limit",
      integerArg("--code-size-limit", bytes),
    );
  }

  /** Disable EIP-170 (`--disable-code-size-limit`). Conflicts with `withCodeSizeLimit`. */
  public disableCodeSizeLimit(enabled = true): this {
    return this.toggleFlag("--disable-code-size-limit", enabled);
  }

  /** Memory limit per EVM execution in bytes (`--memory-limit`). */
  public withMemoryLimit(bytes: Integerish): this {
    return this.setValue("--memory-limit", integerArg("--memory-limit", bytes));
  }

  /** Any sender can be impersonated without unlocking (`--auto-impersonate`). */
  public autoImpersonate(enabled = true): this {
    return this.toggleFlag("--auto-impersonate", enabled);
  }

  /** Disable the default CREATE2 deployer (`--disable-default-create2-deployer`). */
  public disableDefaultCreate2Deployer(enabled = true): this {
    return this.toggleFlag("--disable-default-create2-deployer", enabled);
  }

  /** Disable mempool balance checks (`--disable-pool-balance-checks`). */
  public disablePoolBalanceChecks(enabled = true): this {
    return this.toggleFlag("--disable-pool-balance-checks", enabled);
  }

  /** Print traces of transactions and `eth_call` to stdout (`--print-traces`). */
  public withPrintTraces(enabled = true): this {
    return this.toggleFlag("--print-traces", enabled);
  }

  /** Geth-style step tracing for `debug_*` calls (`--steps-tracing`). */
  public withStepsTracing(enabled = true): this {
    return this.toggleFlag("--steps-tracing", enabled);
  }
}

registerOptionsGroup("evm", (store) => new EvmOptions(store));
