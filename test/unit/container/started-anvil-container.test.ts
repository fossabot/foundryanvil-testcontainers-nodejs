import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getContainerRuntimeClient } from "testcontainers";
import { parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  AnvilOptions,
  AnvilTestClient,
  CONTAINER_FILE_PATHS,
  DEFAULT_GRACEFUL_STOP_TIMEOUT_MS,
  DEFAULT_MNEMONIC,
  HexString,
  StartedAnvilContainer,
} from "../../../src";
import { mnemonicToAccount } from "viem/accounts";
import {
  decodeStateDump,
  deriveAccountKeys,
  parsePrivateKeysFromBanner,
} from "../../../src/container/started-anvil-container";
import {
  FakeStartedTestContainer,
  buildTar,
} from "../../helpers/fake-started-container";
import {
  MockRpcServer,
  STATE_DUMP,
  STATE_JSON,
} from "../../helpers/mock-rpc-server";

jest.mock("testcontainers", () => ({
  ...jest.requireActual<typeof import("testcontainers")>("testcontainers"),
  getContainerRuntimeClient: jest.fn(),
}));

const BANNER = `
Available Accounts
==================
(0) 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000.000000000000000000 ETH)
(1) 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (10000.000000000000000000 ETH)

Private Keys
==================
(0) 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
(1) 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

Wallet
==================
Mnemonic:          test test test test test test test test test test test junk
`;

describe("StartedAnvilContainer", () => {
  let rpc: MockRpcServer;
  let fake: FakeStartedTestContainer;
  let tmp: string;

  function started(
    options: AnvilOptions = new AnvilOptions(),
    chainId = 31337,
  ) {
    return new StartedAnvilContainer(fake, {
      rpcUrl: rpc.url,
      chainId,
      configuration: options.build(),
      artifactsDir: path.resolve(process.cwd(), "test/artifacts"),
    });
  }

  beforeEach(async () => {
    rpc = await new MockRpcServer().start();
    fake = new FakeStartedTestContainer("127.0.0.1", { 8545: rpc.port });
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "anvil-started-"));
  });

  afterEach(async () => {
    await rpc.stop();
    fs.rmSync(tmp, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  describe("connection details", () => {
    it("exposes urls, chain and configuration", () => {
      const options = new AnvilOptions().evm.withChainId(1337);
      const container = started(options, 1337);
      expect(container.rpcUrl).toBe(rpc.url);
      expect(container.wsUrl).toBe(rpc.url.replace("http", "ws"));
      expect(container.chainId).toBe(1337);
      expect(container.chain.id).toBe(1337);
      expect(container.chain.name).toBe("Anvil (1337)");
      expect(container.chain.rpcUrls.default.http).toEqual([rpc.url]);
      expect(container.configuration.chainId).toBe(1337);
      expect(container.client.chain?.id).toBe(1337);
      expect(container.getHost()).toBe("127.0.0.1");
      expect(container.getMappedPort(8545)).toBe(rpc.port);
    });

    it("rpc() sends raw requests", async () => {
      const container = started();
      await expect(container.rpc("anvil_setChainId", [1])).rejects.toThrow(
        /Method not found/,
      );
      rpc.overrides.set("anvil_setChainId", () => null);
      await expect(container.rpc("anvil_setChainId", [1])).resolves.toBeNull();
      expect(rpc.callsFor("anvil_setChainId")[1].params).toEqual([1]);
    });
  });

  describe("accounts", () => {
    it("lists addresses", async () => {
      expect(await started().addresses()).toEqual(rpc.accounts);
    });

    it("derives private keys from the default mnemonic", async () => {
      const accounts = await started().accounts();
      expect(accounts).toHaveLength(3);
      expect(accounts[0]).toEqual({
        index: 0,
        address: rpc.accounts[0],
        privateKey:
          "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      });
      expect(privateKeyToAccount(accounts[1].privateKey!).address).toBe(
        rpc.accounts[1],
      );
      // cached
      expect(await started().accounts()).toHaveLength(3);
    });

    it("derives keys for custom mnemonics and derivation paths", async () => {
      const options = new AnvilOptions().account
        .withMnemonic(DEFAULT_MNEMONIC)
        .withDerivationPath("m/44'/60'/1'/0/");
      const accounts = await started(options).accounts();
      expect(accounts[0].privateKey).toBeDefined();
      expect(accounts[0].privateKey).not.toBe(
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      );
    });

    it("fast key derivation matches viem's reference implementation", () => {
      const reference = (mnemonic: string, path: string) =>
        toHexKey(
          mnemonicToAccount(mnemonic, {
            path: path as `m/44'/60'/${string}`,
          }).getHdKey().privateKey!,
        );
      const phrase =
        "legal winner thank year wave sausage worth useful legal winner thank yellow";
      const cases: Array<[string, string, number]> = [
        [DEFAULT_MNEMONIC, "m/44'/60'/0'/0/", 0],
        [DEFAULT_MNEMONIC, "m/44'/60'/0'/0/", 2],
        [DEFAULT_MNEMONIC, "m/44'/60'/7'/1/", 1],
        [DEFAULT_MNEMONIC, "m/44'/60'/0'/0", 1], // no trailing slash: anvil concatenates
        [phrase, "m/44'/60'/0'/0/", 0],
        [phrase, "m/44'/60'/3'/0/", 2],
      ];
      for (const [mnemonic, path, index] of cases) {
        expect(deriveAccountKeys(mnemonic, path, index + 1)[index]).toBe(
          reference(mnemonic, `${path}${index}`),
        );
      }
    });

    it("parses keys from the startup banner for random mnemonics", async () => {
      fake.logOutput = BANNER;
      const accounts = await started(
        new AnvilOptions().account.withRandomMnemonic(),
      ).accounts();
      expect(accounts[0].privateKey).toBe(
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      );
      expect(accounts[1].privateKey).toBe(
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      );
      expect(accounts[2].privateKey).toBeUndefined();
    });

    it("leaves keys undefined in quiet mode with a random mnemonic", async () => {
      fake.logOutput = BANNER;
      const options = new AnvilOptions().account
        .withMnemonicSeedUnsafe(1)
        .logs.quiet();
      const accounts = await started(options).accounts();
      expect(
        accounts.every((account) => account.privateKey === undefined),
      ).toBe(true);
    });

    it("parsePrivateKeysFromBanner handles missing or broken banners", () => {
      expect(parsePrivateKeysFromBanner("")).toBeUndefined();
      expect(
        parsePrivateKeysFromBanner("Private Keys\n====\n"),
      ).toBeUndefined();
      expect(
        parsePrivateKeysFromBanner(`Private Keys\n(1) 0x${"aa".repeat(32)}`),
      ).toBeUndefined();
      expect(
        parsePrivateKeysFromBanner(
          `Private Keys\n(0) 0x${"aa".repeat(32)}\n(5) 0x${"bb".repeat(32)}`,
        ),
      ).toEqual([`0x${"aa".repeat(32)}`]);
    });

    it("reads and sets balances", async () => {
      const container = started();
      const [alice] = rpc.accounts;
      expect(await container.getBalance(alice)).toBe(10n ** 22n);
      await container.setBalance(alice, 5n);
      expect(await container.getBalance(alice)).toBe(5n);
      await container.setBalanceEther(alice, "1.5");
      expect(await container.getBalance(alice)).toBe(parseEther("1.5"));
      await container.setBalanceEther(alice, 2);
      expect(await container.getBalance(alice)).toBe(parseEther("2"));
    });

    it("impersonates accounts", async () => {
      const container = started();
      const whale = "0x0000000000000000000000000000000000000001";
      await container.impersonate(whale);
      await container.stopImpersonating(whale);
      await container.setAutoImpersonate(true);
      expect(rpc.callsFor("anvil_impersonateAccount")[0].params).toEqual([
        whale,
      ]);
      expect(rpc.callsFor("anvil_stopImpersonatingAccount")[0].params).toEqual([
        whale,
      ]);
      expect(rpc.callsFor("anvil_autoImpersonateAccount")[0].params).toEqual([
        true,
      ]);

      let seen: AnvilTestClient | undefined;
      const result = await container.withImpersonation(whale, (client) => {
        seen = client;
        return Promise.resolve(42);
      });
      expect(result).toBe(42);
      expect(seen).toBe(container.client);
      await expect(
        container.withImpersonation(whale, () =>
          Promise.reject(new Error("inner")),
        ),
      ).rejects.toThrow("inner");
      expect(rpc.callsFor("anvil_impersonateAccount")).toHaveLength(3);
      expect(rpc.callsFor("anvil_stopImpersonatingAccount")).toHaveLength(3);
    });
  });

  describe("transactions", () => {
    it("sendEthTransaction waits for the receipt and mines only when automine is off", async () => {
      const container = started();
      const [alice, bob] = rpc.accounts;
      const receipt = await container.sendEthTransaction(alice, bob, "1");
      expect(receipt.status).toBe("success");
      expect(rpc.callsFor("eth_sendTransaction")[0].params[0]).toMatchObject({
        from: alice,
        to: bob,
        value: `0x${parseEther("1").toString(16)}`,
      });
      expect(rpc.callsFor("anvil_mine")).toHaveLength(0);

      rpc.automine = false;
      await container.sendEthTransaction(alice, bob, "1");
      expect(rpc.callsFor("anvil_mine")).toHaveLength(1);
    });

    it("mines when anvil_getAutomine is unavailable", async () => {
      rpc.failNext.set("anvil_getAutomine", { code: -32601, message: "nope" });
      const container = started();
      const [alice, bob] = rpc.accounts;
      await container.sendEthTransaction(alice, bob, "0.1");
      expect(rpc.callsFor("anvil_mine")).toHaveLength(0);
      expect(rpc.callsFor("anvil_getAutomine")).toHaveLength(1);
    });

    it("works with custom chain ids (no viem chain mismatch)", async () => {
      rpc.chainId = 1337;
      const container = started(new AnvilOptions().evm.withChainId(1337), 1337);
      const [alice, bob] = rpc.accounts;
      await expect(
        container.sendEthTransaction(alice, bob, "1"),
      ).resolves.toBeDefined();
    });

    it("deployContract sends creation bytecode with constructor args", async () => {
      rpc.automine = false;
      const container = started();
      const abi = container.contractAbi("WrappedEther/WrappedEther.json");
      const bytecode = container.contractBytecode(
        "WrappedEther/WrappedEther.bin",
      );
      const receipt = await container.deployContract(
        abi,
        bytecode,
        rpc.accounts[0],
      );
      expect(receipt.contractAddress).toBe(
        "0x5fbdb2315678afecb367f032d93f642f64180aa3",
      );
      const request = rpc.callsFor("eth_sendTransaction")[0].params[0] as {
        data: string;
      };
      expect(request.data).toBe(bytecode);
      expect(rpc.callsFor("anvil_mine")).toHaveLength(1);

      const ctorAbi = [
        {
          type: "constructor",
          stateMutability: "nonpayable",
          inputs: [{ name: "x", type: "uint256" }],
        },
      ];
      await container.deployContract(ctorAbi, "0x6001", rpc.accounts[0], [7n]);
      const withArgs = rpc.callsFor("eth_sendTransaction")[1].params[0] as {
        data: string;
      };
      expect(withArgs.data).toBe(`0x6001${"0".repeat(63)}7`);
    });
  });

  describe("mining, time, fees and limits", () => {
    it("forwards to the corresponding anvil/evm methods", async () => {
      const container = started();
      await container.mine();
      await container.mine(3, 10);
      expect(rpc.callsFor("anvil_mine").map((call) => call.params)).toEqual([
        ["0x1", "0x0"],
        ["0x3", "0xa"],
      ]);
      expect(await container.getAutomine()).toBe(true);
      await container.setAutomine(false);
      expect(rpc.callsFor("evm_setAutomine")[0].params).toEqual([false]);
      await container.setIntervalMining(5);
      expect(rpc.callsFor("evm_setIntervalMining")[0].params).toEqual([5]);
      await container.increaseTime(60);
      expect(rpc.callsFor("evm_increaseTime")[0].params).toEqual(["0x3c"]);
      await container.setNextBlockTimestamp(1_700_000_000);
      await container.setNextBlockTimestamp(1_700_000_001n);
      await container.setNextBlockTimestamp(new Date(1_700_000_002_999));
      expect(
        rpc.callsFor("evm_setNextBlockTimestamp").map((call) => call.params),
      ).toEqual([["0x6553f100"], ["0x6553f101"], ["0x6553f102"]]);
      await container.setMinGasPrice(1n);
      await container.setNextBlockBaseFeePerGas(2n);
      await container.setBlockGasLimit(3n);
      expect(rpc.callsFor("anvil_setMinGasPrice")[0].params).toEqual(["0x1"]);
      expect(rpc.callsFor("anvil_setNextBlockBaseFeePerGas")[0].params).toEqual(
        ["0x2"],
      );
      expect(rpc.callsFor("evm_setBlockGasLimit")[0].params).toEqual(["0x3"]);
    });
  });

  describe("client freshness", () => {
    it("never serves a cached block number (a local dev node changes instantly)", async () => {
      const container = started();
      expect(await container.client.getBlockNumber()).toBe(0n);
      await container.mine(2);
      expect(await container.client.getBlockNumber()).toBe(2n);
    });

    it("polls quickly for receipts and blocks", () => {
      expect(started().client.pollingInterval).toBeLessThanOrEqual(250);
    });
  });

  describe("state", () => {
    it("snapshot / revert / withSnapshot", async () => {
      const container = started();
      const id = await container.snapshot();
      expect(id).toBe("0x1");
      await container.revert(id);
      expect(rpc.callsFor("evm_revert")[0].params).toEqual(["0x1"]);

      await expect(
        container.withSnapshot(() => Promise.reject(new Error("fail"))),
      ).rejects.toThrow("fail");
      expect(await container.withSnapshot(() => Promise.resolve("ok"))).toBe(
        "ok",
      );
      expect(rpc.callsFor("evm_snapshot")).toHaveLength(3);
      expect(rpc.callsFor("evm_revert")).toHaveLength(3);
    });

    it("checkpoint() can be restored repeatedly (re-snapshots after each revert)", async () => {
      let next = 1;
      rpc.overrides.set("evm_snapshot", () => `0x${(next++).toString(16)}`);
      const container = started();
      const base = await container.checkpoint();
      await base.restore();
      await base.restore();
      expect(rpc.callsFor("evm_revert").map((call) => call.params[0])).toEqual([
        "0x1",
        "0x2",
      ]);
      expect(rpc.callsFor("evm_snapshot")).toHaveLength(3);
    });

    it("dumps state as JSON (the --load-state format) and loads JSON or hex files", async () => {
      const container = started();
      expect(await container.dumpState()).toBe(STATE_DUMP);
      const file = path.join(tmp, "nested", "state.json");
      await container.dumpStateToFile(file);
      expect(fs.readFileSync(file, "utf8")).toBe(STATE_JSON);

      await container.loadState(STATE_DUMP as HexString);
      await container.loadStateFromFile(file);
      const hexFile = path.join(tmp, "state.hex");
      fs.writeFileSync(hexFile, `${STATE_DUMP}\n`);
      await container.loadStateFromFile(hexFile);

      const jsonAsHex = `0x${Buffer.from(STATE_JSON).toString("hex")}`;
      expect(
        rpc.callsFor("anvil_loadState").map((call) => call.params),
      ).toEqual([[STATE_DUMP], [jsonAsHex], [STATE_DUMP]]);
    });

    it("decodeStateDump passes plain JSON bytes through", () => {
      expect(decodeStateDump(STATE_DUMP as HexString).toString()).toBe(
        STATE_JSON,
      );
      const plain: HexString = `0x${Buffer.from("{}").toString("hex")}`;
      expect(decodeStateDump(plain).toString()).toBe("{}");
      expect(decodeStateDump("0x").length).toBe(0);
    });
  });

  describe("diagnostics", () => {
    it("nodeInfo / metadata / setLoggingEnabled / logText", async () => {
      fake.logOutput = "line1\nline2\n";
      const container = started();
      expect((await container.nodeInfo()).hardFork).toBe("prague");
      expect((await container.metadata()).clientVersion).toBe("anvil/v1.6.0");
      await container.setLoggingEnabled(false);
      expect(rpc.callsFor("anvil_setLoggingEnabled")[0].params).toEqual([
        false,
      ]);
      expect(await container.logText()).toBe("line1\nline2\n");
      expect(await container.logText(1)).toBe("line1\nline2\n");
    });
  });

  describe("stop", () => {
    it("delegates to the underlying container when nothing has to be exported", async () => {
      const container = started();
      await container.stop({ timeout: 5 });
      expect(fake.stopCalls).toEqual([{ timeout: 5 }]);
      expect(getContainerRuntimeClient).not.toHaveBeenCalled();
    });

    it("stops gracefully, copies dumps to the host and removes the container", async () => {
      const target = path.join(tmp, "out", "state.json");
      const remove = jest.fn().mockResolvedValue(undefined);
      const getById = jest.fn().mockReturnValue({ id: "fake-container-id" });
      (getContainerRuntimeClient as jest.Mock).mockResolvedValue({
        container: { remove, getById },
      });
      fake.archives.set(
        CONTAINER_FILE_PATHS["--dump-state"],
        buildTar("anvil-dump-state.json", "0xstate"),
      );

      const container = started(new AnvilOptions().state.withDumpState(target));
      const stopped = await container.stop();
      expect(stopped).toBe(fake.stopped);
      expect(fake.stopCalls).toEqual([
        { timeout: DEFAULT_GRACEFUL_STOP_TIMEOUT_MS, remove: false },
      ]);
      expect(fs.readFileSync(target, "utf8")).toBe("0xstate");
      expect(getById).toHaveBeenCalledWith("fake-container-id");
      expect(remove).toHaveBeenCalledWith(
        { id: "fake-container-id" },
        { removeVolumes: true },
      );
    });

    it("honours custom timeout / remove / removeVolumes options", async () => {
      const remove = jest.fn().mockResolvedValue(undefined);
      (getContainerRuntimeClient as jest.Mock).mockResolvedValue({
        container: { remove, getById: () => ({}) },
      });
      fake.archives.set(
        CONTAINER_FILE_PATHS["--state"],
        buildTar("anvil-state.json", "0x"),
      );
      const container = started(
        new AnvilOptions().state.withState(path.join(tmp, "s.json")),
      );
      await container.stop({ timeout: 1_000, remove: false });
      expect(fake.stopCalls).toEqual([{ timeout: 1_000, remove: false }]);
      expect(remove).not.toHaveBeenCalled();

      await container.stop({ removeVolumes: false });
      expect(remove).toHaveBeenLastCalledWith({}, { removeVolumes: false });
    });

    it("still removes the container when the export fails and reports why", async () => {
      const remove = jest.fn().mockResolvedValue(undefined);
      (getContainerRuntimeClient as jest.Mock).mockResolvedValue({
        container: { remove, getById: () => ({}) },
      });
      const container = started(
        new AnvilOptions().state.withDumpState(path.join(tmp, "d.json")),
      );
      await expect(container.stop()).rejects.toThrow(
        /Could not copy --dump-state output ".*anvil-dump-state.json" out of the container/,
      );
      expect(remove).toHaveBeenCalledTimes(1);
    });
  });

  describe("artifacts", () => {
    it("loads ABI and bytecode from the configured directory", () => {
      const container = started();
      expect(
        container.contractAbi("WrappedEther/WrappedEther.json").length,
      ).toBeGreaterThan(0);
      expect(
        container.contractBytecode("WrappedEther/WrappedEther.bin"),
      ).toMatch(/^0x/);
      const other = new StartedAnvilContainer(fake, {
        rpcUrl: rpc.url,
        chainId: 1,
        configuration: new AnvilOptions().build(),
        artifactsDir: tmp,
      });
      expect(() => other.contractAbi("WrappedEther/WrappedEther.json")).toThrow(
        /not found/,
      );
    });
  });

  it("exportFiles only copies transfers for the requested moment", async () => {
    const startTarget = path.join(tmp, "config.json");
    const stopTarget = path.join(tmp, "dump.json");
    fake.archives.set(
      CONTAINER_FILE_PATHS["--config-out"],
      buildTar("c", "cfg"),
    );
    fake.archives.set(
      CONTAINER_FILE_PATHS["--dump-state"],
      buildTar("d", "dump"),
    );
    const container = started(
      new AnvilOptions().state
        .withConfigOut(startTarget)
        .withDumpState(stopTarget),
    );
    await container.exportFiles("start");
    expect(fs.existsSync(startTarget)).toBe(true);
    expect(fs.existsSync(stopTarget)).toBe(false);
  });

  it("type: HexString helpers compile", () => {
    const value: HexString = "0x01";
    expect(value).toBe("0x01");
  });
});

function toHexKey(bytes: Uint8Array): string {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}
