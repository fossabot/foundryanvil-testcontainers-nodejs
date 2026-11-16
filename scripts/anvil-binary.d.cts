/** A resolved anvil executable and where it came from. */
export interface ResolvedAnvilBinary {
  readonly path: string;
  readonly source: string;
}
/** See scripts/anvil-binary.cjs. */
export declare function resolveAnvilBinary(
  env?: NodeJS.ProcessEnv,
  fromDir?: string,
): ResolvedAnvilBinary | undefined;
/** The binary shipped with the `@foundry-rs/anvil` devDependency, if installed. */
export declare function bundledAnvil(fromDir?: string): ResolvedAnvilBinary | undefined;
/** npm package containing the prebuilt binary for this platform, if any. */
export declare function platformPackageName(): string | undefined;
