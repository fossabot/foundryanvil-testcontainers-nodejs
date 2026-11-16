/**
 * Combination tests: every flag against every other flag (pairwise matrix),
 * seeded random n-way permutations and "maximal" configurations.
 *
 * Expectations are derived from the flag registry. Cases are checked in plain
 * code and mismatches collected, then asserted once per group: identical
 * coverage, a fraction of Jest's per-assertion overhead, and failures list
 * every offending case at once.
 */
import {
  ANVIL_FLAG_LIST,
  AnvilConfigurationError,
  AnvilFlag,
  AnvilOptions,
  getFlagSpec,
  Hardfork,
  OpHardfork,
} from "../../../src";
import {
  applyFlag,
  flagsInArgs,
  seededRandom,
  SETTABLE_FLAGS,
  shuffle,
} from "../../helpers/setters";

type SettableFlag = (typeof SETTABLE_FLAGS)[number];

const conflicts = (a: AnvilFlag, b: AnvilFlag) =>
  getFlagSpec(a).conflicts.includes(b);
const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((item) => b.has(item));
const show = (set: ReadonlySet<string>) => `{${[...set].sort().join(", ")}}`;

/** Flags `problems()` must report for a conflict-free set configured via the catalog. */
function expectedProblems(flags: ReadonlySet<AnvilFlag>): Set<AnvilFlag> {
  const problems = new Set<AnvilFlag>();
  for (const flag of flags) {
    const spec = getFlagSpec(flag);
    const unmetAll = spec.requires.some((required) => !flags.has(required));
    const unmetAny =
      spec.requiresAnyOf.length > 0 &&
      !spec.requiresAnyOf.some((c) => flags.has(c));
    if (unmetAll || unmetAny) problems.add(flag);
  }
  // The catalog uses an Ethereum hardfork, which is invalid with --optimism.
  if (flags.has("--hardfork") && flags.has("--optimism"))
    problems.add("--hardfork");
  return problems;
}

function configure(flags: readonly SettableFlag[]): AnvilOptions {
  const options = new AnvilOptions();
  for (const flag of flags) applyFlag(options, flag);
  return options;
}

const reported = (options: AnvilOptions) =>
  new Set<string>(options.problems().map((problem) => problem.flag!));

const renderedFlags = (options: AnvilOptions) => {
  const flags = flagsInArgs(options.toArgs());
  flags.delete("--host");
  return flags;
};

describe("flag coverage matrix", () => {
  it("configures and renders every flag through its fluent method", () => {
    const mismatches: string[] = [];
    for (const flag of SETTABLE_FLAGS) {
      const options = configure([flag]);
      if (!options.has(flag)) mismatches.push(`${flag}: not configured`);
      if (!sameSet(renderedFlags(options), new Set([flag]))) {
        mismatches.push(`${flag}: rendered ${show(renderedFlags(options))}`);
      }
      const expected = expectedProblems(new Set([flag]));
      if (!sameSet(reported(options), expected)) {
        mismatches.push(
          `${flag}: problems ${show(reported(options))} ≠ ${show(expected)}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("every configurable flag is exercised (registry ⇔ catalog)", () => {
    const configurable = ANVIL_FLAG_LIST.filter((spec) => !spec.managed).map(
      (s) => s.flag,
    );
    expect([...SETTABLE_FLAGS].sort()).toEqual(configurable.sort());
  });
});

describe("pairwise combinations (every ordered pair of flags)", () => {
  /** Checks one ordered pair; returns mismatch descriptions. */
  function checkPair(first: SettableFlag, second: SettableFlag): string[] {
    const pair = `${first} + ${second}`;
    const options = configure([first]);

    if (conflicts(first, second)) {
      let thrown: unknown;
      try {
        applyFlag(options, second);
      } catch (error) {
        thrown = error;
      }
      if (!(thrown instanceof AnvilConfigurationError))
        return [`${pair}: conflict not rejected`];
      const issues: string[] = [];
      if (thrown.flag !== second || !thrown.relatedFlags.includes(first)) {
        issues.push(
          `${pair}: wrong error metadata (${thrown.flag} / ${thrown.relatedFlags.join()})`,
        );
      }
      if (!thrown.message.includes(first) || !thrown.message.includes(second)) {
        issues.push(`${pair}: message does not name both flags`);
      }
      if (!options.has(first) || options.has(second)) {
        issues.push(`${pair}: failed call modified the configuration`);
      }
      return issues;
    }

    applyFlag(options, second);
    const issues: string[] = [];
    if (!sameSet(renderedFlags(options), new Set([first, second]))) {
      issues.push(`${pair}: rendered ${show(renderedFlags(options))}`);
    }
    const expected = expectedProblems(new Set([first, second]));
    const actual = reported(options);
    if (!sameSet(actual, expected)) {
      issues.push(`${pair}: problems ${show(actual)} ≠ ${show(expected)}`);
    }
    // Order independence: the rendered command is canonical.
    if (
      configure([second, first]).toArgs().join(" ") !==
      options.toArgs().join(" ")
    ) {
      issues.push(`${pair}: rendering depends on call order`);
    }
    // build() succeeds exactly when there are no problems.
    let built = true;
    try {
      options.build();
    } catch (error) {
      built = false;
      if (!(error instanceof AnvilConfigurationError))
        issues.push(`${pair}: build threw ${String(error)}`);
    }
    if (built !== (actual.size === 0))
      issues.push(
        `${pair}: build() ${built ? "passed" : "failed"} unexpectedly`,
      );
    return issues;
  }

  it.each(SETTABLE_FLAGS)("%s combined with every other flag", (first) => {
    const mismatches = SETTABLE_FLAGS.filter(
      (second) => second !== first,
    ).flatMap((second) => checkPair(first, second));
    expect(mismatches).toEqual([]);
  });
});

describe("random n-way permutations (seeded)", () => {
  /** Applies a random subset in random order; returns mismatch descriptions. */
  function checkSeed(seed: number): string[] {
    const random = seededRandom(seed * 7919);
    const picked = shuffle(SETTABLE_FLAGS, random).slice(
      0,
      2 + Math.floor(random() * 14),
    );
    const issues: string[] = [];
    const options = new AnvilOptions();
    const applied = new Set<SettableFlag>();
    for (const flag of picked) {
      try {
        applyFlag(options, flag);
        applied.add(flag);
      } catch (error) {
        const conflicting = [...applied].filter((other) =>
          conflicts(flag, other),
        );
        if (
          !(error instanceof AnvilConfigurationError) ||
          conflicting.length === 0
        ) {
          issues.push(
            `seed ${seed}: ${flag} rejected without a conflict (${String(error)})`,
          );
        } else if (
          !conflicting.includes(error.relatedFlags[0] as SettableFlag)
        ) {
          issues.push(
            `seed ${seed}: ${flag} blamed ${error.relatedFlags[0]}, not one of ${conflicting.join(", ")}`,
          );
        }
      }
    }
    for (const a of applied) {
      for (const b of applied) {
        if (a !== b && conflicts(a, b))
          issues.push(`seed ${seed}: ${a} and ${b} both applied`);
      }
    }
    if (!sameSet(renderedFlags(options), applied)) {
      issues.push(
        `seed ${seed}: rendered ${show(renderedFlags(options))} ≠ ${show(applied)}`,
      );
    }
    const expected = expectedProblems(applied);
    const actual = reported(options);
    if (!sameSet(actual, expected)) {
      issues.push(`seed ${seed}: problems ${show(actual)} ≠ ${show(expected)}`);
    }
    if (actual.size === 0) {
      if (options.build().args.join(" ") !== options.toArgs().join(" ")) {
        issues.push(`seed ${seed}: build().args differ from toArgs()`);
      }
    } else {
      try {
        options.build();
        issues.push(`seed ${seed}: build() passed despite problems`);
      } catch {
        // expected
      }
    }
    const canonical = configure(
      ANVIL_FLAG_LIST.map((spec) => spec.flag).filter(
        (flag): flag is SettableFlag => applied.has(flag as SettableFlag),
      ),
    );
    const rendered = options.toArgs().join(" ");
    if (canonical.toArgs().join(" ") !== rendered)
      issues.push(`seed ${seed}: not canonical`);
    if (options.clone().toArgs().join(" ") !== rendered)
      issues.push(`seed ${seed}: clone differs`);
    return issues;
  }

  const BATCHES = 8;
  const PER_BATCH = 50;
  it.each(Array.from({ length: BATCHES }, (_, batch) => batch))(
    `seeds batch %s (${PER_BATCH} permutations each)`,
    (batch) => {
      const mismatches: string[] = [];
      for (let i = 1; i <= PER_BATCH; i++)
        mismatches.push(...checkSeed(batch * PER_BATCH + i));
      expect(mismatches).toEqual([]);
    },
  );
});

describe("maximal configurations", () => {
  /** Largest conflict-free set containing `seed` (registry order), minus unmet dependencies. */
  function maximalSetContaining(seed?: SettableFlag): SettableFlag[] {
    const chosen: SettableFlag[] = seed ? [seed] : [];
    for (const flag of SETTABLE_FLAGS) {
      if (
        !chosen.includes(flag) &&
        !chosen.some((other) => conflicts(flag, other))
      )
        chosen.push(flag);
    }
    if (chosen.includes("--hardfork") && chosen.includes("--optimism")) {
      chosen.splice(
        chosen.indexOf(seed === "--optimism" ? "--hardfork" : "--optimism"),
        1,
      );
    }
    for (let changed = true; changed;) {
      changed = false;
      for (const flag of [...chosen]) {
        if (flag === seed) continue;
        const set = new Set<AnvilFlag>(chosen);
        const spec = getFlagSpec(flag);
        if (
          spec.requires.some((required) => !set.has(required)) ||
          (spec.requiresAnyOf.length > 0 &&
            !spec.requiresAnyOf.some((c) => set.has(c)))
        ) {
          chosen.splice(chosen.indexOf(flag), 1);
          changed = true;
        }
      }
    }
    return chosen;
  }

  it("the greedy maximal set is large and builds", () => {
    const flags = maximalSetContaining();
    expect(flags.length).toBeGreaterThanOrEqual(50);
    const options = configure(flags);
    expect(options.problems()).toEqual([]);
    options.build();
    expect(renderedFlags(options)).toEqual(new Set(flags));
  });

  it("every flag builds inside a maximal compatible configuration", () => {
    const mismatches: string[] = [];
    for (const flag of SETTABLE_FLAGS) {
      const flags = maximalSetContaining(flag);
      const problems = configure(flags).problems();
      if (!flags.includes(flag) || flags.length < 40 || problems.length > 0) {
        mismatches.push(
          `${flag}: ${flags.length} flags, problems: ${problems.map((p) => p.message).join("; ")}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("supports an Optimism configuration with an OP hardfork inside the maximal set", () => {
    const flags = maximalSetContaining("--optimism").filter(
      (flag) => flag !== "--hardfork",
    );
    expect(flags).not.toContain("--celo");
    const options = configure(flags);
    options.evm.withHardfork(OpHardfork.Jovian);
    expect(options.problems()).toEqual([]);
    options.evm.withHardfork(Hardfork.Prague);
    expect(options.problems().map((p) => p.flag)).toEqual(["--hardfork"]);
    options.evm.withHardfork(Hardfork.Latest);
    expect(options.problems()).toEqual([]);
  });
});
