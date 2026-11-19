import { AnvilConfigurationError } from "../errors";
import {
  FileExport,
  FileImport,
  FlagStore,
  FlagValue,
} from "../flags/flag-store";
import { AnvilFlag, getFlagSpec, groupFlags } from "../flags/registry";
import { Hardfork, OpHardfork } from "../types";
import type { AccountOptions } from "./account-options";
import type { AnvilOptions } from "./anvil-options";
import type { EvmOptions } from "./evm-options";
import type { ForkingOptions } from "./forking-options";
import type { LoggingOptions } from "./logging-options";
import type { MiningOptions } from "./mining-options";
import type { NetworkOptions } from "./network-options";
import type { ServerOptions } from "./server-options";
import type { StateOptions } from "./state-options";
import { booleanArg } from "./validators";

/** Executable started in the container. */
export const ANVIL_EXECUTABLE = "anvil";
/** anvil's default port. */
export const DEFAULT_ANVIL_PORT = 8545;
/** anvil's default number of dev accounts. */
export const DEFAULT_ACCOUNT_COUNT = 10;
/** anvil's default mnemonic. */
export const DEFAULT_MNEMONIC =
  "test test test test test test test test test test test junk";
/** anvil's default derivation path. */
export const DEFAULT_DERIVATION_PATH = "m/44'/60'/0'/0/";
/** anvil's default chain id (when not forking). */
export const DEFAULT_CHAIN_ID = 31337;

/** Validated, immutable result of {@link OptionsView.build}. */
export interface AnvilConfiguration {
  /** Arguments without the executable, e.g. `["--host", "0.0.0.0", "--accounts", "5"]`. */
  readonly args: readonly string[];
  /** `["anvil", ...args]`. */
  readonly command: readonly string[];
  /** Port anvil listens on inside the container. */
  readonly port: number;
  /** Static chain id (`--chain-id`); `undefined` means anvil's default or the fork's. */
  readonly chainId?: number;
  /** Number of dev accounts. */
  readonly accounts: number;
  /** Mnemonic of the dev accounts when known statically (not random/seeded). */
  readonly mnemonic?: string;
  readonly derivationPath: string;
  /** `--quiet` is set. */
  readonly quiet: boolean;
  /** `--fork-url` is set. */
  readonly forking: boolean;
  /** Host → container copies before start. */
  readonly fileImports: readonly FileImport[];
  /** Container → host copies after start / stop. */
  readonly fileExports: readonly FileExport[];
  readonly flags: Readonly<Partial<Record<AnvilFlag, FlagValue>>>;
}

/** Fluent group names (`root` = {@link AnvilOptions}). */
export type OptionsGroupName =
  | "root"
  | "account"
  | "evm"
  | "fork"
  | "mining"
  | "logs"
  | "network"
  | "server"
  | "state";

/** Opaque handle to the shared configuration store. */
export type StoreHandle = { readonly __anvilStore: unique symbol };

type GroupFactory = (store: StoreHandle) => OptionsView;
const GROUP_FACTORIES = new Map<OptionsGroupName, GroupFactory>();

/** @internal Registers a group factory (avoids circular imports). */
export function registerOptionsGroup(
  name: OptionsGroupName,
  factory: GroupFactory,
): void {
  GROUP_FACTORIES.set(name, factory);
}

function createView<T extends OptionsView>(
  name: OptionsGroupName,
  store: FlagStore,
): T {
  const factory = GROUP_FACTORIES.get(name);
  if (!factory) {
    throw new Error(
      `Options group "${name}" is not registered – import from the package entry point`,
    );
  }
  return factory(store as unknown as StoreHandle) as T;
}

/**
 * Base of {@link AnvilOptions} and its groups, which share one configuration
 * and chain freely. Setters validate at once ({@link AnvilConfigurationError});
 * boolean setters take `enabled = true` (`false` removes the flag).
 */
export abstract class OptionsView {
  readonly #store: FlagStore;

  /** @internal */
  protected constructor(store: StoreHandle) {
    this.#store = store as unknown as FlagStore;
  }

  /** Dev accounts, balances, mnemonics, impersonation. */
  public get account(): AccountOptions {
    return createView("account", this.#store);
  }

  /** Chain id, hardfork, fees, gas/code/memory limits, tracing. */
  public get evm(): EvmOptions {
    return createView("evm", this.#store);
  }

  /** Forking a remote network. */
  public get fork(): ForkingOptions {
    return createView("fork", this.#store);
  }

  /** Mining mode and genesis block number. */
  public get mining(): MiningOptions {
    return createView("mining", this.#store);
  }

  /** Log format and verbosity. */
  public get logs(): LoggingOptions {
    return createView("logs", this.#store);
  }

  /** Optimism / Celo features. */
  public get network(): NetworkOptions {
    return createView("network", this.#store);
  }

  /** Port, IPC, CORS, threads, cache path. */
  public get server(): ServerOptions {
    return createView("server", this.#store);
  }

  /** State load/dump/persistence, genesis, history, mempool order. */
  public get state(): StateOptions {
    return createView("state", this.#store);
  }

  /** Independent deep copy (flags, file transfers, extra args). */
  public clone(): AnvilOptions {
    return createView("root", this.#store.clone());
  }

  /**
   * Runs presets on this configuration.
   * @example new AnvilOptions().apply((o) => o.mining.withBlockTime(1), withRichAccounts)
   */
  public apply(
    ...presets: ReadonlyArray<(options: AnvilOptions) => unknown>
  ): this {
    const root = this.root();
    for (const preset of presets) preset(root);
    return this;
  }

  /** The {@link AnvilOptions} view of this configuration. */
  public root(): AnvilOptions {
    return createView("root", this.#store);
  }

  /**
   * Removes flags (and their file transfers), e.g. to swap a conflicting one.
   * @example base.clone().unset("--mnemonic").account.withRandomMnemonic()
   */
  public unset(...flags: readonly AnvilFlag[]): this {
    this.#store.unsetAll(flags);
    return this;
  }

  /** Raw arguments for flags newer than the library; known flags are rejected. */
  public withExtraArgs(...args: readonly string[]): this {
    this.#store.addExtraArgs(args);
    return this;
  }

  /** Whether a flag is configured. */
  public has(flag: AnvilFlag): boolean {
    getFlagSpec(flag);
    return this.#store.has(flag);
  }

  /** Configured raw value of a flag. */
  public get(flag: AnvilFlag): FlagValue | undefined {
    getFlagSpec(flag);
    return this.#store.get(flag);
  }

  /** Configured flags in canonical order. */
  public flags(): Readonly<Partial<Record<AnvilFlag, FlagValue>>> {
    return this.#store.toObject();
  }

  /** Rendered arguments without `anvil` (unvalidated; see {@link build}). */
  public toArgs(): string[] {
    return this.#store.render();
  }

  /** `["anvil", ...toArgs()]`. */
  public get entryPoint(): string[] {
    return [ANVIL_EXECUTABLE, ...this.toArgs()];
  }

  /** Shell-quoted command line for logs and messages. */
  public toCommand(): string {
    return this.entryPoint.map(shellQuote).join(" ");
  }

  public toJSON(): {
    command: string[];
    flags: Readonly<Partial<Record<AnvilFlag, FlagValue>>>;
  } {
    return { command: this.entryPoint, flags: this.flags() };
  }

  /** Every configuration problem (unmet dependencies, hardfork family), without throwing. */
  public problems(): AnvilConfigurationError[] {
    return [...this.#store.violations(), ...this.hardforkProblems()];
  }

  /**
   * Checks dependencies between flags (conflicts are rejected by the setters).
   * @throws AnvilConfigurationError listing every problem
   */
  public validate(): this {
    const errors = this.problems();
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AnvilConfigurationError(
        `Invalid anvil configuration (${errors.length} problems):\n${errors
          .map((error, index) => `  ${index + 1}. ${error.message}`)
          .join("\n")}`,
        {
          relatedFlags: errors.flatMap((error) =>
            error.flag ? [error.flag] : [],
          ),
        },
      );
    }
    return this;
  }

  /** Validates and freezes the configuration. Called by {@link AnvilContainer.start}. */
  public build(): AnvilConfiguration {
    this.validate();
    const flags = this.#store.toObject();
    const number = (flag: AnvilFlag, fallback?: number) =>
      flags[flag] === undefined ? fallback : Number(flags[flag]);
    const randomMnemonic =
      flags["--mnemonic-random"] !== undefined ||
      flags["--mnemonic-seed-unsafe"] !== undefined;
    const args = this.#store.render();
    return Object.freeze({
      args: Object.freeze(args),
      command: Object.freeze([ANVIL_EXECUTABLE, ...args]),
      port: number("--port", DEFAULT_ANVIL_PORT)!,
      chainId: number("--chain-id"),
      accounts: number("--accounts", DEFAULT_ACCOUNT_COUNT)!,
      mnemonic: randomMnemonic
        ? undefined
        : ((flags["--mnemonic"] as string | undefined) ?? DEFAULT_MNEMONIC),
      derivationPath:
        (flags["--derivation-path"] as string | undefined) ??
        DEFAULT_DERIVATION_PATH,
      quiet: flags["--quiet"] === true,
      forking: flags["--fork-url"] !== undefined,
      fileImports: Object.freeze([...this.#store.fileImports()]),
      fileExports: Object.freeze([...this.#store.fileExports()]),
      flags,
    });
  }

  // ------------------------------------------------- helpers for the groups

  /** @internal */
  protected setValue(flag: AnvilFlag, value: FlagValue): this {
    this.#store.set(flag, value);
    return this;
  }

  /** @internal */
  protected addValue(flag: AnvilFlag, value: string): this {
    this.#store.add(flag, value);
    return this;
  }

  /** @internal Validates `enabled` and sets / removes a boolean switch. */
  protected toggleFlag(flag: AnvilFlag, enabled: unknown): this {
    this.#store.toggle(flag, booleanArg(flag, enabled));
    return this;
  }

  /** @internal */
  protected unsetFlags(flags: readonly AnvilFlag[]): this {
    this.#store.unsetAll(flags);
    return this;
  }

  /** @internal */
  protected addFileTransfer(transfer: FileImport | FileExport): this {
    if ("required" in transfer) this.#store.addImport(transfer);
    else this.#store.addExport(transfer);
    return this;
  }

  private hardforkProblems(): AnvilConfigurationError[] {
    const hardfork = this.#store.get("--hardfork") as string | undefined;
    if (hardfork === undefined) return [];
    const optimism = this.#store.has("--optimism");
    if (
      (Object.values(OpHardfork) as string[]).includes(hardfork) &&
      !optimism
    ) {
      return [
        new AnvilConfigurationError(
          `--hardfork ${hardfork} is an Optimism hardfork and requires --optimism (network.withOptimism())`,
          { flag: "--hardfork", relatedFlags: ["--optimism"] },
        ),
      ];
    }
    if ((Object.values(Hardfork) as string[]).includes(hardfork) && optimism) {
      return [
        new AnvilConfigurationError(
          `--hardfork ${hardfork} is an Ethereum hardfork and cannot be combined with --optimism (network.withOptimism()); use an OpHardfork value instead`,
          { flag: "--hardfork", relatedFlags: ["--optimism"] },
        ),
      ];
    }
    return [];
  }
}

/** Base of the option groups: adds {@link reset}. */
export abstract class OptionsGroup extends OptionsView {
  /** @internal */
  protected abstract readonly groupName: OptionsGroupName;

  /** Removes every flag of this group (and attached file transfers). */
  public reset(): this {
    return this.unsetFlags(groupFlags(this.groupName));
  }
}

function shellQuote(arg: string): string {
  return /^[\w\-=./:@,]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}
