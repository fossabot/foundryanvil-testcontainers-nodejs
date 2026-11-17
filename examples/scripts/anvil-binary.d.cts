/** Where a local anvil binary was found. */
export interface AnvilBinary {
  readonly path: string;
  readonly source: string;
}
export declare function resolveAnvilBinary(
  env?: NodeJS.ProcessEnv,
): AnvilBinary | undefined;
