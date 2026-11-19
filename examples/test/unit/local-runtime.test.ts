import {
  AnvilContainer,
  AnvilOptions,
  AnvilStartupError,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import { LocalAnvilContainer, localizeArgs } from "../support/local-anvil";
import { e2eMode } from "../support/runtime";
import { useLocalRuntime } from "../support/setup-runtime";

describe("local anvil runtime (--no-docker)", () => {
  it("binds to the loopback interface and maps container file paths", () => {
    const args = localizeArgs(
      [
        "--host",
        "0.0.0.0",
        "--port",
        "8545",
        "--load-state",
        "/tmp/in.json",
        "--init=/tmp/g.json",
      ],
      40_000,
      new Map([
        ["/tmp/in.json", "/work/in.json"],
        ["/tmp/g.json", "/work/g.json"],
      ]),
    );
    expect(args).toEqual([
      "--host",
      "127.0.0.1",
      "--port",
      "40000",
      "--load-state",
      "/work/in.json",
      "--init=/work/g.json",
    ]);
  });

  it("rejects files that would be copied out of a container", async () => {
    const container = new LocalAnvilContainer(
      new AnvilOptions().state.withDumpState("./dump.json"),
    );
    await expect(container.start()).rejects.toThrow(
      /--dump-state .*not supported by the local anvil runtime.*dumpStateToFile/,
    );
  });

  it("reports a missing binary through the library's startup error", async () => {
    const previous = process.env.ANVIL_BINARY;
    process.env.ANVIL_BINARY = "/nonexistent/anvil";
    try {
      const error = await new LocalAnvilContainer()
        .start()
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AnvilStartupError);
      expect((error as Error).message).toMatch(/No local anvil binary/);
    } finally {
      if (previous === undefined) delete process.env.ANVIL_BINARY;
      else process.env.ANVIL_BINARY = previous;
    }
  });
});

describe("runtime selection", () => {
  it("runs in Docker unless --no-docker selected the local runtime", () => {
    expect(e2eMode({})).toBe("docker");
    expect(e2eMode({ EXAMPLES_E2E_MODE: "docker" })).toBe("docker");
    expect(e2eMode({ EXAMPLES_E2E_MODE: "local" })).toBe("local");
  });

  it("routes every AnvilContainer to the local runtime", () => {
    type WithRuntime = { startRuntime: unknown };
    const prototype = AnvilContainer.prototype as unknown as WithRuntime;
    const original = prototype.startRuntime;
    try {
      useLocalRuntime();
      expect(prototype.startRuntime).toBe(
        (LocalAnvilContainer.prototype as unknown as WithRuntime).startRuntime,
      );
    } finally {
      prototype.startRuntime = original;
    }
  });
});
