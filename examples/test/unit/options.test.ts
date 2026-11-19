/**
 * Composing, inspecting and validating anvil options without starting a
 * node: presets, raw arguments, the rendered command line, file transfers,
 * the flag registry, and options that only change how anvil runs (network
 * modes, log formats, server paths, limits).
 */
import * as path from "node:path";
import {
  ANVIL_FLAG_LIST,
  ANVIL_FLAGS,
  AnvilConfigurationError,
  AnvilOptions,
  containerPath,
  durationToSeconds,
  getFlagSpec,
  groupFlags,
  Hardfork,
  isAnvilFlag,
  isContainerPath,
  LogVerbosity,
  OpHardfork,
  timestampToSeconds,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";

describe("composing options", () => {
  it("builds suites from shared presets", () => {
    // #region compose
    const richAccounts = (options: AnvilOptions) =>
      options.account.withAccounts(3).withBalance(1_000_000);
    const fastBlocks = (options: AnvilOptions) =>
      options.mining.withBlockTime(1);

    const base = new AnvilOptions().apply(richAccounts); // run presets
    const ci = base.clone().apply(fastBlocks); // independent copy
    const onDemand = ci.clone().unset("--block-time").mining.withNoMining(); // swap a conflicting flag

    expect(base.toCommand()).toBe(
      "anvil --host 0.0.0.0 --accounts 3 --balance 1000000",
    );
    expect(ci.has("--block-time")).toBe(true);
    expect(onDemand.root().toArgs()).toContain("--no-mining");
    // #endregion compose
  });

  it("passes flags newer than the library through", () => {
    // #region extra-args
    const options = new AnvilOptions().withExtraArgs("--some-new-flag", "1");
    expect(options.toCommand()).toBe("anvil --host 0.0.0.0 --some-new-flag 1");

    // Known flags must use the fluent API, so validation cannot be bypassed.
    expect(() => new AnvilOptions().withExtraArgs("--accounts", "1")).toThrow(
      /known anvil flag/,
    );
    // #endregion extra-args
  });

  it("inspects the configuration", () => {
    // #region inspect
    const options = new AnvilOptions().account
      .withAccounts(2)
      .evm.withChainId(8453);

    expect(options.has("--chain-id")).toBe(true);
    expect(options.get("--accounts")).toBe("2");
    expect(options.flags()).toEqual({
      "--accounts": "2",
      "--chain-id": "8453",
    }); // --host is managed by the container: rendered, not configurable
    expect(options.toArgs()).toEqual([
      "--host",
      "0.0.0.0",
      "--accounts",
      "2",
      "--chain-id",
      "8453",
    ]);
    expect(options.entryPoint[0]).toBe("anvil");
    expect(options.toJSON().command).toEqual(options.entryPoint);
    // #endregion inspect
  });

  it("validates dependencies and builds an immutable configuration", () => {
    // #region validate
    // Setters reject conflicts at once; dependencies need the whole picture.
    const incomplete = new AnvilOptions().fork.withRetries(3); // no fork URL yet
    expect(() => incomplete.validate()).toThrow(AnvilConfigurationError);

    const [problem] = incomplete.problems(); // the same, without throwing
    expect(problem.flag).toBe("--retries");
    expect(problem.relatedFlags).toEqual(["--fork-url"]);

    const configuration = incomplete.fork
      .withForkUrl("https://rpc.example", 19_000_000)
      .build(); // validate() + freeze
    expect(configuration.forking).toBe(true);
    expect(configuration.command).toContain("--fork-block-number");
    expect(Object.isFrozen(configuration)).toBe(true);
    // #endregion validate
  });

  it("resets one group", () => {
    // #region group-reset
    const options = new AnvilOptions().mining
      .withBlockTime(2)
      .withMixedMining()
      .evm.withChainId(10);

    options.mining.reset(); // removes every mining flag, nothing else
    expect(options.toCommand()).toBe("anvil --host 0.0.0.0 --chain-id 10");

    // withAutoMining() removes just the mining mode flags.
    const auto = new AnvilOptions().mining.withNoMining().withAutoMining();
    expect(auto.has("--no-mining")).toBe(false);
    // #endregion group-reset
  });
});

describe("the flag registry", () => {
  it("describes every anvil flag", () => {
    // #region registry
    const spec = getFlagSpec("--fork-url");
    expect(spec.aliases).toEqual(["-f", "--rpc-url"]);
    expect(spec.methods).toEqual(["fork.withForkUrl()"]);

    expect(isAnvilFlag("--state-interval")).toBe(true);
    expect(getFlagSpec("--state-interval").requiresAnyOf).toEqual([
      "--dump-state",
      "--state",
    ]);
    expect(groupFlags("mining")).toContain("--no-mining");
    expect(ANVIL_FLAGS.size).toBe(ANVIL_FLAG_LIST.length);
    // #endregion registry
  });
});

describe("state files", () => {
  it("copies state files in before start and out after stop", () => {
    // #region state-files
    const configuration = new AnvilOptions().state
      .withDumpState("./out/state.json") // copied to the host by stop()
      .withStateInterval(30) // also dump every 30 s while running
      .withPreserveHistoricalStates() // include historical states in dumps
      .build();

    expect(configuration.fileExports).toEqual([
      {
        flag: "--dump-state",
        hostPath: path.resolve("out/state.json"),
        containerPath: "/tmp/anvil-dump-state.json",
        when: "stop",
      },
    ]);

    // --state loads the file when it exists and dumps to it on stop.
    const persistent = new AnvilOptions().state
      .withState("./.anvil/state.json")
      .build();
    expect(persistent.fileImports[0].required).toBe(false);
    expect(persistent.fileExports[0].when).toBe("stop");
    // #endregion state-files
  });

  it("writes the resolved node configuration to the host", () => {
    // #region config-out
    // anvil's resolved config (incl. dev keys), copied out right after start.
    const configuration = new AnvilOptions().state
      .withConfigOut("./out/anvil-config.json")
      .build();
    expect(configuration.fileExports[0]).toMatchObject({
      flag: "--config-out",
      when: "start",
    });
    // #endregion config-out
  });

  it("uses files already inside the image", () => {
    // #region container-path
    const baked = containerPath("/data/fixture.json"); // not copied
    const configuration = new AnvilOptions().state.withLoadState(baked).build();

    expect(isContainerPath(baked)).toBe(true);
    expect(configuration.args).toContain("/data/fixture.json");
    expect(configuration.fileImports).toEqual([]);
    // #endregion container-path
  });

  it("bounds the states kept on disk and in memory", () => {
    // #region history-limits
    // Long-running nodes: keep at most 5 states on disk…
    const bounded = new AnvilOptions().state.withMaxPersistedStates(5);
    expect(bounded.toCommand()).toContain("--max-persisted-states 5");

    // …or prune history instead: the two are mutually exclusive.
    expect(() => bounded.state.withPruneHistory()).toThrow(
      AnvilConfigurationError,
    );
    // #endregion history-limits
  });
});

describe("network modes, logs, server and limits", () => {
  it("runs an OP Stack or Celo chain", () => {
    // #region network-modes
    const opStack = new AnvilOptions().network
      .withOptimism()
      .evm.withHardfork(OpHardfork.Isthmus);
    expect(opStack.toCommand()).toBe(
      "anvil --host 0.0.0.0 --hardfork isthmus --optimism",
    );

    // Ethereum hardforks don't apply to OP Stack chains…
    expect(() =>
      new AnvilOptions().network
        .withOptimism()
        .evm.withHardfork(Hardfork.Prague)
        .validate(),
    ).toThrow(/use an OpHardfork value instead/);
    // …and a chain is either OP Stack or Celo.
    expect(() => new AnvilOptions().network.withCelo().withOptimism()).toThrow(
      AnvilConfigurationError,
    );
    // #endregion network-modes
  });

  it("formats logs for machines or humans", () => {
    // #region log-formats
    const json = new AnvilOptions().logs.jsonLogFormat().disableConsoleLog();
    expect(json.toCommand()).toBe(
      "anvil --host 0.0.0.0 --json --disable-console-log",
    );

    const markdown = new AnvilOptions().logs
      .withMarkdownFormat()
      .verboseLogs(LogVerbosity.Four);
    expect(markdown.toCommand()).toBe("anvil --host 0.0.0.0 --md -vvvv");

    // Conflicting log settings fail as soon as they are set.
    expect(() => new AnvilOptions().logs.quiet().verboseLogs(2)).toThrow(
      /cannot be combined with --quiet/,
    );
    // #endregion log-formats
  });

  it("tunes the server", () => {
    // #region server-paths
    const options = new AnvilOptions().server
      .withIpc() // /tmp/anvil.ipc inside the container
      .withThreads(4) // 0 = one per logical core
      .withCachePath("/tmp/anvil-cache"); // container path
    expect(options.toCommand()).toBe(
      "anvil --host 0.0.0.0 --ipc --threads 4 --cache-path /tmp/anvil-cache",
    );
    // #endregion server-paths
  });

  it("limits EVM memory", () => {
    // #region memory-limit
    const options = new AnvilOptions().evm.withMemoryLimit(1n << 30n); // bytes
    expect(options.toCommand()).toBe(
      "anvil --host 0.0.0.0 --memory-limit 1073741824",
    );
    // #endregion memory-limit
  });

  it("adds and replaces fork headers", () => {
    // #region fork-headers
    const options = new AnvilOptions().fork
      .withForkUrl("https://rpc.example@19000000") // url@block works too
      .withForkHeaders("Authorization: Bearer <key>", "X-Team: qa") // replace all
      .withForkHeader("X-Run: 42"); // add one
    expect(options.toCommand()).toBe(
      "anvil --host 0.0.0.0 --fork-url https://rpc.example --fork-block-number 19000000 " +
        "--fork-header 'Authorization: Bearer <key>' --fork-header 'X-Team: qa' " +
        "--fork-header 'X-Run: 42'",
    );
    // #endregion fork-headers
  });
});

describe("durations and timestamps", () => {
  it("converts human-friendly time to seconds", () => {
    // #region units
    expect(durationToSeconds({ days: 1, hours: 2 })).toBe(93_600n);
    expect(durationToSeconds(90)).toBe(90n);
    expect(timestampToSeconds(new Date("2030-01-01T00:00:00Z"))).toBe(
      1_893_456_000n,
    );
    expect(() => durationToSeconds({ days: -1 })).toThrow(RangeError);
    // #endregion units
  });
});
