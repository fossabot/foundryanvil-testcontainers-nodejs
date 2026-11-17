/**
 * Workflow: forking. A second anvil forks an upstream chain at a block — here
 * another anvil playing "mainnet" with a deployed token — so tests run
 * against real deployed state, change anything locally and reset back.
 */
import {
  AnvilOptions,
  Hardfork,
  type StartedAnvilContainer,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import { type Account, type Address, parseEther } from "viem";
import { balanceOf, deployToken, exampleToken, mint } from "../../src";
import {
  anvilContainer,
  type NodeNetwork,
  startNetwork,
} from "../support/runtime";

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
      anvilContainer(new AnvilOptions().evm.withChainId(1)),
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
  return network
    .attach(
      anvilContainer(
        new AnvilOptions().fork
          .withForkUrl(forkUrl, forkBlock) // pin the block: reproducible tests
          .withRetries(2) // upstream hiccups…
          .withForkRetryBackoff(500) // …are retried after 500 ms
          .withTimeout(10_000) // per upstream request
          .noStorageCaching() // don't persist fetched state to anvil's disk cache
          .noRateLimit() // a local upstream needs no compute-unit throttling
          // anvil derives a fork's hardfork from chain id + block number; for
          // "chain 1 at block 3" that is Frontier, so pin it explicitly.
          .evm.withHardfork(Hardfork.Cancun),
      ),
    )
    .withTestClient((client) =>
      // Act as the holder: impersonated at startup, typed default account.
      client.withAccount(HOLDER, { impersonate: true }),
    );
  // #endregion fork
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
});
