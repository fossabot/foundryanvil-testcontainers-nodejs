/**
 * The library as built from this checkout (`<repo>/dist`), for reference
 * tables generated from its flag registry and exports.
 */
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";

/** A flag of the library's registry (`ANVIL_FLAG_LIST`). */
export interface FlagSpec {
  readonly flag: string;
  readonly aliases: readonly string[];
  readonly category: string;
  readonly kind: string;
  readonly description: string;
  readonly methods: readonly string[];
  readonly conflicts: readonly string[];
  readonly requires: readonly string[];
  readonly requiresAnyOf: readonly string[];
  readonly managed: boolean;
  readonly stricterThanAnvil?: string;
}

/** The parts of the library's runtime API the generators read. */
export interface Library {
  readonly ANVIL_FLAG_LIST: readonly FlagSpec[];
  readonly ANVIL_TEST_CLIENT_ERROR_CODES: Readonly<Record<string, string>>;
  groupFlags(group: string): readonly string[];
  readonly [name: string]: unknown;
}

/** The built entry point of the library checkout. */
export function libraryEntry(repoRoot: string): string {
  return path.join(repoRoot, "dist", "index.cjs");
}

/**
 * Loads `<repoRoot>/dist/index.cjs` (with the checkout's own dependencies).
 * @throws Error with a hint when the library has not been built.
 */
export function loadLibrary(repoRoot: string): Library {
  const entry = libraryEntry(repoRoot);
  if (!fs.existsSync(entry)) {
    throw new Error(
      `${entry} is missing: build the library first (\`pnpm build\` in ${repoRoot}, or use the root \`pnpm docs:*\` scripts)`,
    );
  }
  return createRequire(path.join(repoRoot, "package.json"))(entry) as Library;
}

/** Requires a module as the library resolves it (e.g. its own `viem`). */
export function requireFromLibrary(repoRoot: string, id: string): unknown {
  return createRequire(path.join(repoRoot, "package.json"))(id);
}
