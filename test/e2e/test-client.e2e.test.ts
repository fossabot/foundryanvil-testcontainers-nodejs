/**
 * The pre-configured viem test client against a real anvil (Docker, or a
 * local binary with `pnpm test:e2e --no-docker`). Every viem test action and
 * every anvil extra is exercised; the last test of the shared-node suite
 * asserts that none was missed.
 */
import {
  Abi,
  Address,
  encodeAbiParameters,
  Hex,
  parseEther,
  parseGwei,
  toFunctionSelector,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  AnvilContainer,
  AnvilOptions,
  AnvilTestClientConfigurationError,
  AnvilTestClientError,
  AnvilTransactionRevertedError,
  Hardfork,
  StartedAnvilContainer,
  TestClientOptions,
  useAnvil,
} from "../../src";
import {
  describeE2E,
  E2E_MODE,
  startable,
  startContainer,
  startForkPair,
} from "../helpers/e2e";
import { trackCalls, VIEM_TEST_ACTIONS } from "../helpers/viem-actions";

jest.setTimeout(120_000);

const STRANGER: Address = "0x1111111111111111111111111111111111111111";
const RECEIVER: Address = "0x2222222222222222222222222222222222222222";
const COINBASE: Address = "0x4444444444444444444444444444444444444444";

/** Runtime code that always reverts with `Error("nope")`. */
const REVERTS_WITH_NOPE: Hex = (() => {
  const payload = (
    toFunctionSelector("Error(string)") +
    encodeAbiParameters([{ type: "string" }], ["nope"]).slice(2)
  ).slice(2);
  const length = (payload.length / 2).toString(16).padStart(2, "0");
  // PUSH1 len PUSH1 12 PUSH1 0 CODECOPY PUSH1 len PUSH1 0 REVERT <payload>
  return `0x60${length}600c60003960${length}6000fd${payload}`;
})();

/** Runtime code returning the 32-byte word 42. */
const RETURNS_42: Hex = "0x602a60005260206000f3";

describeE2E(`viem test client e2e (${E2E_MODE} mode)`, () => {
  describe("shared node with a default account (useAnvil, per-test isolation)", () => {
    const invoked = new Set<string>();
    let weth: Address;
    let abi: Abi;
    const anvil = useAnvil(
      startable(
        new AnvilContainer(
          new AnvilOptions().account.withAccounts(4),
        ).withTestClient((client) => client.withAccount(0)),
      ),
      {
        setup: async (node) => {
          abi = node.contractAbi("WrappedEther/WrappedEther.json");
          const receipt = await node.deployContract(
            abi,
            node.contractBytecode("WrappedEther/WrappedEther.bin"),
            (await node.addresses())[0],
          );
          weth = receipt.contractAddress!;
        },
      },
    );
    const client = () => trackCalls(anvil.testClient, invoked);

    it("is bound to the node and hoists the default account", async () => {
      const [alice] = await anvil.addresses();
      const c = client();
      expect(c.mode).toBe("anvil");
      expect(c.chain.id).toBe(anvil.chainId);
      expect(c.account.address).toBe(alice);
      // No `account` argument: the default account signs (through anvil).
      const receipt = await anvil.confirm(
        c.sendTransaction({ to: RECEIVER, value: parseEther("1") }),
      );
      expect(receipt.from.toLowerCase()).toBe(alice.toLowerCase());
      expect(await c.getBalance({ address: RECEIVER })).toBe(parseEther("1"));
    });

    it("per-test isolation restored the state after setup", async () => {
      expect(await client().getBalance({ address: RECEIVER })).toBe(0n);
      expect(await client().getCode({ address: weth })).toMatch(/^0x6/);
    });

    it("controls balances, code, nonces and storage", async () => {
      const c = client();
      await c.setBalance({ address: STRANGER, value: parseEther("5") });
      await c.addBalance({ address: STRANGER, value: parseEther("1") });
      expect(await c.getBalance({ address: STRANGER })).toBe(parseEther("6"));

      await c.setCode({ address: STRANGER, bytecode: RETURNS_42 });
      expect(await c.getCode({ address: STRANGER })).toBe(RETURNS_42);
      expect(BigInt((await c.call({ to: STRANGER })).data ?? "0x0")).toBe(42n);

      await c.setNonce({ address: STRANGER, nonce: 7 });
      expect(await c.getTransactionCount({ address: STRANGER })).toBe(7);

      const word: Hex = `0x${"ab".repeat(32)}`;
      await c.setStorageAt({ address: STRANGER, index: 3, value: word });
      expect(await c.getStorageAt({ address: STRANGER, slot: "0x3" })).toBe(
        word,
      );
    });

    it("impersonates accounts (explicit, auto and unsigned transactions)", async () => {
      const c = client();
      await c.setBalance({ address: STRANGER, value: parseEther("10") });
      await c.impersonateAccount({ address: STRANGER });
      await anvil.confirm(
        c.sendTransaction({ account: STRANGER, to: RECEIVER, value: 1n }),
      );
      await c.stopImpersonatingAccount({ address: STRANGER });
      await expect(
        c.sendTransaction({ account: STRANGER, to: RECEIVER, value: 1n }),
      ).rejects.toThrow();

      await c.setAutoImpersonate(true);
      try {
        await anvil.confirm(
          c.sendTransaction({ account: STRANGER, to: RECEIVER, value: 1n }),
        );
      } finally {
        await c.setAutoImpersonate(false);
      }

      const hash = await c.sendUnsignedTransaction({
        from: STRANGER,
        to: RECEIVER,
        value: 1n,
      });
      await anvil.confirm(hash);
      expect(await c.getBalance({ address: RECEIVER })).toBe(3n);
    });

    it("deals ERC-20 balances and allowances", async () => {
      const [alice, bob] = await anvil.addresses();
      const c = client();
      await c.dealErc20({ token: weth, address: bob, amount: 123n });
      await c.setErc20Allowance({
        token: weth,
        owner: bob,
        spender: alice,
        amount: 45n,
      });
      expect(
        await c.readContract({
          address: weth,
          abi,
          functionName: "balanceOf",
          args: [bob],
        }),
      ).toBe(123n);
      expect(
        await c.readContract({
          address: weth,
          abi,
          functionName: "allowance",
          args: [bob, alice],
        }),
      ).toBe(45n);
    });

    it("controls mining: automine, blocks and interval mining", async () => {
      const c = client();
      const start = await c.getBlockNumber();
      await c.mine({ blocks: 3 });
      expect(await c.getBlockNumber()).toBe(start + 3n);

      expect(await c.getAutomine()).toBe(true);
      await c.setAutomine(false);
      try {
        expect(await c.getAutomine()).toBe(false);
        const hash = await c.sendTransaction({ to: RECEIVER, value: 1n });
        expect(await c.getBlockNumber()).toBe(start + 3n);
        const receipt = await c.confirmTransaction({ hash });
        expect(receipt.blockNumber).toBe(start + 4n);
      } finally {
        await c.setAutomine(true);
      }

      expect(await c.getIntervalMining()).toBeUndefined();
      await c.setIntervalMining({ interval: 1 });
      try {
        expect(await c.getIntervalMining()).toBe(1);
        const before = await c.getBlockNumber();
        let after = before;
        for (let i = 0; i < 60 && after === before; i++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          after = await c.getBlockNumber();
        }
        expect(after).toBeGreaterThan(before);
      } finally {
        await c.setIntervalMining({ interval: 0 });
        await c.setAutomine(true);
      }
      expect(await c.getIntervalMining()).toBeUndefined();
    });

    it("travels in time", async () => {
      const c = client();
      const latest = async () => (await c.getBlock()).timestamp;

      const now = await latest();
      await c.increaseTime({ seconds: 3_600 });
      await c.mine({ blocks: 1 });
      expect((await latest()) - now).toBeGreaterThanOrEqual(3_600n);

      const target = (await latest()) + 1_000n;
      await c.setNextBlockTimestamp({ timestamp: target });
      await c.mine({ blocks: 1 });
      expect(await latest()).toBe(target);

      await c.setBlockTimestampInterval({ interval: 10 });
      try {
        const base = await latest();
        await c.mine({ blocks: 2 });
        expect(await latest()).toBe(base + 20n);
      } finally {
        await c.removeBlockTimestampInterval();
      }

      const future = new Date("2040-01-01T00:00:00Z");
      await c.setTime({ timestamp: future });
      await c.mine({ blocks: 1 });
      expect(await latest()).toBeGreaterThanOrEqual(
        BigInt(future.getTime() / 1000),
      );
      expect(await anvil.latestTimestamp()).toBe(await latest());
    });

    it("sets coinbase, base fee and block gas limit of the next blocks", async () => {
      const c = client();
      await c.setCoinbase({ address: COINBASE });
      await c.setNextBlockBaseFeePerGas({ baseFeePerGas: parseGwei("7") });
      await c.setBlockGasLimit({ gasLimit: 20_000_000n });
      await c.mine({ blocks: 1 });
      const block = await c.getBlock();
      expect(block.miner.toLowerCase()).toBe(COINBASE.toLowerCase());
      expect(block.baseFeePerGas).toBe(parseGwei("7"));
      expect(block.gasLimit).toBe(20_000_000n);
      // Not part of the EVM state: restore for the following tests.
      await c.setBlockGasLimit({ gasLimit: 30_000_000n });
      // Legacy gas pricing only: rejected while EIP-1559 is active.
      await expect(c.setMinGasPrice({ gasPrice: 1n })).rejects.toThrow(
        /not supported when EIP-1559 is active/,
      );
    });

    it("inspects and edits the transaction pool", async () => {
      const [alice, bob] = await anvil.addresses();
      const c = client();
      await c.setAutomine(false);
      try {
        const first = await c.sendTransaction({ to: RECEIVER, value: 1n });
        await c.sendTransaction({ to: RECEIVER, value: 2n });
        await c.sendTransaction({ account: bob, to: RECEIVER, value: 3n });
        expect(await c.getTxpoolStatus()).toEqual({ pending: 3, queued: 0 });
        const content = await c.getTxpoolContent();
        expect(
          Object.keys(content.pending).map((a) => a.toLowerCase()),
        ).toEqual(
          expect.arrayContaining([alice.toLowerCase(), bob.toLowerCase()]),
        );
        const inspection = await c.inspectTxpool();
        expect(JSON.stringify(inspection.pending)).toContain(
          RECEIVER.slice(2).toLowerCase(),
        );

        await c.dropTransaction({ hash: first });
        expect((await c.getTxpoolStatus()).pending).toBe(2);
        await c.removePoolTransactions({ address: bob });
        expect((await c.getTxpoolStatus()).pending).toBe(1);
        await c.dropAllTransactions();
        expect((await c.getTxpoolStatus()).pending).toBe(0);
      } finally {
        await c.setAutomine(true);
      }
    });

    it("snapshots strictly: reverting a consumed snapshot throws", async () => {
      const c = client();
      const id = await c.snapshot();
      await c.setBalance({ address: STRANGER, value: 1n });
      await c.revert({ id });
      expect(await c.getBalance({ address: STRANGER })).toBe(0n);
      await expect(c.revert({ id })).rejects.toMatchObject({
        code: "SNAPSHOT_NOT_FOUND",
      });

      const base = await anvil.checkpoint();
      for (const value of [1n, 2n]) {
        await c.setBalance({ address: STRANGER, value });
        await base.restore();
        expect(await c.getBalance({ address: STRANGER })).toBe(0n);
      }
    });

    it("dumps and loads state", async () => {
      const c = client();
      await c.setBalance({ address: STRANGER, value: 99n });
      const state = await c.dumpState();
      await c.setBalance({ address: STRANGER, value: 1n });
      await c.loadState({ state });
      expect(await c.getBalance({ address: STRANGER })).toBe(99n);
    });

    it("rolls back and reorganises blocks", async () => {
      const c = client();
      await c.mine({ blocks: 3 });
      const height = await c.getBlockNumber();
      await c.rollback({ depth: 2 });
      expect(await c.getBlockNumber()).toBe(height - 2n);

      await c.mine({ blocks: 2 });
      const [alice] = await anvil.addresses();
      await c.reorg({
        depth: 2,
        transactions: [
          { transaction: { from: alice, to: STRANGER, value: 5n }, block: 0 },
        ],
      });
      expect(await c.getBlockNumber()).toBe(height);
      expect(await c.getBalance({ address: STRANGER })).toBe(5n);
    });

    it("confirms transactions and reports reverts with their reason", async () => {
      const c = client();
      await c.setCode({ address: STRANGER, bytecode: REVERTS_WITH_NOPE });
      // An explicit gas limit skips estimation, so the revert is mined.
      const hash = await c.sendTransaction({ to: STRANGER, gas: 100_000n });
      const error = await c
        .confirmTransaction({ hash })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AnvilTransactionRevertedError);
      expect((error as AnvilTransactionRevertedError).reason).toMatch(/nope/);
      expect((error as AnvilTransactionRevertedError).receipt.status).toBe(
        "reverted",
      );
      const receipt = await c.confirmTransaction({
        hash,
        throwOnRevert: false,
      });
      expect(receipt.status).toBe("reverted");
    });

    it("exposes node info, metadata, logging and the fork RPC URL", async () => {
      const c = client();
      expect((await c.getNodeInfo()).hardFork).toBeDefined();
      expect((await c.getMetadata()).chainId).toBe(anvil.chainId);
      await c.setLoggingEnabled(false);
      await c.setLoggingEnabled(true);
      // Accepted on a non-forked node; takes effect for forks.
      await c.setRpcUrl("http://127.0.0.1:9");
    });

    it("runs fluent cheat chains with step-level errors", async () => {
      const [, bob] = await anvil.addresses();
      const before = await anvil.latestTimestamp();
      await anvil.cheats
        .setBalanceEther(STRANGER, 2)
        .impersonate(STRANGER)
        .step((c) =>
          c.sendTransaction({ account: STRANGER, to: bob, value: 1n }),
        )
        .stopImpersonating(STRANGER)
        .increaseTime({ days: 1 })
        .mine();
      expect(await anvil.latestTimestamp()).toBeGreaterThanOrEqual(
        before + 86_400n,
      );

      const failing = anvil.cheats
        .setBalance(STRANGER, 1n)
        .setMinGasPrice(1n) // rejected by anvil while EIP-1559 is active
        .mine();
      await expect(failing).rejects.toMatchObject({
        code: "CHEAT_FAILED",
        message: expect.stringMatching(
          /step 2\/3 setMinGasPrice\(1n\) failed: .*EIP-1559.*\(steps 1–1 were applied\)/s,
        ) as unknown,
      });
      expect(await anvil.getBalance(STRANGER)).toBe(1n);
    });

    it("acts as other accounts: node-signed and locally signed", async () => {
      const accounts = await anvil.accounts();
      const bob = anvil.testClientFor(accounts[1].address);
      expect(bob.account.address).toBe(accounts[1].address);
      await anvil.confirm(bob.sendTransaction({ to: RECEIVER, value: 7n }));

      const local = anvil.testClientFor(
        privateKeyToAccount(accounts[2].privateKey!),
      );
      expect(local.account.type).toBe("local");
      await anvil.confirm(local.sendTransaction({ to: RECEIVER, value: 8n }));
      expect(await anvil.getBalance(RECEIVER)).toBe(15n);

      const signer = await anvil.createTestClient((o) =>
        o.withLocalAccount(3).withBatch({ wait: 5 }),
      );
      const [balance, nonce] = await Promise.all([
        signer.getBalance({ address: signer.account.address }),
        signer.getTransactionCount({ address: signer.account.address }),
      ]);
      expect(balance).toBeGreaterThan(0n);
      expect(nonce).toBe(0);
      await anvil.confirm(signer.sendTransaction({ to: RECEIVER, value: 1n }));
      expect(await anvil.getBalance(RECEIVER)).toBe(16n);
    });

    it("follows chain id changes (client, chain, transactions)", async () => {
      const original = anvil.chainId;
      const accounts = await anvil.accounts();
      const c = client();
      await c.setChainId({ chainId: 4_242 });
      try {
        expect(anvil.chainId).toBe(4_242);
        expect(await c.getChainId()).toBe(4_242);
        // Locally signed, impersonated and unsigned transactions follow.
        const local = anvil.testClientFor(
          privateKeyToAccount(accounts[1].privateKey!),
        );
        await anvil.confirm(local.sendTransaction({ to: RECEIVER, value: 1n }));
        await c.impersonateAccount({ address: accounts[2].address });
        await anvil.confirm(
          c.sendTransaction({
            account: accounts[2].address,
            to: RECEIVER,
            value: 1n,
          }),
        );
        await c.setBalance({ address: STRANGER, value: parseEther("1") });
        await anvil.confirm(
          c.sendUnsignedTransaction({ from: STRANGER, to: RECEIVER }),
        );
        // anvil (1.6) limitation: its dev-account signer keeps the startup
        // chain id. If this starts passing, update the README note.
        await expect(
          c.sendTransaction({ to: RECEIVER, value: 1n }),
        ).rejects.toThrow(/does not match the signer's chain ID/);
      } finally {
        await c.setChainId({ chainId: original });
      }
      expect(anvil.chain.id).toBe(original);
    });

    it("exercised every viem test action against anvil", () => {
      // reset() is covered by its own suite (it clears the isolation snapshot).
      invoked.add("reset");
      const missing = VIEM_TEST_ACTIONS.filter((name) => !invoked.has(name));
      expect(missing).toEqual([]);
    });
  });

  describe("per-test isolation on a --no-mining node", () => {
    const anvil = useAnvil(
      startable(new AnvilContainer(new AnvilOptions().mining.withNoMining())),
    );

    it("leaves a pending transaction behind…", async () => {
      const [alice] = await anvil.addresses();
      await anvil.testClient.sendTransaction({
        account: alice,
        to: RECEIVER,
        value: 1n,
      });
      expect((await anvil.testClient.getTxpoolStatus()).pending).toBe(1);
    });

    it("…which the next test neither sees nor mines", async () => {
      expect((await anvil.testClient.getTxpoolStatus()).pending).toBe(0);
      await anvil.mine();
      expect(await anvil.getBalance(RECEIVER)).toBe(0n);
    });
  });

  describe("reset", () => {
    let anvil: StartedAnvilContainer;

    beforeAll(async () => {
      anvil = await startContainer(new AnvilContainer());
    });

    afterAll(async () => {
      await anvil?.stop();
    });

    it("returns a non-forked node to genesis and clears snapshots", async () => {
      const [alice] = await anvil.addresses();
      const snapshot = await anvil.snapshot();
      await anvil.cheats
        .setBalance(STRANGER, 5n)
        .setCode(STRANGER, RETURNS_42)
        .mine(5);
      await anvil.sendEthTransaction(alice, RECEIVER, "1");

      await anvil.reset();

      expect(await anvil.testClient.getBlockNumber()).toBe(0n);
      expect(await anvil.getBalance(STRANGER)).toBe(0n);
      expect(await anvil.getBalance(RECEIVER)).toBe(0n);
      expect(await anvil.getBalance(alice)).toBe(parseEther("10000"));
      await expect(anvil.revert(snapshot)).rejects.toMatchObject({
        code: "SNAPSHOT_NOT_FOUND",
      });
    });

    it("keeps a changed chain id in sync across resets", async () => {
      await anvil.cheats.setChainId(999).reset();
      expect(anvil.chainId).toBe(999);
      expect(await anvil.testClient.getChainId()).toBe(999);
      await anvil.cheats.setChainId(31337);
    });
  });

  describe("reset on a forked node", () => {
    it("re-forks at the fork block instead of detaching from the fork", async () => {
      // Upstream blocks 1..3 pay STRANGER 1, 2 and 3 wei (balances 1, 3, 6).
      const pair = await startForkPair(
        (forkUrl) => new AnvilOptions().fork.withForkUrl(forkUrl, 2),
        async (upstream) => {
          const [alice] = await upstream.addresses();
          for (const value of [1n, 2n, 3n]) {
            await upstream.confirm(
              upstream.testClient.sendTransaction({
                account: alice,
                to: STRANGER,
                value,
              }),
            );
          }
        },
      );
      try {
        expect(await pair.fork.getBalance(STRANGER)).toBe(3n);

        await pair.fork.cheats.setBalance(STRANGER, 99n).mine(3);
        await pair.fork.reset();

        expect(await pair.fork.testClient.getBlockNumber()).toBe(2n);
        expect(await pair.fork.getBalance(STRANGER)).toBe(3n);
        expect(
          (await pair.fork.metadata()).forkedNetwork?.forkBlockNumber,
        ).toBe(2);

        await pair.fork.reset({ blockNumber: 3 });
        expect(await pair.fork.getBalance(STRANGER)).toBe(6n);
        await pair.fork.reset({ jsonRpcUrl: pair.forkUrl, blockNumber: 1 });
        expect(await pair.fork.getBalance(STRANGER)).toBe(1n);
        expect(await pair.upstream.getBalance(STRANGER)).toBe(6n);
      } finally {
        await pair.stop();
      }
    });
  });

  describe("transport, signing and lifecycle settings", () => {
    it("validates the test client against the anvil options before starting", async () => {
      const started = Date.now();
      await expect(
        startContainer(
          new AnvilContainer(
            new AnvilOptions().account.withAccounts(2),
          ).withTestClient((c) => c.withAccount(5)),
        ),
      ).rejects.toThrow(AnvilTestClientConfigurationError);
      await expect(
        startContainer(
          new AnvilContainer(
            new AnvilOptions().account.withRandomMnemonic().logs.quiet(),
          ).withTestClient((c) => c.withLocalAccount(0)),
        ),
      ).rejects.toThrow(/--quiet hides anvil's key banner/);
      expect(Date.now() - started).toBeLessThan(2_000);
    });

    it("signs locally with random-mnemonic keys read from the banner", async () => {
      const anvil = await startContainer(
        new AnvilContainer(
          new AnvilOptions().account.withRandomMnemonic().withAccounts(2),
        ).withTestClient((c) => c.withLocalAccount(1)),
      );
      try {
        const [, second] = await anvil.addresses();
        expect(anvil.testClient.account.address).toBe(second);
        expect(anvil.testClient.account.type).toBe("local");
        const receipt = await anvil.confirm(
          anvil.testClient.sendTransaction({ to: RECEIVER, value: 1n }),
        );
        expect(receipt.from.toLowerCase()).toBe(second.toLowerCase());
      } finally {
        await anvil.stop();
      }
    });

    it("impersonates a configured non-dev default account at startup", async () => {
      const anvil = await startContainer(
        new AnvilContainer().withTestClient((c) =>
          c.withAccount(STRANGER, { impersonate: true }),
        ),
      );
      try {
        await anvil.setBalanceEther(STRANGER, 1);
        const receipt = await anvil.confirm(
          anvil.testClient.sendTransaction({ to: RECEIVER, value: 1n }),
        );
        expect(receipt.from.toLowerCase()).toBe(STRANGER.toLowerCase());
      } finally {
        await anvil.stop();
      }
    });

    it("uses WebSocket subscriptions, and rejects use after stop", async () => {
      const anvil = await startContainer(
        new AnvilContainer(
          new AnvilOptions().evm.withChainId(1_337),
        ).withTestClient(
          new TestClientOptions()
            .withTransport("webSocket")
            .withChain({ name: "Local WS" }),
        ),
      );
      const c = anvil.testClient;
      expect(c.transport.type).toBe("webSocket");
      expect(c.chain.name).toBe("Local WS");
      expect(await c.getChainId()).toBe(1_337);

      let announced: bigint | undefined;
      const errors: Error[] = [];
      const unwatch = c.watchBlockNumber({
        onBlockNumber: (blockNumber) => (announced = blockNumber),
        onError: (error) => errors.push(error),
      });
      try {
        // eth_subscribe completes asynchronously (viem has no "ready" signal):
        // mine until the subscription reports a block instead of sleeping.
        for (let i = 0; i < 200 && announced === undefined; i++) {
          await c.mine({ blocks: 1 });
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      } finally {
        unwatch();
      }
      expect(errors).toEqual([]);
      expect(announced).toBeGreaterThanOrEqual(1n);

      const http = await anvil.createTestClient((o) => o.withTransport("http"));
      expect(http.transport.type).toBe("http");

      await anvil.stop();
      expect(anvil.isStopped).toBe(true);
      const error = await c.getBlockNumber().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AnvilTestClientError);
      expect((error as AnvilTestClientError).code).toBe("CONTAINER_STOPPED");
      await expect(http.getBlockNumber()).rejects.toMatchObject({
        code: "CONTAINER_STOPPED",
      });
    });

    it("supports pre-EIP-1559 fee controls on older hardforks", async () => {
      const anvil = await startContainer(
        new AnvilContainer(
          new AnvilOptions().evm.withHardfork(Hardfork.Berlin),
        ),
      );
      try {
        // Sets the gas price the node suggests; cheaper transactions still pass.
        await anvil.cheats.setMinGasPrice(parseGwei("3"));
        expect(await anvil.testClient.getGasPrice()).toBe(parseGwei("3"));
        const [alice] = await anvil.addresses();
        // Pre-London, node-signed transactions need an explicit gasPrice
        // (anvil 1.6 would otherwise fill EIP-1559 fields and reject them).
        const receipt = await anvil.confirm(
          anvil.testClient.sendTransaction({
            account: alice,
            to: RECEIVER,
            gasPrice: await anvil.testClient.getGasPrice(),
          }),
        );
        expect(receipt.type).toBe("legacy");
        expect(receipt.effectiveGasPrice).toBeGreaterThanOrEqual(
          parseGwei("3"),
        );
      } finally {
        await anvil.stop();
      }
    });
  });
});
