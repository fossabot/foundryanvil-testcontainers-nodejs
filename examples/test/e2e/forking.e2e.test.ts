/**
 * Workflow: forking. A second anvil forks an upstream chain at a block — here
 * another anvil playing "mainnet" with a deployed token — so tests run
 * against real deployed state, change anything locally and reset back.
 */
import {
  AnvilContainer,
  AnvilOptions,
  Hardfork,
  type StartedAnvilContainer,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import {
  type Account,
  type Address,
  parseEther,
  type TransactionReceipt,
} from "viem";
import { balanceOf, deployToken, exampleToken, mint } from "../../src";
import { type NodeNetwork, startNetwork } from "../support/runtime";

/** A token holder on "mainnet" whose key we do not have. */
const HOLDER: Address = "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503";

let network: NodeNetwork;
let mainnet: StartedAnvilContainer<Account>;
let forkUrl: string;
let forkBlock: bigint;
let token: Address;

beforeAll(async () => {
  network = await startNetwork();
  // #region upstream
  mainnet = await network
    .attach(
      new AnvilContainer(new AnvilOptions().evm.withChainId(1)),
      "mainnet",
      "mainnet-backup", // a second endpoint, see setRpcUrl below
    )
    .withTestClient((client) => client.withAccount(0))
    .start();
  token = await deployToken(mainnet.testClient, "Mainnet USD", "mUSD");
  await mint(mainnet.testClient, token, HOLDER, parseEther("1000000"));
  forkBlock = await mainnet.testClient.getBlockNumber();
  await mint(mainnet.testClient, token, HOLDER, 1n); // after the fork block
  forkUrl = network.urlOf(mainnet, "mainnet");
  // #endregion upstream
}, 120_000);

afterAll(async () => {
  await mainnet?.stop();
  await network?.stop();
});

/** A forked node; built lazily because the upstream starts in beforeAll. */
function forkContainer() {
  // #region fork
  const options = new AnvilOptions().fork
    .withForkUrl(forkUrl, forkBlock) // pin the block: reproducible tests
    .withRetries(2) // upstream hiccups…
    .withForkRetryBackoff(500) // …are retried after 500 ms
    .withTimeout(10_000) // per upstream request
    .noStorageCaching() // don't persist fetched state to anvil's disk cache
    .noRateLimit() // a local upstream needs no compute-unit throttling
    // anvil derives a fork's hardfork from chain id + block number; for
    // "chain 1 at block 3" that is Frontier, so pin it explicitly.
    .evm.withHardfork(Hardfork.Cancun);

  const container = new AnvilContainer(options).withTestClient((client) =>
    // Act as the holder: impersonated at startup, typed default account.
    client.withAccount(HOLDER, { impersonate: true }),
  );
  // #endregion fork
  return network.attach(container); // reach the upstream (Docker network)
}

/** Starts a fork with `options`, reachable from the upstream's network. */
function startFork(options: AnvilOptions): Promise<StartedAnvilContainer> {
  return network.attach(new AnvilContainer(options)).start();
}

describe("forking", () => {
  describe("a fork with per-test isolation", () => {
    const fork = useAnvil({ start: () => forkContainer().start() });

    it("sees upstream state as of the fork block", async () => {
      // #region fork-state
      expect(fork.chainId).toBe(1); // the client follows the forked chain
      expect(await balanceOf(fork.testClient, token, HOLDER)).toBe(
        parseEther("1000000"), // the later mint is not part of the fork
      );
      const { forkedNetwork } = await fork.metadata();
      expect(forkedNetwork).toMatchObject({
        chainId: 1,
        forkBlockNumber: Number(forkBlock),
      });
      // #endregion fork-state
    });

    it("changes stay local to the fork", async () => {
      const [, alice] = await fork.addresses();
      // #region fork-local
      await fork.cheats.setBalanceEther(HOLDER, 1); // gas for the holder
      await fork.confirm(
        fork.testClient.writeContract({
          address: token,
          abi: exampleToken.abi,
          functionName: "transfer",
          args: [alice, parseEther("250000")],
        }),
      );
      expect(await balanceOf(fork.testClient, token, alice)).toBe(
        parseEther("250000"),
      );
      expect(await balanceOf(mainnet.testClient, token, alice)).toBe(0n);
      // #endregion fork-local
    });
  });

  describe("resetting a fork", () => {
    let fork: StartedAnvilContainer<Account>;

    beforeAll(async () => {
      fork = await forkContainer().start();
    }, 120_000);

    afterAll(async () => {
      await fork?.stop();
    });

    it("reset() discards local changes and returns to the fork block", async () => {
      // #region fork-reset
      await fork.cheats.dealErc20(token, HOLDER, 0n).mine(10);

      await fork.reset();

      expect(await fork.testClient.getBlockNumber()).toBe(forkBlock);
      expect(await balanceOf(fork.testClient, token, HOLDER)).toBe(
        parseEther("1000000"),
      );
      // #endregion fork-reset
    });

    it("switches the upstream endpoint at runtime (setRpcUrl)", async () => {
      // #region set-rpc-url
      const backup = network.urlOf(mainnet, "mainnet-backup");
      await fork.cheats.setRpcUrl(backup); // e.g. fail over to another provider

      expect((await fork.nodeInfo()).forkConfig.forkUrl).toBe(backup);
      await fork.reset(); // re-forks through the new endpoint
      expect(await balanceOf(fork.testClient, token, HOLDER)).toBe(
        parseEther("1000000"),
      );
      // #endregion set-rpc-url
    });

    it("reset({ blockNumber }) moves the fork to another upstream block", async () => {
      // #region fork-move
      await fork.reset({ blockNumber: forkBlock + 1n });

      expect(await balanceOf(fork.testClient, token, HOLDER)).toBe(
        parseEther("1000000") + 1n, // now includes the later mint
      );
      // #endregion fork-move
    });
  });
  describe("choosing the fork point", () => {
    const RECIPIENT: Address = "0x3333333333333333333333333333333333333333";
    let payment: TransactionReceipt;

    beforeAll(async () => {
      payment = await mainnet.confirm(
        mainnet.testClient.sendTransaction({
          to: RECIPIENT,
          value: parseEther("1"),
        }),
      );
    });

    it("forks right before a transaction", async () => {
      // #region fork-at-transaction
      const fork = await startFork(
        new AnvilOptions().fork
          .withForkUrl(forkUrl)
          .withForkTransactionHash(payment.transactionHash)
          .evm.withHardfork(Hardfork.Cancun),
      );
      try {
        // Forked at the block before the payment: it has not happened yet.
        expect(await fork.testClient.getBlockNumber()).toBe(
          payment.blockNumber - 1n,
        );
        expect(await fork.getBalance(RECIPIENT)).toBe(0n);
      } finally {
        await fork.stop();
      }
      // #endregion fork-at-transaction
    });

    it("forks relative to the upstream's latest block", async () => {
      // #region fork-relative-block
      const latest = await mainnet.testClient.getBlockNumber();
      const fork = await startFork(
        new AnvilOptions().fork
          .withForkUrl(forkUrl)
          .withForkBlockNumber(-1) // negative: blocks before the latest
          .evm.withHardfork(Hardfork.Cancun),
      );
      try {
        const { forkedNetwork } = await fork.metadata();
        expect(forkedNetwork?.forkBlockNumber).toBe(Number(latest - 1n));
      } finally {
        await fork.stop();
      }
      // #endregion fork-relative-block
    });

    it("starts without asking the upstream for its chain id", async () => {
      // #region fork-offline-chain-id
      const fork = await startFork(
        new AnvilOptions().fork
          .withForkUrl(forkUrl, forkBlock) // needs a block number or tx hash
          .withForkChainId(1) // skips eth_chainId on startup
          .evm.withHardfork(Hardfork.Cancun),
      );
      try {
        expect(fork.chainId).toBe(1);
        expect(await balanceOf(fork.testClient, token, HOLDER)).toBe(
          parseEther("1000000"),
        );
      } finally {
        await fork.stop();
      }
      // #endregion fork-offline-chain-id
    });

    it("sends provider credentials and throttles requests", async () => {
      // #region fork-provider
      const fork = await startFork(
        new AnvilOptions().fork
          .withForkUrl(forkUrl, forkBlock)
          .withForkHeader("Authorization: Bearer <api-key>") // every upstream request
          .withComputeUnitsPerSecond(100) // stay under the provider's rate limit
          .evm.withHardfork(Hardfork.Cancun),
      );
      try {
        expect(await balanceOf(fork.testClient, token, HOLDER)).toBe(
          parseEther("1000000"),
        );
      } finally {
        await fork.stop();
      }
      // #endregion fork-provider
    });
  });
});
