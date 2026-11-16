import {
  AnvilConfigurationError,
  AnvilStartupError,
  containerPath,
  isContainerPath,
} from "../../src";

describe("errors & small types", () => {
  it("AnvilConfigurationError carries flag metadata", () => {
    const error = new AnvilConfigurationError("msg");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AnvilConfigurationError");
    expect(error.flag).toBeUndefined();
    expect(error.relatedFlags).toEqual([]);
    const detailed = new AnvilConfigurationError("msg", {
      flag: "--accounts",
      relatedFlags: ["--balance"],
    });
    expect(detailed.flag).toBe("--accounts");
    expect(detailed.relatedFlags).toEqual(["--balance"]);
  });

  it("AnvilStartupError carries the command, logs and cause", () => {
    const cause = new Error("root");
    const error = new AnvilStartupError("boom", {
      command: ["anvil", "-q"],
      logs: "log",
      cause,
    });
    expect(error.name).toBe("AnvilStartupError");
    expect(error.command).toEqual(["anvil", "-q"]);
    expect(error.logs).toBe("log");
    expect(error.cause).toBe(cause);
  });

  it("containerPath / isContainerPath", () => {
    expect(containerPath("/x")).toEqual({ containerPath: "/x" });
    expect(isContainerPath({ containerPath: "/x" })).toBe(true);
    expect(isContainerPath("/x")).toBe(false);
    expect(isContainerPath(null)).toBe(false);
    expect(isContainerPath({})).toBe(false);
    expect(() => containerPath(1 as unknown as string)).toThrow(TypeError);
  });
});
