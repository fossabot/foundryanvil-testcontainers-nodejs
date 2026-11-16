/**
 * Parity between the library's flag rules and the REAL anvil binary.
 *
 * The unit tests prove the fluent API enforces the rules encoded in the flag
 * registry. These tests prove the registry matches anvil itself:
 *
 * 1. every single flag and every pair of flags the library can render is run
 *    through anvil's argument parser (`<args> completions bash`, which
 *    validates all `clap` rules and values and exits immediately) and the
 *    verdict (ok / conflict / missing requirement) must match the registry;
 * 2. every flag, every hardfork and a maximal configuration rendered by the
 *    library actually boot a node;
 * 3. the runtime-only rules the library enforces (hardfork families) are
 *    really rejected by anvil.
 *
 * Deliberately stricter library rules are listed in `FlagSpec.stricterThanAnvil`.
 */
import {
  AnvilFlag,
  AnvilOptions,
  getFlagSpec,
  Hardfork,
  OpHardfork,
} from "../../src";
import {
  CliCase,
  CliResult,
  describeE2E,
  E2E_MODE,
  FIXTURES,
  runCliBatch,
  runScriptBatchLocally,
} from "../helpers/e2e";
import { FLAG_SETTERS, SETTABLE_FLAGS } from "../helpers/setters";

jest.setTimeout(900_000);

type SettableFlag = (typeof SETTABLE_FLAGS)[number];
type Verdict = "ok" | "conflict" | "missing" | "other";

/** Files referenced by the setter catalog that anvil reads while parsing. */
const FILES = {
  "/tmp/l.json": FIXTURES.state,
  "/tmp/genesis.json": FIXTURES.genesis,
};

/** Library-rendered arguments for a set of flags (bypassing eager conflict checks). */
function render(flags: readonly SettableFlag[]): string[] {
  const args: string[] = [];
  for (const flag of flags) {
    const options = new AnvilOptions();
    FLAG_SETTERS[flag](options);
    args.push(...options.toArgs().slice(2)); // drop the managed "--host 0.0.0.0"
  }
  return args;
}

function unmetRequirements(flags: ReadonlySet<AnvilFlag>): AnvilFlag[] {
  return [...flags].filter((flag) => {
    const spec = getFlagSpec(flag);
    return (
      spec.requires.some((required) => !flags.has(required)) ||
      (spec.requiresAnyOf.length > 0 &&
        !spec.requiresAnyOf.some((candidate) => flags.has(candidate)))
    );
  });
}

function libraryVerdict(
  flags: readonly SettableFlag[],
): Exclude<Verdict, "other"> {
  for (const a of flags) {
    for (const b of flags) {
      if (a !== b && getFlagSpec(a).conflicts.includes(b)) return "conflict";
    }
  }
  return unmetRequirements(new Set(flags)).length > 0 ? "missing" : "ok";
}

function clapVerdict(result: CliResult): Verdict {
  if (result.exitCode === 0) return "ok";
  if (/cannot be used with/.test(result.error)) return "conflict";
  if (/required arguments were not provided/.test(result.error))
    return "missing";
  return "other";
}

/** Verdicts anvil may legitimately return for a given library verdict. */
function acceptableClapVerdicts(flags: readonly SettableFlag[]): Verdict[] {
  const verdict = libraryVerdict(flags);
  const unmet = unmetRequirements(new Set(flags));
  if (verdict === "conflict")
    return unmet.length > 0 ? ["conflict", "missing"] : ["conflict"];
  if (verdict === "missing") {
    const onlyStricter = unmet.every(
      (flag) => getFlagSpec(flag).stricterThanAnvil,
    );
    return onlyStricter ? ["ok", "missing"] : ["missing"];
  }
  return ["ok"];
}

describeE2E(`anvil CLI parity (${E2E_MODE} mode)`, () => {
  describe("argument parser", () => {
    const combos: SettableFlag[][] = [];
    for (const flag of SETTABLE_FLAGS) combos.push([flag]);
    for (let i = 0; i < SETTABLE_FLAGS.length; i++) {
      for (let j = i + 1; j < SETTABLE_FLAGS.length; j++) {
        combos.push([SETTABLE_FLAGS[i], SETTABLE_FLAGS[j]]);
      }
    }
    let results: CliResult[] = [];

    beforeAll(async () => {
      const cases: CliCase[] = combos.map((flags) => ({
        args: render(flags),
        mode: "parse",
        files: FILES,
      }));
      results = await runCliBatch(cases);
    });

    it(`covers ${SETTABLE_FLAGS.length} single flags and every pair`, () => {
      const n = SETTABLE_FLAGS.length;
      expect(results).toHaveLength(n + (n * (n - 1)) / 2);
    });

    it("accepts every value the library renders (no parse errors other than rule violations)", () => {
      const failures = combos
        .map((flags, index) => ({ flags, result: results[index] }))
        .filter(({ result }) => clapVerdict(result) === "other")
        .map(({ flags, result }) => `${flags.join(" + ")}: ${result.error}`);
      expect(failures).toEqual([]);
    });

    it("agrees with the registry on every single flag and every pair", () => {
      const mismatches: string[] = [];
      combos.forEach((flags, index) => {
        const actual = clapVerdict(results[index]);
        const acceptable = acceptableClapVerdicts(flags);
        if (!acceptable.includes(actual)) {
          mismatches.push(
            `${flags.join(" + ")}: anvil=${actual} library=${libraryVerdict(flags)} (${results[index].error})`,
          );
        }
      });
      expect(mismatches).toEqual([]);
    });

    it("never lets a configuration through that anvil's parser rejects", () => {
      const leaks = combos
        .map((flags, index) => ({ flags, actual: clapVerdict(results[index]) }))
        .filter(
          ({ flags, actual }) =>
            libraryVerdict(flags) === "ok" && actual !== "ok",
        )
        .map(({ flags, actual }) => `${flags.join(" + ")} → anvil ${actual}`);
      expect(leaks).toEqual([]);
    });
  });

  describe("runtime", () => {
    const FORK_FLAGS = new Set<AnvilFlag>(
      SETTABLE_FLAGS.filter(
        (flag) =>
          flag === "--fork-url" ||
          getFlagSpec(flag).requires.includes("--fork-url"),
      ),
    );

    /** Library-built, validated args for `flags` plus the minimal dependencies. */
    function bootArgs(flags: readonly SettableFlag[]): string[] {
      const options = new AnvilOptions();
      for (const flag of flags) FLAG_SETTERS[flag](options);
      if (options.has("--mixed-mining") && !options.has("--block-time")) {
        options.mining.withBlockTime(1);
      }
      if (
        (options.has("--state-interval") ||
          options.has("--preserve-historical-states")) &&
        !options.has("--dump-state") &&
        !options.has("--state")
      ) {
        FLAG_SETTERS["--dump-state"](options);
      }
      options.unset("--port"); // never pin a port; "--port 0" is appended below
      const args = [...options.build().args];
      return [...args, "--port", "0"];
    }

    const bootable = SETTABLE_FLAGS.filter(
      (flag) => !FORK_FLAGS.has(flag) && flag !== "--port",
    );

    const hardforks = Object.values(Hardfork).filter(
      (h) => h !== Hardfork.Latest,
    );
    const opHardforks = Object.values(OpHardfork);

    const bootCases: Array<{
      name: string;
      case: CliCase;
      expectBoot: boolean;
      error?: RegExp;
    }> = [
      ...bootable.map((flag) => ({
        name: `flag ${flag}`,
        case: { args: bootArgs([flag]), mode: "boot" as const, files: FILES },
        expectBoot: true,
      })),
      ...hardforks.map((hardfork) => ({
        name: `hardfork ${hardfork}`,
        case: {
          args: new AnvilOptions().evm
            .withHardfork(hardfork)
            .build()
            .args.concat(["--port", "0"]),
          mode: "boot" as const,
        },
        expectBoot: true,
      })),
      ...opHardforks.map((hardfork) => ({
        name: `optimism hardfork ${hardfork}`,
        case: {
          args: new AnvilOptions().network
            .withOptimism()
            .evm.withHardfork(hardfork)
            .build()
            .args.concat(["--port", "0"]),
          mode: "boot" as const,
        },
        expectBoot: true,
      })),
      // Runtime rules the library enforces up-front: anvil really rejects these.
      {
        name: "Ethereum hardfork with --optimism is rejected",
        case: {
          args: ["--optimism", "--hardfork", "cancun", "--port", "0"],
          mode: "boot",
        },
        expectBoot: false,
        error: /unknown hardfork/i,
      },
      {
        name: "Optimism hardfork without --optimism is rejected",
        case: { args: ["--hardfork", "ecotone", "--port", "0"], mode: "boot" },
        expectBoot: false,
        error: /unknown hardfork/i,
      },
      {
        name: "literal 'latest' is rejected (why Hardfork.Latest omits the flag)",
        case: { args: ["--hardfork", "latest", "--port", "0"], mode: "boot" },
        expectBoot: false,
        error: /unknown hardfork/i,
      },
    ];

    // A maximal, valid, non-fork configuration built greedily by the library.
    const maximal: SettableFlag[] = [];
    for (const flag of bootable) {
      if (maximal.some((other) => getFlagSpec(flag).conflicts.includes(other)))
        continue;
      if (flag === "--hardfork" && maximal.includes("--optimism")) continue;
      maximal.push(flag);
    }
    if (maximal.includes("--hardfork") && maximal.includes("--optimism")) {
      maximal.splice(maximal.indexOf("--optimism"), 1);
    }
    bootCases.push({
      name: `maximal configuration (${maximal.length} flags)`,
      case: { args: bootArgs(maximal), mode: "boot", files: FILES },
      expectBoot: true,
    });

    let results: CliResult[] = [];

    beforeAll(async () => {
      results = await runCliBatch(bootCases.map((entry) => entry.case));
    });

    it("boots with every configurable (non-fork) flag, every hardfork and a maximal configuration", () => {
      const failures = bootCases
        .map((entry, index) => ({ entry, result: results[index] }))
        .filter(({ entry, result }) => entry.expectBoot && !result.booted)
        .map(
          ({ entry, result }) =>
            `${entry.name}: exit ${result.exitCode} – ${result.error} [${entry.case.args.join(" ")}]`,
        );
      expect(failures).toEqual([]);
      expect(maximal.length).toBeGreaterThanOrEqual(35);
    });

    it("anvil rejects what the library rejects at runtime", () => {
      bootCases.forEach((entry, index) => {
        if (entry.expectBoot) return;
        expect(results[index].booted).toBe(false);
        expect(results[index].error).toMatch(entry.error!);
      });
    });
  });

  // In --no-docker mode, also verify the shell script that CI runs inside the
  // container, by executing it with `sh` against the local binary.
  (E2E_MODE === "local" ? describe : describe.skip)(
    "Docker-mode batch script (executed locally)",
    () => {
      const sample: CliCase[] = [];
      for (let i = 0; i < SETTABLE_FLAGS.length; i += 5) {
        for (let j = i + 1; j < SETTABLE_FLAGS.length; j += 11) {
          const flags = [SETTABLE_FLAGS[i], SETTABLE_FLAGS[j]];
          if (
            flags.some((flag) => flag === "--load-state" || flag === "--init")
          )
            continue;
          sample.push({ args: render(flags), mode: "parse" });
        }
      }
      sample.push(
        { args: ["--hardfork", "cancun", "--port", "0"], mode: "boot" },
        { args: ["--hardfork", "latest", "--port", "0"], mode: "boot" },
        {
          args: ["--optimism", "--hardfork", "ecotone", "--port", "0"],
          mode: "boot",
        },
        {
          args: ["--mnemonic", "it's a 'quoted' value", "--port", "0"],
          mode: "parse",
        },
      );

      const summarise = (results: CliResult[]) =>
        results.map((result) =>
          result.booted ? "booted" : `exit ${result.exitCode}`,
        );

      let direct: CliResult[] = [];
      beforeAll(async () => {
        direct = await runCliBatch(sample);
      });

      it.each([
        ["with timeout(1)", false],
        ["with the shell fallback for images without timeout(1)", true],
      ])(
        "matches the direct runner %s",
        async (_label, forceTimeoutFallback) => {
          const viaScript = await runScriptBatchLocally(sample, {
            forceTimeoutFallback,
          });
          expect(summarise(viaScript)).toEqual(summarise(direct));
          viaScript.forEach((result, index) => {
            if (!result.booted && result.exitCode !== 0) {
              expect(result.error.length).toBeGreaterThan(0);
              expect(clapVerdict(result)).toBe(clapVerdict(direct[index]));
            }
          });
          expect(sample.length).toBeGreaterThan(40);
        },
      );
    },
  );
});
