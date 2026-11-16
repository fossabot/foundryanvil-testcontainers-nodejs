import {
  AnvilConfigurationError,
  AnvilOptions,
  DEFAULT_ANVIL_PORT,
  SERVER_FLAGS,
  ServerOptions,
} from "../../../src";

describe("ServerOptions", () => {
  let options: AnvilOptions;

  beforeEach(() => {
    options = new AnvilOptions();
  });

  it("is reachable from any view", () => {
    expect(options.server).toBeInstanceOf(ServerOptions);
    expect(options.fork.server.withPort(1)).toBeInstanceOf(ServerOptions);
  });

  describe("withPort", () => {
    it("sets --port and is reflected in build()", () => {
      expect(options.build().port).toBe(DEFAULT_ANVIL_PORT);
      options.server.withPort(8546);
      expect(options.get("--port")).toBe("8546");
      expect(options.build().port).toBe(8546);
    });

    it("rejects invalid ports", () => {
      expect(() => options.server.withPort(0)).toThrow(/between 1 and 65535/);
      expect(() => options.server.withPort(65536)).toThrow(
        AnvilConfigurationError,
      );
      expect(() => options.server.withPort(80.5)).toThrow(
        AnvilConfigurationError,
      );
    });
  });

  describe("withIpc", () => {
    it("supports the bare and valued forms", () => {
      options.server.withIpc();
      expect(options.toArgs()).toEqual(["--host", "0.0.0.0", "--ipc"]);
      options.server.withIpc("/tmp/custom.ipc");
      expect(options.toArgs()).toEqual([
        "--host",
        "0.0.0.0",
        "--ipc=/tmp/custom.ipc",
      ]);
      expect(() => options.server.withIpc("")).toThrow(/non-empty string/);
    });

    it("never lets the next flag be swallowed as the ipc path", () => {
      options.server.withIpc().server.withPort(8546).account.withAccounts(1);
      const args = options.toArgs();
      const index = args.indexOf("--ipc");
      expect(args[index + 1]).toMatch(/^--/);
    });
  });

  it("withThreads sets --threads", () => {
    options.server.withThreads(0);
    expect(options.get("--threads")).toBe("0");
    expect(() => options.server.withThreads(-1)).toThrow(
      AnvilConfigurationError,
    );
  });

  it("withAllowOrigin sets --allow-origin", () => {
    options.server.withAllowOrigin("http://localhost:3000");
    expect(options.get("--allow-origin")).toBe("http://localhost:3000");
    expect(() => options.server.withAllowOrigin(" ")).toThrow(
      /non-empty string/,
    );
  });

  it("withCachePath sets --cache-path", () => {
    options.server.withCachePath("/tmp/cache");
    expect(options.get("--cache-path")).toBe("/tmp/cache");
    expect(() => options.server.withCachePath("")).toThrow(
      AnvilConfigurationError,
    );
  });

  it("noCors / noRequestSizeLimit toggle", () => {
    options.server.noCors().noRequestSizeLimit();
    expect(options.has("--no-cors")).toBe(true);
    expect(options.has("--no-request-size-limit")).toBe(true);
    options.server.noCors(false).noRequestSizeLimit(false);
    expect(options.has("--no-cors")).toBe(false);
    expect(options.has("--no-request-size-limit")).toBe(false);
  });

  it("noCors conflicts with withAllowOrigin in both orders", () => {
    options.server.noCors();
    expect(() => options.server.withAllowOrigin("*")).toThrow(
      /cannot be combined/,
    );
    options.server.noCors(false).withAllowOrigin("*");
    expect(() => options.server.noCors()).toThrow(/cannot be combined/);
  });

  it("the host is managed and cannot be changed", () => {
    expect(() => options.unset("--host")).toThrow(/managed by the container/);
    expect(() => options.withExtraArgs("--host", "127.0.0.1")).toThrow(
      /known anvil flag/,
    );
    expect(options.toArgs().slice(0, 2)).toEqual(["--host", "0.0.0.0"]);
  });

  it("reset removes every server flag", () => {
    options.server
      .withPort(1)
      .withIpc()
      .withThreads(1)
      .noCors()
      .withCachePath("/c");
    options.account.withAccounts(1);
    options.server.reset();
    for (const flag of SERVER_FLAGS) expect(options.has(flag)).toBe(false);
    expect(options.has("--accounts")).toBe(true);
  });
});
