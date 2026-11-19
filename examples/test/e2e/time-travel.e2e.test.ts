/**
 * Workflow: testing time-dependent logic — jump ahead, hit exact boundaries,
 * and simulate regular block times.
 */
import {
  AnvilContainer,
  AnvilOptions,
  AnvilTransactionRevertedError,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import { type Address, parseEther } from "viem";
import {
  balanceOf,
  deployToken,
  deployVault,
  exampleToken,
  expectRevert,
  mint,
  timeLockVault,
  vaultLock,
} from "../../src";

const LOCK_DURATION = 30n * 24n * 60n * 60n; // 30 days

let token: Address;
let vault: Address;
let alice: Address;

const anvil = useAnvil(
  new AnvilContainer().withTestClient((client) => client.withAccount(0)),
  {
    setup: async (node) => {
      [, alice] = await node.addresses();
      token = await deployToken(node.testClient);
      vault = await deployVault(node.testClient, token, LOCK_DURATION);
      await mint(node.testClient, token, alice, parseEther("10"));
      const asAlice = node.testClientFor(alice);
      await node.confirm(
        asAlice.writeContract({
          address: token,
          abi: exampleToken.abi,
          functionName: "approve",
          args: [vault, parseEther("10")],
        }),
      );
      await node.confirm(
        asAlice.writeContract({
          address: vault,
          abi: timeLockVault.abi,
          functionName: "deposit",
          args: [parseEther("10")],
        }),
      );
    },
  },
);

// #region withdraw-helper
/** Simulates alice's withdrawal from the vault (throws while locked). */
const withdraw = () =>
  anvil.testClientFor(alice).simulateContract({
    address: vault,
    abi: timeLockVault.abi,
    functionName: "withdraw",
  });
// #endregion withdraw-helper

describe("time travel", () => {
  it("rejects withdrawals while the deposit is locked", async () => {
    await expectRevert(withdraw(), "StillLocked");
  });

  it("fast-forwards past the lock", async () => {
    // #region fast-forward
    await anvil.cheats.increaseTime({ days: 30 }).mine();

    const { request } = await withdraw();
    await anvil.confirm(anvil.testClientFor(alice).writeContract(request));
    expect(await balanceOf(anvil.testClient, token, alice)).toBe(
      parseEther("10"),
    );
    // #endregion fast-forward
  });

  it("tests the exact unlock boundary with mined blocks", async () => {
    // #region boundary
    const { unlockTime } = await vaultLock(anvil.testClient, vault, alice);
    const asAlice = anvil.testClientFor(alice);
    const sendWithdraw = () =>
      asAlice.writeContract({
        address: vault,
        abi: timeLockVault.abi,
        functionName: "withdraw",
      }); // signed by anvil: mined even when it reverts

    // One second early: mined, but reverted.
    await anvil.cheats.setNextBlockTimestamp(unlockTime - 1n);
    await expect(anvil.confirm(sendWithdraw())).rejects.toBeInstanceOf(
      AnvilTransactionRevertedError,
    );

    // Exactly at the unlock time: succeeds.
    await anvil.cheats.setNextBlockTimestamp(unlockTime);
    const receipt = await anvil.confirm(sendWithdraw());
    expect(receipt.status).toBe("success");
    // #endregion boundary
  });

  it("simulates regular block times", async () => {
    // #region block-times
    // Node settings are not part of snapshots: restore them yourself.
    await anvil.cheats.setBlockTimestampInterval(12); // 12 s "slots"
    try {
      const start = await anvil.latestTimestamp();
      await anvil.mine(5);
      expect(await anvil.latestTimestamp()).toBe(start + 60n);
    } finally {
      await anvil.cheats.removeBlockTimestampInterval();
    }
    // #endregion block-times
  });

  it("mines blocks spaced in time", async () => {
    // #region spaced-blocks
    const before = await anvil.testClient.getBlockNumber();
    await anvil.mine(3, { hours: 1 }); // three blocks, one hour apart

    const times = await Promise.all(
      [1n, 2n, 3n].map(
        async (offset) =>
          (await anvil.testClient.getBlock({ blockNumber: before + offset }))
            .timestamp,
      ),
    );
    expect([times[1] - times[0], times[2] - times[1]]).toEqual([3600n, 3600n]);
    // #endregion spaced-blocks
  });

  it("sets the clock to an absolute date", async () => {
    // #region set-time
    const launch = new Date("2030-01-01T00:00:00Z");
    await anvil.cheats.setTime(launch).mine();

    const { timestamp } = await anvil.testClient.getBlock();
    expect(timestamp).toBeGreaterThanOrEqual(BigInt(launch.getTime() / 1000));

    // 2030 is long past the unlock time: the withdrawal goes through.
    const { request } = await withdraw();
    expect(
      (await anvil.confirm(anvil.testClientFor(alice).writeContract(request)))
        .status,
    ).toBe("success");
    // #endregion set-time
  });
});

describe("interval mining and a fixed genesis time", () => {
  // #region interval-mining
  const GENESIS = new Date("2030-06-01T00:00:00Z");
  const node = useAnvil(
    new AnvilContainer(
      new AnvilOptions().mining
        .withBlockTime(1) // a block every second, like a real chain
        .state.withTimestamp(GENESIS),
    ),
    { isolation: "none" },
  );

  it("starts at the configured genesis time and mines on its own", async () => {
    const genesis = await node.testClient.getBlock({ blockNumber: 0n });
    expect(genesis.timestamp).toBe(BigInt(GENESIS.getTime() / 1000));
    expect(await node.testClient.getIntervalMining()).toBe(1);

    const start = await node.testClient.getBlockNumber();
    await waitFor(async () => (await node.testClient.getBlockNumber()) > start);
  });

  it("stops and restarts interval mining at runtime", async () => {
    await node.cheats.setIntervalMining(0); // off: blocks only on demand
    expect(await node.testClient.getIntervalMining()).toBeUndefined();
    const height = await node.testClient.getBlockNumber();
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(await node.testClient.getBlockNumber()).toBe(height);

    await node.cheats.setIntervalMining(1);
    await waitFor(
      async () => (await node.testClient.getBlockNumber()) > height,
    );
  });
  // #endregion interval-mining
});

describe("mixed mining", () => {
  // #region mixed-mining
  // Transactions are mined at once (automine) AND a block comes every second.
  const node = useAnvil(
    new AnvilContainer(
      new AnvilOptions().mining.withBlockTime(1).withMixedMining(),
    ),
    { isolation: "none" },
  );

  it("mines transactions on arrival while time keeps producing blocks", async () => {
    const [alice, bob] = await node.addresses();
    const hash = await node.testClient.sendTransaction({
      account: alice,
      to: bob,
      value: 1n,
    });
    // No explicit mine(): automine picks the transaction up.
    const receipt = await node.testClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const height = await node.testClient.getBlockNumber();
    await waitFor(
      async () => (await node.testClient.getBlockNumber()) > height,
    );
  });
  // #endregion mixed-mining
});

/** Polls `condition` every 100 ms for up to 5 s. */
async function waitFor(condition: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("condition not met within 5 s");
}
