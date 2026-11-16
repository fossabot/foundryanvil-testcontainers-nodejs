import {
  AnvilConfigurationError,
  AnvilOptions,
  Color,
  LOGGING_FLAGS,
  LoggingOptions,
  LogVerbosity,
} from "../../../src";

describe("LoggingOptions", () => {
  let options: AnvilOptions;

  beforeEach(() => {
    options = new AnvilOptions();
  });

  it("is reachable from any view", () => {
    expect(options.logs).toBeInstanceOf(LoggingOptions);
    expect(options.server.logs.quiet()).toBeInstanceOf(LoggingOptions);
  });

  it("withColor validates the enum", () => {
    options.logs.withColor(Color.Never);
    expect(options.toArgs()).toEqual(["--host", "0.0.0.0", "--color", "never"]);
    expect(() => options.logs.withColor("blue" as Color)).toThrow(
      /unknown color "blue"/,
    );
  });

  describe("verboseLogs", () => {
    it.each([
      [LogVerbosity.One, "-v"],
      [LogVerbosity.Two, "-vv"],
      [LogVerbosity.Three, "-vvv"],
      [LogVerbosity.Four, "-vvvv"],
      [LogVerbosity.Five, "-vvvvv"],
      [2, "-vv"],
    ])("level %s renders %s", (level, rendered) => {
      options.logs.verboseLogs(level as LogVerbosity);
      expect(options.toArgs()).toEqual(["--host", "0.0.0.0", rendered]);
      expect(options.get("--verbosity")).toBe(Number(level));
    });

    it("rejects out-of-range levels", () => {
      expect(() => options.logs.verboseLogs(0 as LogVerbosity)).toThrow(
        /between 1 and 5/,
      );
      expect(() => options.logs.verboseLogs(6 as LogVerbosity)).toThrow(
        /between 1 and 5/,
      );
      expect(() => options.logs.verboseLogs(1.5 as LogVerbosity)).toThrow(
        AnvilConfigurationError,
      );
      expect(() =>
        options.logs.verboseLogs("-vvv" as unknown as LogVerbosity),
      ).toThrow(AnvilConfigurationError);
    });

    it("replaces the previous level", () => {
      options.logs.verboseLogs(1).logs.verboseLogs(4);
      expect(options.toArgs().filter((arg) => arg.startsWith("-v"))).toEqual([
        "-vvvv",
      ]);
    });
  });

  describe("toggles", () => {
    it.each([
      ["jsonLogFormat", "--json"],
      ["withMarkdownFormat", "--md"],
      ["quiet", "--quiet"],
      ["disableConsoleLog", "--disable-console-log"],
    ] as const)("%s toggles %s", (method, flag) => {
      const toggle = options.logs[method].bind(options.logs) as (
        enabled?: boolean,
      ) => unknown;
      toggle();
      expect(options.has(flag)).toBe(true);
      toggle(false);
      expect(options.has(flag)).toBe(false);
    });
  });

  describe("conflicts", () => {
    it("quiet vs verbosity", () => {
      options.logs.quiet();
      expect(() => options.logs.verboseLogs(3)).toThrow(
        /cannot be combined with --quiet/,
      );
      options.logs.quiet(false).verboseLogs(3);
      expect(() => options.logs.quiet()).toThrow(
        /cannot be combined with --verbosity/,
      );
    });

    it("json vs quiet / color / md", () => {
      options.logs.jsonLogFormat();
      expect(() => options.logs.quiet()).toThrow(/cannot be combined/);
      expect(() => options.logs.withColor(Color.Auto)).toThrow(
        /cannot be combined/,
      );
      expect(() => options.logs.withMarkdownFormat()).toThrow(
        /cannot be combined/,
      );
    });

    it("md and quiet are compatible (verified against anvil's parser)", () => {
      options.logs.withMarkdownFormat();
      expect(() => options.logs.quiet()).not.toThrow();
      expect(options.problems()).toEqual([]);
    });

    it("verbosity and color are compatible", () => {
      expect(() =>
        options.logs.verboseLogs(5).withColor(Color.Always),
      ).not.toThrow();
      expect(options.problems()).toEqual([]);
    });
  });

  it("build reports quiet mode", () => {
    expect(options.build().quiet).toBe(false);
    options.logs.quiet();
    expect(options.build().quiet).toBe(true);
  });

  it("reset removes every logging flag", () => {
    options.logs.verboseLogs(2).withColor(Color.Never).disableConsoleLog();
    options.account.withAccounts(1);
    options.logs.reset();
    for (const flag of LOGGING_FLAGS) expect(options.has(flag)).toBe(false);
    expect(options.has("--accounts")).toBe(true);
  });
});
