import * as http from "node:http";
import { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { BoundPorts, getContainerRuntimeClient } from "testcontainers";
import { AnvilReadyWaitStrategy, AnvilStartupError } from "../../../src";
import {
  probeJsonRpc,
  tailContainerLogs,
} from "../../../src/container/wait-strategy";

jest.mock("testcontainers", () => ({
  ...jest.requireActual<typeof import("testcontainers")>("testcontainers"),
  getContainerRuntimeClient: jest.fn(),
}));

type Status = "running" | "exited" | "dead";

function fakeClient(states: Status[], logs = "boom\n", logsFail = false) {
  let call = 0;
  const client = {
    info: { containerRuntime: { host: "127.0.0.1" } },
    container: {
      inspect: jest.fn().mockImplementation(() => {
        const status = states[Math.min(call, states.length - 1)];
        call += 1;
        return Promise.resolve({
          State: { Status: status, ExitCode: status === "running" ? 0 : 1 },
        });
      }),
      logs: jest
        .fn()
        .mockImplementation(() =>
          logsFail
            ? Promise.reject(new Error("no logs"))
            : Promise.resolve(Readable.from([logs])),
        ),
    },
  };
  (getContainerRuntimeClient as jest.Mock).mockResolvedValue(client);
  return client;
}

const container = { id: "abc" } as Parameters<
  AnvilReadyWaitStrategy["waitUntilReady"]
>[0];

describe("AnvilReadyWaitStrategy", () => {
  let server: http.Server;
  let port: number;
  let behaviour: (req: http.IncomingMessage, res: http.ServerResponse) => void;

  beforeAll(async () => {
    server = http.createServer((req, res) => behaviour(req, res));
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const bound = (mapped: number = port) => {
    const ports = new BoundPorts();
    ports.setBinding(8545, mapped);
    return ports;
  };

  it("implements the testcontainers WaitStrategy contract", () => {
    const strategy = new AnvilReadyWaitStrategy(8545);
    expect(strategy.isStartupTimeoutSet()).toBe(false);
    expect(strategy.getStartupTimeout()).toBe(
      AnvilReadyWaitStrategy.DEFAULT_STARTUP_TIMEOUT_MS,
    );
    expect(strategy.withStartupTimeout(5)).toBe(strategy);
    expect(strategy.isStartupTimeoutSet()).toBe(true);
    expect(strategy.getStartupTimeout()).toBe(5);
  });

  it("resolves once eth_chainId answers", async () => {
    let requests = 0;
    behaviour = (req, res) => {
      requests += 1;
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        expect(JSON.parse(body)).toMatchObject({ method: "eth_chainId" });
        if (requests < 3) {
          res.writeHead(503).end();
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x7a69" }));
      });
    };
    const client = fakeClient(["running"]);
    const strategy = new AnvilReadyWaitStrategy(8545, ["anvil"])
      .withPollInterval(10)
      .withRequestTimeout(500)
      .withStartupTimeout(5_000);
    await expect(
      strategy.waitUntilReady(container, bound()),
    ).resolves.toBeUndefined();
    expect(requests).toBe(3);
    // Probe first: Docker is only inspected after failed probes.
    expect(client.container.inspect).toHaveBeenCalledTimes(2);
    expect(strategy.chainId).toBe(31337);
  });

  it("ignores error responses until a result is returned", async () => {
    let requests = 0;
    behaviour = (_req, res) => {
      requests += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        requests === 1
          ? JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              error: { code: -1, message: "starting" },
            })
          : JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" }),
      );
    };
    fakeClient(["running"]);
    await new AnvilReadyWaitStrategy(8545)
      .withPollInterval(5)
      .waitUntilReady(container, bound());
    expect(requests).toBe(2);
  });

  it("fails fast with logs when the container exits", async () => {
    behaviour = (_req, res) => res.writeHead(503).end();
    fakeClient(
      ["running", "exited"],
      "error: the argument '--no-mining' cannot be used with '--block-time'\n",
    );
    const strategy = new AnvilReadyWaitStrategy(8545, ["anvil", "--no-mining"])
      .withPollInterval(5)
      .withStartupTimeout(10_000);
    const started = Date.now();
    let error: unknown;
    try {
      await strategy.waitUntilReady(container, bound());
    } catch (caught) {
      error = caught;
    }
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(error).toBeInstanceOf(AnvilStartupError);
    const startupError = error as AnvilStartupError;
    expect(startupError.name).toBe("AnvilStartupError");
    expect(startupError.message).toMatch(/exited with code 1/);
    expect(startupError.message).toContain("anvil --no-mining");
    expect(startupError.message).toContain(
      "cannot be used with '--block-time'",
    );
    expect(startupError.command).toEqual(["anvil", "--no-mining"]);
    expect(startupError.logs).toContain("cannot be used");
  });

  it("treats a dead container like an exited one even if logs are unavailable", async () => {
    behaviour = (_req, res) => res.writeHead(503).end();
    fakeClient(["dead"], "", true);
    await expect(
      new AnvilReadyWaitStrategy(8545).waitUntilReady(container, bound()),
    ).rejects.toMatchObject({ name: "AnvilStartupError", logs: undefined });
  });

  it("times out with a descriptive error", async () => {
    behaviour = (_req, res) => res.writeHead(404).end("nope");
    fakeClient(["running"], "still starting");
    const strategy = new AnvilReadyWaitStrategy(8545, ["anvil", "-q"])
      .withPollInterval(5)
      .withStartupTimeout(60);
    await expect(strategy.waitUntilReady(container, bound())).rejects.toThrow(
      /did not answer JSON-RPC requests on port 8545 within 60 ms[\s\S]*Command: anvil -q[\s\S]*still starting/,
    );
  });

  it("survives an unreachable port", async () => {
    fakeClient(["running"]);
    await expect(
      new AnvilReadyWaitStrategy(8545)
        .withPollInterval(5)
        .withStartupTimeout(40)
        .waitUntilReady(container, bound(1)),
    ).rejects.toBeInstanceOf(AnvilStartupError);
  });
});

describe("probeJsonRpc / tailContainerLogs", () => {
  it("returns undefined for non-JSON or non-object bodies", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("42");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      expect(await probeJsonRpc(url, "eth_chainId", 500)).toBeUndefined();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    expect(
      await probeJsonRpc("http://127.0.0.1:1", "eth_chainId", 200),
    ).toBeUndefined();
  });

  it("tailContainerLogs joins chunks and swallows stream errors", async () => {
    const client = fakeClient(["running"], "a\nb\n");
    expect(await tailContainerLogs(client as never, container)).toBe("a\nb");
    const failing = {
      container: {
        logs: () => {
          const stream = new Readable({ read() {} });
          setImmediate(() => stream.emit("error", new Error("broken")));
          return Promise.resolve(stream);
        },
      },
    };
    expect(
      await tailContainerLogs(failing as never, container),
    ).toBeUndefined();
  });
});
