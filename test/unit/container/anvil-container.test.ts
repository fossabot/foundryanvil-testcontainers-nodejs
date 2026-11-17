import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { GenericContainer, Wait } from "testcontainers";
import {
  AnvilConfigurationError,
  AnvilContainer,
  AnvilOptions,
  AnvilReadyWaitStrategy,
  AnvilStartupError,
  AnvilTestClientConfigurationError,
  CONTAINER_FILE_PATHS,
  DEFAULT_ANVIL_IMAGE,
  StartedAnvilContainer,
  TestClientOptions,
  containerPath,
} from "../../../src";
import {
  FakeStartedTestContainer,
  buildTar,
} from "../../helpers/fake-started-container";
import { MockRpcServer } from "../../helpers/mock-rpc-server";

/** Reads private builder state of GenericContainer for assertions. */
function internals(container: GenericContainer) {
  return container as unknown as {
    createOpts: { Entrypoint?: string[]; Cmd?: string[]; Image?: string };
    exposedPorts: unknown[];
    filesToCopy: Array<{ source: string; target: string; mode?: number }>;
    waitStrategy: unknown;
    imageName: { string: string };
  };
}

describe("AnvilContainer", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "anvil-container-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  describe("construction", () => {
    it("uses the default image and options", () => {
      const container = new AnvilContainer();
      expect(internals(container).imageName.string).toBe(DEFAULT_ANVIL_IMAGE);
      expect(container.anvilOptions).toBeInstanceOf(AnvilOptions);
    });

    it("accepts a custom image and any options view", () => {
      const container = new AnvilContainer(
        new AnvilOptions().account.withAccounts(1),
        "hellaweb3/foundry-anvil:1.6",
      );
      expect(internals(container).imageName.string).toBe(
        "hellaweb3/foundry-anvil:1.6",
      );
      expect(container.anvilOptions.has("--accounts")).toBe(true);
    });

    it("rejects non-option arguments (e.g. the legacy entrypoint array)", () => {
      expect(
        () => new AnvilContainer(["anvil"] as unknown as AnvilOptions),
      ).toThrow(/expects an AnvilOptions instance/);
    });

    it("validates withArtifactsDir", () => {
      expect(() => new AnvilContainer().withArtifactsDir("")).toThrow(
        /non-empty directory/,
      );
      expect(new AnvilContainer().withArtifactsDir("artifacts")).toBeInstanceOf(
        AnvilContainer,
      );
    });
  });

  describe("withTestClient", () => {
    it("accepts options or a configuring function", () => {
      const options = new TestClientOptions().withTimeout(5);
      const container = new AnvilContainer();
      expect(container.testClientOptions).toBeInstanceOf(TestClientOptions);
      expect(container.withTestClient(options)).toBe(container);
      expect(container.testClientOptions).toBe(options);
      container.withTestClient((client) => client.withCacheTime(3));
      expect(container.testClientOptions.build().cacheTime).toBe(3);
    });

    it("explains a configuring function that forgot to return", () => {
      expect(() =>
        new AnvilContainer().withTestClient((() => undefined) as never),
      ).toThrow(
        /TestClientOptions\.withTestClient\(\): expected TestClientOptions or a function returning them \(did the callback forget to return\?\)/,
      );
    });
  });

  describe("prepare", () => {
    it("applies entrypoint, command, port and the readiness wait strategy", () => {
      const options = new AnvilOptions().server
        .withPort(8546)
        .account.withAccounts(3);
      const container = new AnvilContainer(options);
      const configuration = container.prepare();
      const state = internals(container);
      expect(state.createOpts.Entrypoint).toEqual(["anvil"]);
      expect(state.createOpts.Cmd).toEqual([
        "--host",
        "0.0.0.0",
        "--accounts",
        "3",
        "--port",
        "8546",
      ]);
      expect(state.exposedPorts).toEqual([8546]);
      expect(state.waitStrategy).toBeInstanceOf(AnvilReadyWaitStrategy);
      expect(configuration.port).toBe(8546);
      expect(configuration.command).toEqual([
        "anvil",
        ...state.createOpts.Cmd!,
      ]);
    });

    it("keeps a user supplied wait strategy", () => {
      const strategy = Wait.forLogMessage("Listening");
      const container = new AnvilContainer().withWaitStrategy(strategy);
      container.prepare();
      expect(internals(container).waitStrategy).toBe(strategy);
    });

    it("fails fast on invalid options", () => {
      const container = new AnvilContainer(
        new AnvilOptions().fork.withRetries(1),
      );
      expect(() => container.prepare()).toThrow(AnvilConfigurationError);
    });

    it("copies required host files into the container", () => {
      const state = path.join(tmp, "state.json");
      const genesis = path.join(tmp, "genesis.json");
      fs.writeFileSync(state, "0x00");
      fs.writeFileSync(genesis, "{}");
      const container = new AnvilContainer(
        new AnvilOptions().state.withLoadState(state),
      );
      container.prepare();
      expect(internals(container).filesToCopy).toEqual([
        {
          source: state,
          target: CONTAINER_FILE_PATHS["--load-state"],
          mode: 0o644,
        },
      ]);

      const genesisContainer = new AnvilContainer(
        new AnvilOptions().state.withInit(genesis),
      );
      genesisContainer.prepare();
      expect(internals(genesisContainer).filesToCopy[0].target).toBe(
        CONTAINER_FILE_PATHS["--init"],
      );
    });

    it("is idempotent (files are registered once)", () => {
      const state = path.join(tmp, "state.json");
      fs.writeFileSync(state, "0x00");
      const container = new AnvilContainer(
        new AnvilOptions().state.withLoadState(state),
      );
      container.prepare();
      container.prepare();
      expect(internals(container).filesToCopy).toHaveLength(1);
    });

    it("throws when a required host file is missing or is a directory", () => {
      const missing = new AnvilContainer(
        new AnvilOptions().state.withLoadState(path.join(tmp, "nope.json")),
      );
      expect(() => missing.prepare()).toThrow(/does not exist on the host/);

      const directory = new AnvilContainer(
        new AnvilOptions().state.withInit(tmp),
      );
      expect(() => directory.prepare()).toThrow(
        /is a directory; a file is required/,
      );
    });

    it("copies --state files only when they exist, as writable", () => {
      const state = path.join(tmp, "state.json");
      const absent = new AnvilContainer(
        new AnvilOptions().state.withState(state),
      );
      absent.prepare();
      expect(internals(absent).filesToCopy).toEqual([]);

      fs.writeFileSync(state, "0x00");
      const present = new AnvilContainer(
        new AnvilOptions().state.withState(state),
      );
      present.prepare();
      expect(internals(present).filesToCopy).toEqual([
        { source: state, target: CONTAINER_FILE_PATHS["--state"], mode: 0o666 },
      ]);
    });

    it("does not copy anything for container paths", () => {
      const container = new AnvilContainer(
        new AnvilOptions().state.withLoadState(
          containerPath("/data/state.json"),
        ),
      );
      container.prepare();
      expect(internals(container).filesToCopy).toEqual([]);
      expect(internals(container).createOpts.Cmd).toContain("/data/state.json");
    });
  });

  describe("start", () => {
    let rpc: MockRpcServer;

    beforeEach(async () => {
      rpc = await new MockRpcServer().start();
    });

    afterEach(async () => {
      await rpc.stop();
    });

    function fakeStart(fake: FakeStartedTestContainer) {
      return jest
        .spyOn(GenericContainer.prototype, "start")
        .mockImplementation(function (this: GenericContainer) {
          return Promise.resolve(fake);
        });
    }

    it("returns a StartedAnvilContainer bound to the node's chain id", async () => {
      rpc.chainId = 1337;
      const fake = new FakeStartedTestContainer("127.0.0.1", {
        8545: rpc.port,
      });
      fakeStart(fake);
      const started = await new AnvilContainer().start();
      expect(started).toBeInstanceOf(StartedAnvilContainer);
      expect(started.rpcUrl).toBe(rpc.url);
      expect(started.chainId).toBe(1337);
      expect(started.chain.id).toBe(1337);
      expect(rpc.callsFor("eth_chainId")).toHaveLength(1);
    });

    it("reuses the chain id from the readiness probe (no extra round trip)", async () => {
      const fake = new FakeStartedTestContainer("127.0.0.1", {
        8545: rpc.port,
      });
      jest
        .spyOn(GenericContainer.prototype, "start")
        .mockImplementation(function (this: GenericContainer) {
          (internals(this).waitStrategy as AnvilReadyWaitStrategy).chainId =
            4242;
          return Promise.resolve(fake);
        });
      const started = await new AnvilContainer().start();
      expect(started.chainId).toBe(4242);
      expect(rpc.callsFor("eth_chainId")).toHaveLength(0);
    });

    it("uses the statically configured chain id without asking the node", async () => {
      const fake = new FakeStartedTestContainer("127.0.0.1", {
        8545: rpc.port,
      });
      fakeStart(fake);
      const started = await new AnvilContainer(
        new AnvilOptions().evm.withChainId(42),
      ).start();
      expect(started.chainId).toBe(42);
      expect(rpc.callsFor("eth_chainId")).toHaveLength(0);
    });

    it("falls back to the default chain id when the node answers garbage", async () => {
      rpc.overrides.set("eth_chainId", () => "not-hex");
      const fake = new FakeStartedTestContainer("127.0.0.1", {
        8545: rpc.port,
      });
      fakeStart(fake);
      const started = await new AnvilContainer().start();
      expect(started.chainId).toBe(31337);
    });

    it("exports --config-out right after start", async () => {
      const target = path.join(tmp, "out", "config.json");
      const fake = new FakeStartedTestContainer("127.0.0.1", {
        8545: rpc.port,
      });
      fake.archives.set(
        CONTAINER_FILE_PATHS["--config-out"],
        buildTar("anvil-config-out.json", '{"ok":true}'),
      );
      fakeStart(fake);
      await new AnvilContainer(
        new AnvilOptions().state.withConfigOut(target),
      ).start();
      expect(fs.readFileSync(target, "utf8")).toBe('{"ok":true}');
    });

    it("wraps start failures into AnvilStartupError with the command line", async () => {
      jest
        .spyOn(GenericContainer.prototype, "start")
        .mockRejectedValue(new Error("no docker"));
      const container = new AnvilContainer(
        new AnvilOptions().account.withAccounts(2),
      );
      await expect(container.start()).rejects.toMatchObject({
        name: "AnvilStartupError",
        command: ["anvil", "--host", "0.0.0.0", "--accounts", "2"],
      });
      await expect(container.start()).rejects.toThrow(
        /no docker[\s\S]*Command: anvil --host 0.0.0.0 --accounts 2/,
      );
    });

    it("passes AnvilStartupError from the wait strategy through untouched", async () => {
      const original = new AnvilStartupError("boom", { command: ["anvil"] });
      jest
        .spyOn(GenericContainer.prototype, "start")
        .mockRejectedValue(original);
      await expect(new AnvilContainer().start()).rejects.toBe(original);
    });

    it("stops the container when post-start initialisation fails", async () => {
      const fake = new FakeStartedTestContainer("127.0.0.1", {
        8545: rpc.port,
      });
      fakeStart(fake);
      const container = new AnvilContainer(
        new AnvilOptions().state.withConfigOut(path.join(tmp, "config.json")),
      );
      await expect(container.start()).rejects.toThrow(
        /could not be initialised[\s\S]*--config-out/,
      );
      expect(fake.stopCalls).toHaveLength(1);
    });

    it("sets up the configured test client and resolves its default account", async () => {
      const fake = new FakeStartedTestContainer("127.0.0.1", {
        8545: rpc.port,
      });
      fakeStart(fake);
      const started = await new AnvilContainer()
        .withTestClient((client) =>
          client.withAccount(1).withPollingInterval(25),
        )
        .start();
      expect(started.testClient.account.address).toBe(rpc.accounts[1]);
      expect(started.testClient.pollingInterval).toBe(25);
      expect(started.testClientConfiguration.pollingInterval).toBe(25);
    });

    it("validates the test client against the options before touching Docker", async () => {
      const spy = jest.spyOn(GenericContainer.prototype, "start");
      const container = new AnvilContainer(
        new AnvilOptions().account.withAccounts(2),
      ).withTestClient(new TestClientOptions().withAccount(2));
      await expect(container.start()).rejects.toBeInstanceOf(
        AnvilTestClientConfigurationError,
      );
      expect(() => container.prepare()).toThrow(
        /TestClientOptions\.withAccount\(\): dev account 2 does not exist/,
      );
      expect(spy).not.toHaveBeenCalled();
    });

    it("re-validates after withTestClient() replaces a prepared configuration", async () => {
      const fake = new FakeStartedTestContainer("127.0.0.1", {
        8545: rpc.port,
      });
      fakeStart(fake);
      const container = new AnvilContainer(
        new AnvilOptions().account.withAccounts(2),
      );
      container.prepare();
      const withBadAccount = container.withTestClient((c) => c.withAccount(9));
      await expect(withBadAccount.start()).rejects.toBeInstanceOf(
        AnvilTestClientConfigurationError,
      );
      const started = await withBadAccount
        .withTestClient((c) => c.withAccount(0))
        .start();
      expect(started.testClient.account.address).toBe(rpc.accounts[0]);
    });

    it("wraps default-account resolution failures into AnvilStartupError and stops", async () => {
      rpc.accounts = [];
      const fake = new FakeStartedTestContainer("127.0.0.1", {
        8545: rpc.port,
      });
      fakeStart(fake);
      await expect(
        new AnvilContainer().withTestClient((c) => c.withAccount(0)).start(),
      ).rejects.toThrow(
        /could not be initialised: Default account 0 does not exist/,
      );
      expect(fake.stopCalls).toHaveLength(1);
    });

    it("lets subclasses provide another runtime through startRuntime()", async () => {
      const fake = new FakeStartedTestContainer("127.0.0.1", {
        8545: rpc.port,
      });
      const docker = jest.spyOn(GenericContainer.prototype, "start");
      class LocalRuntimeContainer extends AnvilContainer {
        public prepared?: readonly string[];
        protected override startRuntime() {
          this.prepared = this.prepare().args;
          return Promise.resolve(fake);
        }
      }
      const container = new LocalRuntimeContainer(
        new AnvilOptions().account.withAccounts(3),
      );
      const started = await container
        .withTestClient((c) => c.withAccount(2))
        .start();
      expect(docker).not.toHaveBeenCalled();
      expect(container.prepared).toEqual([
        "--host",
        "0.0.0.0",
        "--accounts",
        "3",
      ]);
      expect(started.rpcUrl).toBe(rpc.url);
      expect(started.testClient.account.address).toBe(rpc.accounts[2]);
    });

    it("reports a missing host file before touching Docker", async () => {
      const spy = jest.spyOn(GenericContainer.prototype, "start");
      const container = new AnvilContainer(
        new AnvilOptions().state.withLoadState(path.join(tmp, "missing.json")),
      );
      await expect(container.start()).rejects.toBeInstanceOf(
        AnvilConfigurationError,
      );
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
