import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Abi, parseEther, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  AnvilOptions,
  AnvilStartupError,
  Hardfork,
  HexString,
  LogVerbosity,
  StartedAnvilContainer,
} from "../../src";
import {
  describeE2E,
  E2E_ENABLED,
  E2E_MODE,
  FIXTURES,
  startAnvil,
} from "../helpers/e2e";

jest.setTimeout(180_000);

describeE2E(`AnvilContainer e2e (${E2E_MODE} mode)`, () => {
  describe("default configuration", () => {
    let anvil: StartedAnvilContainer;

    beforeAll(async () => {
      anvil = await startAnvil();
    });

    afterAll(async () => {
      await anvil?.stop();
    });

    it("is reachable and reports anvil's defaults", async () => {
      expect(await anvil.client.getBlockNumber()).toBe(0n);
      expect(anvil.chainId).toBe(31337);
      expect(await anvil.client.getChainId()).toBe(31337);
      expect(await anvil.addresses()).toHaveLength(10);
      expect(anvil.rpcUrl).toMatch(/^http:\/\//);
      expect(anvil.wsUrl).toMatch(/^ws:\/\//);
    });

    it("derives the private keys of the default accounts", async () => {
      const accounts = await anvil.accounts();
      expect(accounts).toHaveLength(10);
      for (const account of accounts) {
        expect(account.privateKey).toBeDefined();
        expect(privateKeyToAccount(account.privateKey!).address).toBe(
          account.address,
        );
      }
    });

    it("sends Ether between dev accounts", async () => {
      const [alice, bob] = await anvil.addresses();
      const before = await anvil.getBalance(bob);
      const receipt = await anvil.sendEthTransaction(alice, bob, "1");
      expect(receipt.status).toBe("success");
      expect(receipt.from.toLowerCase()).toBe(alice.toLowerCase());
      expect(receipt.to?.toLowerCase()).toBe(bob.toLowerCase());
      expect(await anvil.getBalance(bob)).toBe(before + parseEther("1"));
    });

    it("deploys and invokes a contract", async () => {
      const [deployer] = await anvil.addresses();
      const abi: Abi = anvil.contractAbi("WrappedEther/WrappedEther.json");
      const receipt = await anvil.deployContract(
        abi,
        anvil.contractBytecode("WrappedEther/WrappedEther.bin"),
        deployer,
      );
      expect(receipt.status).toBe("success");
      expect(receipt.contractAddress).toBeDefined();

      const hash = await anvil.client.writeContract({
        address: receipt.contractAddress as HexString,
        abi,
        functionName: "deposit",
        value: parseEther("1.0"),
        account: deployer,
      });
      const depositReceipt = await anvil.client.waitForTransactionReceipt({
        hash,
      });
      const [event] = parseEventLogs({
        abi,
        logs: depositReceipt.logs,
        eventName: "Deposit",
      });
      expect(event.eventName).toBe("Deposit");
      expect((event.args as { wad: bigint }).wad).toBe(parseEther("1.0"));
    });

    it("supports snapshots, time travel, balances and impersonation", async () => {
      const stranger = "0x1111111111111111111111111111111111111111";
      const [, bob] = await anvil.addresses();
      await anvil.withSnapshot(async () => {
        await anvil.setBalanceEther(stranger, "10");
        expect(await anvil.getBalance(stranger)).toBe(parseEther("10"));
        await anvil.withImpersonation(stranger, async () => {
          const receipt = await anvil.sendEthTransaction(stranger, bob, "1");
          expect(receipt.status).toBe("success");
        });
        const before = await anvil.client.getBlock();
        await anvil.increaseTime(3_600);
        await anvil.mine();
        const after = await anvil.client.getBlock();
        expect(after.timestamp - before.timestamp).toBeGreaterThanOrEqual(
          3_600n,
        );
      });
      expect(await anvil.getBalance(stranger)).toBe(0n);
    });

    it("checkpoint() isolates tests repeatedly on one node", async () => {
      const probe = "0x3333333333333333333333333333333333333333";
      const base = await anvil.checkpoint();
      for (const ether of ["1", "2", "3"]) {
        await anvil.setBalanceEther(probe, ether);
        await anvil.mine();
        expect(await anvil.getBalance(probe)).toBe(parseEther(ether));
        await base.restore();
        expect(await anvil.getBalance(probe)).toBe(0n);
      }
    });

    it("exposes diagnostics", async () => {
      const info = await anvil.nodeInfo();
      expect(info.hardFork).toBeDefined();
      const metadata = await anvil.metadata();
      expect(metadata.chainId).toBe(31337);
      expect(metadata.clientVersion).toMatch(/anvil/);
      expect(await anvil.logText()).toMatch(/Listening on /);
    });
  });

  describe("custom chain identity, server, mining and logging options", () => {
    let anvil: StartedAnvilContainer;

    beforeAll(async () => {
      const options = new AnvilOptions().account
        .withAccounts(5)
        .withBalance(100)
        .withRandomMnemonic(24)
        .evm.withChainId(1337)
        .withHardfork(Hardfork.Cancun)
        .withGasLimit(50_000_000)
        .server.withPort(9545)
        .noCors()
        .mining.withNoMining()
        .logs.verboseLogs(LogVerbosity.Two)
        .state.withTimestamp(1_700_000_000);
      anvil = await startAnvil(options);
    });

    afterAll(async () => {
      await anvil?.stop();
    });

    it("applies the configuration", async () => {
      expect(anvil.chainId).toBe(1337);
      expect(await anvil.client.getChainId()).toBe(1337);
      expect(anvil.getMappedPort(9545)).toBeGreaterThan(0);
      const addresses = await anvil.addresses();
      expect(addresses).toHaveLength(5);
      expect(await anvil.getBalance(addresses[0])).toBe(parseEther("100"));
      expect(await anvil.getAutomine()).toBe(false);
      const genesis = await anvil.client.getBlock({ blockNumber: 0n });
      expect(genesis.timestamp).toBe(1_700_000_000n);
      expect(genesis.gasLimit).toBe(50_000_000n);
    });

    it("parses random-mnemonic keys from the banner", async () => {
      const accounts = await anvil.accounts();
      expect(accounts).toHaveLength(5);
      for (const account of accounts) {
        expect(privateKeyToAccount(account.privateKey!).address).toBe(
          account.address,
        );
      }
    });

    it("sends transactions on a custom chain id with on-demand mining", async () => {
      const [alice, bob] = await anvil.addresses();
      const receipt = await anvil.sendEthTransaction(alice, bob, "1");
      expect(receipt.status).toBe("success");
    });
  });

  describe("startup reliability", () => {
    it("becomes ready in quiet mode (no log output)", async () => {
      const anvil = await startAnvil(new AnvilOptions().logs.quiet());
      try {
        expect(await anvil.client.getBlockNumber()).toBe(0n);
        const accounts = await anvil.accounts();
        expect(accounts[0].privateKey).toBeDefined();
      } finally {
        await anvil.stop();
      }
    });

    it("becomes ready with JSON logs and interval mining", async () => {
      const options = new AnvilOptions().logs
        .jsonLogFormat()
        .mining.withBlockTime(0.25);
      const anvil = await startAnvil(options);
      try {
        const before = await anvil.client.getBlockNumber();
        let after = before;
        for (let i = 0; i < 40 && after <= before; i++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          after = await anvil.client.getBlockNumber();
        }
        expect(after).toBeGreaterThan(before);
      } finally {
        await anvil.stop();
      }
    });

    it("fails fast with anvil's error output when the process exits", async () => {
      const options = new AnvilOptions().fork
        .withForkUrl("http://127.0.0.1:9/unreachable")
        .withRetries(0)
        .withTimeout(1_000);
      const started = Date.now();
      await expect(
        startAnvil(options, { startupTimeoutMs: 120_000 }),
      ).rejects.toBeInstanceOf(AnvilStartupError);
      expect(Date.now() - started).toBeLessThan(90_000);
    });
  });

  describe("state persistence", () => {
    let tmp: string;

    beforeAll(() => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), "anvil-int-state-"));
    });

    afterAll(() => {
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    it("dumps state on stop, exports --config-out and loads the dump in a new container", async () => {
      const dump = path.join(tmp, "state.json");
      const configOut = path.join(tmp, "config.json");
      const first = await startAnvil(
        new AnvilOptions().state.withDumpState(dump).withConfigOut(configOut),
      );
      let contractAddress: HexString;
      try {
        expect(fs.existsSync(configOut)).toBe(true);
        const config = JSON.parse(fs.readFileSync(configOut, "utf8")) as {
          wallet?: { accounts?: unknown[] };
        };
        expect(config).toBeDefined();

        const [deployer] = await first.addresses();
        const receipt = await first.deployContract(
          first.contractAbi("WrappedEther/WrappedEther.json"),
          first.contractBytecode("WrappedEther/WrappedEther.bin"),
          deployer,
        );
        contractAddress = receipt.contractAddress as HexString;
      } finally {
        await first.stop();
      }
      expect(fs.existsSync(dump)).toBe(true);
      expect(fs.statSync(dump).size).toBeGreaterThan(0);

      const second = await startAnvil(
        new AnvilOptions().state.withLoadState(dump),
      );
      try {
        const code = await second.client.getCode({ address: contractAddress });
        expect(code).toBeDefined();
        expect(code!.length).toBeGreaterThan(2);
      } finally {
        await second.stop();
      }
    });

    it("initialises genesis from a host genesis.json (--init)", async () => {
      const anvil = await startAnvil(
        new AnvilOptions().state.withInit(FIXTURES.genesis),
      );
      try {
        const funded = "0x0000000000000000000000000000000000000abc";
        expect(await anvil.getBalance(funded)).toBe(parseEther("1000"));
      } finally {
        await anvil.stop();
      }
    });

    it("loads a state snapshot written by anvil 1.6.0-rc1 (--load-state)", async () => {
      const anvil = await startAnvil(
        new AnvilOptions().state.withLoadState(FIXTURES.state),
      );
      try {
        expect(await anvil.client.getBlockNumber()).toBeGreaterThanOrEqual(0n);
        expect(await anvil.addresses()).toHaveLength(10);
      } finally {
        await anvil.stop();
      }
    });

    it("persists state across restarts with --state", async () => {
      const file = path.join(tmp, "persistent.json");
      const stranger = "0x2222222222222222222222222222222222222222";
      const first = await startAnvil(new AnvilOptions().state.withState(file));
      try {
        await first.setBalanceEther(stranger, "42");
      } finally {
        await first.stop();
      }
      expect(fs.existsSync(file)).toBe(true);
      const second = await startAnvil(new AnvilOptions().state.withState(file));
      try {
        expect(await second.getBalance(stranger)).toBe(parseEther("42"));
      } finally {
        await second.stop();
      }
    });

    it("round-trips state through dumpStateToFile / loadStateFromFile", async () => {
      const anvil = await startAnvil();
      try {
        const file = path.join(tmp, "runtime-state.json");
        const [alice] = await anvil.addresses();
        await anvil.setBalanceEther(alice, "12345");
        await anvil.dumpStateToFile(file);
        await anvil.setBalanceEther(alice, "1");
        await anvil.loadStateFromFile(file);
        expect(await anvil.getBalance(alice)).toBe(parseEther("12345"));
      } finally {
        await anvil.stop();
      }
    });
  });
});

const forkUrl = process.env.ANVIL_FORK_URL;
const describeFork = forkUrl && E2E_ENABLED ? describe : describe.skip;

describeFork(
  `AnvilContainer forking e2e (${E2E_MODE} mode, requires ANVIL_FORK_URL)`,
  () => {
    it("forks the remote network", async () => {
      const options = new AnvilOptions().fork
        .withForkUrl(forkUrl!)
        .withRetries(3);
      const blockNumber = process.env.ANVIL_FORK_BLOCK_NUMBER;
      if (blockNumber) options.fork.withForkBlockNumber(BigInt(blockNumber));
      const anvil = await startAnvil(options, { startupTimeoutMs: 180_000 });
      try {
        const metadata = await anvil.metadata();
        expect(metadata.forkedNetwork).toBeDefined();
        expect(anvil.chainId).toBe(metadata.forkedNetwork!.chainId);
        if (blockNumber) {
          expect(await anvil.client.getBlockNumber()).toBe(BigInt(blockNumber));
        }
      } finally {
        await anvil.stop();
      }
    });
  },
);
