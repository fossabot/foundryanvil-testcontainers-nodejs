import * as fs from "node:fs";
import * as path from "node:path";
import {
  ANVIL_FLAG_LIST,
  ANVIL_FLAGS,
  AnvilFlag,
  getFlagSpec,
  isAnvilFlag,
} from "../../../src";
import { SETTABLE_FLAGS } from "../../helpers/setters";

const HELP_FILE = path.resolve(__dirname, "../../fixtures/anvil-help.txt");
/** The options reference of the docs site (tables generated from this registry). */
const REFERENCE_FILE = path.resolve(
  __dirname,
  "../../../docs/content/reference/anvil-options.md",
);

/** Flags printed by `anvil --help` that are not node configuration. */
const NON_CONFIG_FLAGS = new Set(["--help", "-h", "--version", "-V"]);

function flagsInHelp(): Set<string> {
  const text = fs.readFileSync(HELP_FILE, "utf8");
  const flags = new Set<string>();
  for (const match of text.matchAll(/(?<![\w-])(--[a-zA-Z][\w-]*)/g)) {
    flags.add(match[1]);
  }
  // Short forms are printed as "-a, --accounts".
  for (const match of text.matchAll(/^\s*(-[a-zA-Z]),\s+--/gm)) {
    flags.add(match[1]);
  }
  return flags;
}

describe("anvil flag registry", () => {
  it("contains every flag (and alias) printed by `anvil --help`", () => {
    const known = new Set<string>();
    for (const spec of ANVIL_FLAG_LIST) {
      known.add(spec.flag);
      for (const alias of spec.aliases) known.add(alias);
    }
    // Aliases documented in the anvil source but not printed in --help.
    const undocumentedAliases = new Set([
      "--cups",
      "--chain",
      "--no-gas-limit",
      "--block-gas-limit",
    ]);

    const inHelp = flagsInHelp();
    const missing = [...inHelp].filter(
      (flag) => !known.has(flag) && !NON_CONFIG_FLAGS.has(flag),
    );
    expect(missing).toEqual([]);

    const extra = [...known].filter(
      (flag) => !inHelp.has(flag) && !undocumentedAliases.has(flag),
    );
    expect(extra).toEqual([]);
  });

  it("has a unique canonical flag per entry and keeps help order", () => {
    const flags = ANVIL_FLAG_LIST.map((spec) => spec.flag);
    expect(new Set(flags).size).toBe(flags.length);
    expect(flags[0]).toBe("--accounts");
    expect(flags[flags.length - 1]).toBe("--optimism");
    expect(ANVIL_FLAGS.size).toBe(flags.length);
  });

  it("normalises conflicts to be symmetric and never self-referential", () => {
    for (const spec of ANVIL_FLAG_LIST) {
      expect(spec.conflicts).not.toContain(spec.flag);
      for (const other of spec.conflicts) {
        expect(getFlagSpec(other).conflicts).toContain(spec.flag);
      }
    }
  });

  it("only references known flags in conflicts / requires", () => {
    for (const spec of ANVIL_FLAG_LIST) {
      for (const other of [
        ...spec.conflicts,
        ...spec.requires,
        ...spec.requiresAnyOf,
      ]) {
        expect(isAnvilFlag(other)).toBe(true);
      }
    }
  });

  it("never requires a flag it also conflicts with", () => {
    for (const spec of ANVIL_FLAG_LIST) {
      for (const required of [...spec.requires, ...spec.requiresAnyOf]) {
        expect(spec.conflicts).not.toContain(required);
      }
    }
  });

  it("mirrors anvil's clap rules", () => {
    const conflicts = (flag: AnvilFlag) => [...getFlagSpec(flag).conflicts];
    expect(conflicts("--mnemonic").sort()).toEqual([
      "--mnemonic-random",
      "--mnemonic-seed-unsafe",
    ]);
    expect(conflicts("--no-mining")).toEqual(["--block-time"]);
    expect(conflicts("--state").sort()).toEqual([
      "--dump-state",
      "--init",
      "--load-state",
    ]);
    expect(conflicts("--init").sort()).toEqual([
      "--dump-state",
      "--load-state",
      "--preserve-historical-states",
      "--state",
    ]);
    expect(conflicts("--max-persisted-states")).toEqual(["--prune-history"]);
    expect(conflicts("--no-cors")).toEqual(["--allow-origin"]);
    expect(conflicts("--fork-transaction-hash")).toEqual([
      "--fork-block-number",
    ]);
    expect(conflicts("--disable-block-gas-limit")).toEqual(["--gas-limit"]);
    expect(conflicts("--disable-code-size-limit")).toEqual([
      "--code-size-limit",
    ]);
    expect(conflicts("--quiet").sort()).toEqual(["--json", "--verbosity"]);
    expect(conflicts("--md").sort()).toEqual(["--json"]);
    expect(conflicts("--celo")).toEqual(["--optimism"]);
    expect(conflicts("--json").sort()).toEqual(["--color", "--md", "--quiet"]);

    expect(getFlagSpec("--mixed-mining").requires).toEqual(["--block-time"]);
    for (const flag of [
      "--fork-block-number",
      "--fork-transaction-hash",
      "--fork-chain-id",
      "--fork-header",
      "--fork-retry-backoff",
      "--retries",
      "--timeout",
      "--compute-units-per-second",
      "--no-rate-limit",
      "--no-storage-caching",
    ] as const) {
      expect(getFlagSpec(flag).requires).toEqual(["--fork-url"]);
    }
    expect(getFlagSpec("--state-interval").requiresAnyOf).toEqual([
      "--dump-state",
      "--state",
    ]);
    expect(getFlagSpec("--fork-chain-id").requiresAnyOf).toEqual([
      "--fork-block-number",
      "--fork-transaction-hash",
    ]);
  });

  it("documents every rule that is stricter than anvil's parser", () => {
    const stricter = ANVIL_FLAG_LIST.filter(
      (spec) => spec.stricterThanAnvil,
    ).map((spec) => spec.flag);
    expect(stricter.sort()).toEqual([
      "--mixed-mining",
      "--preserve-historical-states",
      "--state-interval",
    ]);
  });

  it("exposes exactly one managed flag (--host)", () => {
    const managed = ANVIL_FLAG_LIST.filter((spec) => spec.managed);
    expect(managed.map((spec) => spec.flag)).toEqual(["--host"]);
    expect(getFlagSpec("--host").methods).toEqual([]);
  });

  it("documents at least one fluent method for every configurable flag", () => {
    for (const spec of ANVIL_FLAG_LIST) {
      if (spec.managed) continue;
      expect(spec.methods.length).toBeGreaterThan(0);
      expect(spec.description.length).toBeGreaterThan(0);
      expect(spec.category.length).toBeGreaterThan(0);
    }
  });

  it("is fully covered by the fluent API setter catalog", () => {
    const configurable = ANVIL_FLAG_LIST.filter((spec) => !spec.managed).map(
      (spec) => spec.flag,
    );
    expect([...SETTABLE_FLAGS].sort()).toEqual([...configurable].sort());
  });

  it("is fully documented in the docs reference (`pnpm docs:sync` regenerates it)", () => {
    const reference = fs.readFileSync(REFERENCE_FILE, "utf8");
    const undocumentedFlags = ANVIL_FLAG_LIST.filter(
      (spec) => !reference.includes(`\`${spec.flag}\``),
    ).map((spec) => spec.flag);
    expect(undocumentedFlags).toEqual([]);

    // Tables are per group, so methods appear without the group prefix.
    const undocumentedMethods = ANVIL_FLAG_LIST.flatMap((spec) =>
      spec.methods.filter(
        (method) => !reference.includes(`\`${method.replace(/^\w+\./, "")}\``),
      ),
    );
    expect(undocumentedMethods).toEqual([]);
  });

  it("getFlagSpec throws for unknown flags", () => {
    expect(() => getFlagSpec("--nope" as AnvilFlag)).toThrow(
      "Unknown anvil flag: --nope",
    );
    expect(isAnvilFlag("--accounts")).toBe(true);
    expect(isAnvilFlag("--nope")).toBe(false);
  });

  it("is immutable", () => {
    const spec = getFlagSpec("--accounts");
    expect(Object.isFrozen(spec)).toBe(true);
    expect(Object.isFrozen(spec.conflicts)).toBe(true);
    expect(Object.isFrozen(ANVIL_FLAG_LIST)).toBe(true);
  });
});
