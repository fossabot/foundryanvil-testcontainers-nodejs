/**
 * Workflow: reacting to events — WebSocket subscriptions that push logs as
 * blocks are mined, and historical log queries with indexed-argument filters.
 *
 * Watchers subscribe asynchronously (viem has no "ready" signal), so each
 * test repeats its trigger until the watcher reports it (`triggerUntil`)
 * instead of sleeping and hoping the subscription is already live.
 */
import {
  AnvilContainer,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import {
  type Address,
  type Block,
  createPublicClient,
  type Hash,
  type Log,
  parseAbiItem,
  parseEther,
  webSocket,
  zeroAddress,
} from "viem";
import { deployToken, exampleToken, mint, triggerUntil } from "../../src";

let token: Address;

// #region event-signature
// A human-readable event signature gives full type inference for log args,
// even though the JSON ABIs are untyped.
const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
// #endregion event-signature

// #region websocket
const anvil = useAnvil(
  new AnvilContainer().withTestClient((client) =>
    client.withAccount(0).withTransport("webSocket"),
  ),
  { setup: async (node) => void (token = await deployToken(node.testClient)) },
);
// #endregion websocket

describe("events and subscriptions", () => {
  it("pushes Transfer events through an eth_subscribe subscription", async () => {
    const [, alice] = await anvil.addresses();
    // #region watch
    const received: Log[] = [];
    const errors: Error[] = [];
    const unwatch = anvil.testClient.watchContractEvent({
      address: token,
      abi: exampleToken.abi,
      eventName: "Transfer",
      onLogs: (logs) => received.push(...logs),
      onError: (error) => errors.push(error),
    });
    try {
      // The subscription starts asynchronously: mint until a log arrives.
      await triggerUntil(
        () => mint(anvil.testClient, token, alice, parseEther("5")),
        () => received.length > 0,
      );
    } finally {
      unwatch();
    }

    expect(errors).toEqual([]);
    expect(received[0]).toMatchObject({
      eventName: "Transfer",
      args: { to: alice, value: parseEther("5") },
    });
    // #endregion watch
  });

  it("queries historical events by indexed argument", async () => {
    const [, alice, bob] = await anvil.addresses();
    await mint(anvil.testClient, token, alice, 1n);
    await mint(anvil.testClient, token, bob, 2n);
    await mint(anvil.testClient, token, bob, 3n);
    // #region history
    const toBob = await anvil.testClient.getContractEvents({
      address: token,
      abi: exampleToken.abi,
      eventName: "Transfer",
      args: { to: bob }, // indexed topic filter
      fromBlock: 0n,
    });
    // JSON ABIs are untyped (`Abi`), so decoded args need a type here.
    const values = toBob.map((log) => (log.args as { value: bigint }).value);
    expect(values).toEqual([2n, 3n]);
    // #endregion history
  });

  it("confirms the transport in use", () => {
    expect(anvil.testClient.transport.type).toBe("webSocket");
  });

  it("streams new blocks", async () => {
    // #region watch-blocks
    const start = await anvil.testClient.getBlockNumber();
    const seen = new Set<bigint>();
    const unwatch = anvil.testClient.watchBlocks({
      // viem fetches each announced block separately, so blocks can be
      // reported out of order: collect them, don't assume a sequence.
      onBlock: (block: Block) => seen.add(block.number!),
    });
    try {
      await triggerUntil(
        () => anvil.mine(),
        () => seen.size >= 2,
      );
    } finally {
      unwatch();
    }

    const latest = await anvil.testClient.getBlockNumber();
    for (const number of seen) {
      expect(number).toBeGreaterThan(start); // only newly mined blocks
      expect(number).toBeLessThanOrEqual(latest);
    }
    // #endregion watch-blocks
  });

  it("sees transactions as soon as they enter the pool", async () => {
    const [, alice] = await anvil.addresses();
    // #region pending
    await anvil.cheats.setAutomine(false); // keep transactions pending
    const seen = new Set<Hash>();
    const sent: Hash[] = [];
    const unwatch = anvil.testClient.watchPendingTransactions({
      onTransactions: (hashes) => hashes.forEach((hash) => seen.add(hash)),
    });
    try {
      await triggerUntil(
        async () =>
          sent.push(
            await anvil.testClient.sendTransaction({ to: alice, value: 1n }),
          ),
        () => sent.some((hash) => seen.has(hash)),
      );
    } finally {
      unwatch();
      await anvil.cheats.setAutomine(true); // node setting: restore
    }
    // #endregion pending
  });

  it("polls an event filter over HTTP", async () => {
    const [, alice, bob] = await anvil.addresses();
    // #region filter
    const http = await anvil.createTestClient((client) =>
      client.withAccount(0).withTransport("http"),
    );
    const filter = await http.createEventFilter({
      address: token,
      event: TRANSFER,
      args: { to: bob }, // indexed argument filter
    });
    await mint(http, token, alice, 1n);
    await mint(http, token, bob, 2n);

    const changes = await http.getFilterChanges({ filter });
    expect(changes).toHaveLength(1); // only the transfer to bob
    expect(await http.getFilterChanges({ filter })).toHaveLength(0); // consumed
    await http.uninstallFilter({ filter });
    // #endregion filter
  });

  it("gets typed logs from an event signature", async () => {
    const [, alice] = await anvil.addresses();
    await mint(anvil.testClient, token, alice, 7n);
    // #region typed-logs
    const mints = await anvil.testClient.getLogs({
      address: token,
      event: TRANSFER,
      args: { from: zeroAddress },
      fromBlock: 0n,
      toBlock: "latest",
    });
    const last = mints.at(-1)!;
    expect(last.args.to).toBe(alice); // typed: `0x${string}` | undefined
    expect(last.args.value).toBe(7n); // typed: bigint | undefined
    // #endregion typed-logs
  });

  it("serves your own WebSocket clients too", async () => {
    // #region own-websocket
    const client = createPublicClient({
      chain: anvil.chain,
      transport: webSocket(anvil.wsUrl),
    });
    const start = await anvil.testClient.getBlockNumber();
    let announced: bigint | undefined;
    const unwatch = client.watchBlockNumber({
      onBlockNumber: (blockNumber) => (announced = blockNumber),
    });
    try {
      await triggerUntil(
        () => anvil.mine(),
        () => announced !== undefined,
      );
      expect(announced).toBeGreaterThan(start);
    } finally {
      unwatch();
      // Clients you create are yours to close (the node closes its own).
      (await client.transport.getRpcClient()).close();
    }
    // #endregion own-websocket
  });
});
