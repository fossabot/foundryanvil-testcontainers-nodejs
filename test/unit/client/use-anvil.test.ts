import * as path from "node:path";
import {
  AnvilOptions,
  AnvilTestClientError,
  DEFAULT_USE_ANVIL_TIMEOUT_MS,
  StartedAnvilContainer,
  useAnvil,
} from "../../../src";
import type { AnvilTestHooks } from "../../../src";
import { FakeStartedTestContainer } from "../../helpers/fake-started-container";
import { MockRpcServer } from "../../helpers/mock-rpc-server";

type Registered = { fn: () => Promise<void>; timeout?: number };

/** Records hooks instead of registering them with Jest. */
function fakeHooks() {
  const registered: Record<string, Registered[]> = {
    beforeAll: [],
    afterAll: [],
    afterEach: [],
  };
  const hook = (name: string) => (fn: () => Promise<void>, timeout?: number) =>
    registered[name].push({ fn, timeout });
  const hooks: AnvilTestHooks = {
    beforeAll: hook("beforeAll"),
    afterAll: hook("afterAll"),
    afterEach: hook("afterEach"),
  };
  const run = async (name: string) => {
    for (const { fn } of registered[name]) await fn();
  };
  return { hooks, registered, run };
}

describe("useAnvil", () => {
  let rpc: MockRpcServer;
  let fake: FakeStartedTestContainer;
  let node: StartedAnvilContainer;
  const startable = () => ({ start: jest.fn(() => Promise.resolve(node)) });

  beforeEach(async () => {
    rpc = await new MockRpcServer().start();
    fake = new FakeStartedTestContainer("127.0.0.1", { 8545: rpc.port });
    node = new StartedAnvilContainer(fake, {
      rpcUrl: rpc.url,
      chainId: 31337,
      configuration: new AnvilOptions().build(),
      artifactsDir: path.resolve("test/artifacts"),
    });
  });

  afterEach(async () => {
    await rpc.stop();
  });

  it("empties the pool while restoring: one round trip less per test", async () => {
    const { hooks, run } = fakeHooks();
    useAnvil(startable(), { hooks });
    await run("beforeAll");
    // Hold the drop until the revert has been received: they run concurrently.
    let releaseDrop!: () => void;
    const dropHeld = new Promise<void>((resolve) => (releaseDrop = resolve));
    rpc.overrides.set("anvil_dropAllTransactions", async () => {
      await dropHeld;
      return null;
    });
    rpc.overrides.set("evm_revert", () => {
      releaseDrop();
      return true;
    });
    rpc.calls.length = 0;
    await run("afterEach");
    expect(rpc.calls.map((call) => call.method).sort()).toEqual([
      "anvil_dropAllTransactions",
      "evm_revert",
      "evm_snapshot",
    ]);
  });

  it("still restores the baseline when emptying the pool fails", async () => {
    const { hooks, run } = fakeHooks();
    useAnvil(startable(), { hooks });
    await run("beforeAll");
    rpc.failNext.set("anvil_dropAllTransactions", {
      code: -32602, // not retried by viem
      message: "pool unavailable",
    });
    rpc.calls.length = 0;
    await expect(run("afterEach")).rejects.toThrow(/pool unavailable/);
    expect(rpc.callsFor("evm_revert")).toHaveLength(1);
  });

  it("starts in beforeAll, isolates each test and stops in afterAll", async () => {
    const { hooks, registered, run } = fakeHooks();
    const container = startable();
    const setup = jest.fn(async (started: StartedAnvilContainer) => {
      await started.setBalance(
        "0x1111111111111111111111111111111111111111",
        1n,
      );
    });
    const anvil = useAnvil(container, { hooks, setup });

    expect(registered.beforeAll[0].timeout).toBe(DEFAULT_USE_ANVIL_TIMEOUT_MS);
    expect(registered.afterAll[0].timeout).toBe(DEFAULT_USE_ANVIL_TIMEOUT_MS);
    expect(container.start).not.toHaveBeenCalled();

    await run("beforeAll");
    expect(container.start).toHaveBeenCalledTimes(1);
    expect(setup).toHaveBeenCalledWith(node);
    // The baseline snapshot is taken after setup.
    const methods = rpc.calls.map((call) => call.method);
    expect(methods.indexOf("evm_snapshot")).toBeGreaterThan(
      methods.indexOf("anvil_setBalance"),
    );

    // The handle behaves like the started container.
    expect(anvil.rpcUrl).toBe(rpc.url);
    expect(anvil.testClient).toBe(node.testClient);
    expect(await anvil.addresses()).toEqual(rpc.accounts);
    expect(anvil).toBeInstanceOf(StartedAnvilContainer);
    expect("testClient" in anvil).toBe(true);

    await run("afterEach");
    await run("afterEach");
    expect(rpc.callsFor("evm_revert")).toHaveLength(2);
    // Pending transactions survive evm_revert, so the pool is emptied first.
    expect(rpc.callsFor("anvil_dropAllTransactions")).toHaveLength(2);
    const order = rpc.calls.map((call) => call.method);
    expect(order.indexOf("anvil_dropAllTransactions")).toBeLessThan(
      order.indexOf("evm_revert"),
    );
    expect(rpc.callsFor("evm_snapshot")).toHaveLength(3);

    await run("afterAll");
    expect(fake.stopCalls).toHaveLength(1);
    expect(node.isStopped).toBe(true);
    expect(() => anvil.testClient).toThrow(
      expect.objectContaining({ code: "NOT_STARTED" }) as Error,
    );
  });

  it('does not snapshot with isolation: "none" and honours a custom timeout', async () => {
    const { hooks, registered, run } = fakeHooks();
    useAnvil(startable(), { hooks, isolation: "none", timeout: 5 });
    expect(registered.afterEach).toHaveLength(0);
    expect(registered.beforeAll[0].timeout).toBe(5);
    await run("beforeAll");
    expect(rpc.callsFor("evm_snapshot")).toHaveLength(0);
    await run("afterAll");
  });

  it("afterAll tolerates a failed start and afterEach a missing baseline", async () => {
    const { hooks, run } = fakeHooks();
    useAnvil(
      { start: () => Promise.reject(new Error("no docker")) },
      { hooks },
    );
    await expect(run("beforeAll")).rejects.toThrow("no docker");
    await run("afterEach");
    await run("afterAll");
  });

  it("stops the node in afterAll even when setup fails", async () => {
    const { hooks, run } = fakeHooks();
    useAnvil(startable(), {
      hooks,
      setup: () => Promise.reject(new Error("deploy failed")),
    });
    await expect(run("beforeAll")).rejects.toThrow("deploy failed");
    await run("afterAll");
    expect(fake.stopCalls).toHaveLength(1);
  });

  it("explains why the baseline is gone when a test reset the node", async () => {
    const { hooks, run } = fakeHooks();
    useAnvil(startable(), { hooks });
    await run("beforeAll");
    rpc.overrides.set("evm_revert", () => false);
    await expect(run("afterEach")).rejects.toThrow(
      /per-test baseline could not be restored.*reset\(\) or loadState\(\).*isolation: "none"/,
    );
    rpc.overrides.delete("evm_revert");
    rpc.failNext.set("evm_revert", { code: -32602, message: "other" });
    await expect(run("afterEach")).rejects.toThrow(/other/);
  });

  it("throws an actionable error when used before start", () => {
    const { hooks } = fakeHooks();
    const anvil = useAnvil(startable(), { hooks });
    let error: unknown;
    try {
      void anvil.testClient;
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AnvilTestClientError);
    expect((error as AnvilTestClientError).code).toBe("NOT_STARTED");
    expect((error as Error).message).toMatch(
      /cannot read "testClient" because the node is not running.*not at describe\/module level/,
    );
    // Harmless for await and runtime inspection.
    expect((anvil as unknown as { then?: unknown }).then).toBeUndefined();
    expect(
      (anvil as unknown as Record<symbol, unknown>)[Symbol.toStringTag],
    ).toBeUndefined();
    expect("testClient" in anvil).toBe(false);
    expect(Object.getPrototypeOf(anvil)).toBe(Object.prototype);
  });

  it("uses the test framework's global hooks by default", () => {
    // Inside Jest: beforeAll/afterAll/afterEach are globals. Registering here
    // (inside a test) is rejected by Jest, so spy on them instead.
    const spies = ["beforeAll", "afterAll", "afterEach"].map((name) =>
      jest
        .spyOn(globalThis as unknown as Record<string, () => void>, name)
        .mockImplementation(() => undefined),
    );
    try {
      useAnvil(startable());
      for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("falls back to Mocha's before/after", () => {
    const globals = globalThis as unknown as Record<string, unknown>;
    const saved = {
      beforeAll: globals.beforeAll,
      afterAll: globals.afterAll,
    };
    const before = jest.fn();
    const after = jest.fn();
    try {
      globals.beforeAll = undefined;
      globals.afterAll = undefined;
      globals.before = before;
      globals.after = after;
      useAnvil(startable(), {
        isolation: "none",
      });
      expect(before).toHaveBeenCalledTimes(1);
      expect(after).toHaveBeenCalledTimes(1);
    } finally {
      Object.assign(globals, saved);
      delete globals.before;
      delete globals.after;
    }
  });

  it("reports missing hooks and invalid arguments", () => {
    const globals = globalThis as unknown as Record<string, unknown>;
    const saved = { ...globals };
    try {
      for (const name of ["beforeAll", "afterAll", "afterEach"]) {
        globals[name] = undefined;
      }
      expect(() => useAnvil(startable())).toThrow(
        expect.objectContaining({
          code: "TEST_HOOKS_UNAVAILABLE",
          message: expect.stringMatching(
            /needs the test hooks beforeAll, afterAll, afterEach.*hooks: \{ beforeAll, afterAll, afterEach \}/,
          ) as unknown,
        }) as Error,
      );
      expect(() =>
        useAnvil(startable(), {
          hooks: { beforeAll: jest.fn(), afterAll: jest.fn() },
        }),
      ).toThrow(/needs the test hooks afterEach/);
      expect(() =>
        useAnvil(startable(), {
          isolation: "none",
          hooks: { beforeAll: jest.fn(), afterAll: jest.fn() },
        }),
      ).not.toThrow();
    } finally {
      Object.assign(globals, saved);
    }
    expect(() => useAnvil({} as never)).toThrow(
      /expects an AnvilContainer \(or any object with start\(\)\)/,
    );
    expect(() => useAnvil(startable(), { isolation: "file" as never })).toThrow(
      /isolation must be "test" or "none", received file/,
    );
  });
});
