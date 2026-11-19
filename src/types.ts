/** `-v` level: the value is the number of `v`s. */
export enum LogVerbosity {
  One = 1,
  Two = 2,
  Three = 3,
  Four = 4,
  Five = 5,
}

/**
 * Ethereum hardforks for `--hardfork` (not valid with `--optimism`).
 * `Latest` means anvil's default and omits the flag.
 */
export enum Hardfork {
  Frontier = "frontier",
  Homestead = "homestead",
  Dao = "dao",
  Tangerine = "tangerine",
  SpuriousDragon = "spuriousdragon",
  Byzantium = "byzantium",
  Constantinople = "constantinople",
  Petersburg = "petersburg",
  Istanbul = "istanbul",
  MuirGlacier = "muirglacier",
  Berlin = "berlin",
  London = "london",
  ArrowGlacier = "arrowglacier",
  GrayGlacier = "grayglacier",
  Paris = "paris",
  Shanghai = "shanghai",
  Cancun = "cancun",
  Prague = "prague",
  Osaka = "osaka",
  Latest = "latest",
}

/** OP Stack hardforks for `--hardfork`; require `--optimism`. */
export enum OpHardfork {
  Bedrock = "bedrock",
  Regolith = "regolith",
  Canyon = "canyon",
  Ecotone = "ecotone",
  Fjord = "fjord",
  Granite = "granite",
  Holocene = "holocene",
  Isthmus = "isthmus",
  Interop = "interop",
  Jovian = "jovian",
}

/** Mempool ordering for `--order` (default `fees`). */
export enum Order {
  Fees = "fees",
  Fifo = "fifo",
}

/** Log colouring for `--color` (default `auto`). */
export enum Color {
  Auto = "auto",
  Always = "always",
  Never = "never",
}

/** `0x`-prefixed hex string. */
export type HexString = `0x${string}`;
/** 20-byte address. */
export type Address = HexString;
/** 32-byte transaction hash. */
export type TransactionHash = HexString;

/** A path inside the container, used verbatim (see {@link containerPath}). */
export interface ContainerPath {
  readonly containerPath: string;
}

/** Host path (string, resolved against cwd and copied) or {@link ContainerPath}. */
export type FilePath = string | ContainerPath;

/**
 * A path inside the container (e.g. in your image): passed through, not copied.
 * @example new AnvilOptions().state.withLoadState(containerPath("/data/state.json"))
 */
export function containerPath(path: string): ContainerPath {
  if (typeof path !== "string" || path.trim().length === 0) {
    throw new TypeError("containerPath() requires a non-empty path");
  }
  if (!path.startsWith("/")) {
    throw new TypeError(
      `containerPath() requires an absolute path inside the container, received "${path}"`,
    );
  }
  return { containerPath: path };
}

/** Type guard for {@link ContainerPath}. */
export function isContainerPath(value: unknown): value is ContainerPath {
  return typeof (value as ContainerPath | null)?.containerPath === "string";
}

/** A dev account of a started node. */
export interface AnvilAccount {
  readonly index: number;
  readonly address: Address;
  /** `undefined` for random or seeded mnemonics with `--quiet`. */
  readonly privateKey?: HexString;
}
