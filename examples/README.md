# Examples: advanced workflows with the viem test client

Real, tested workflows for
[`@hellaweb3/foundryanvil-testcontainers-nodejs`](../../../Downloads/flagfix-4526cb18-cc96-4a8d-9b94-8ace65f9d950-final/files/foundryanvil-testcontainers-nodejs-main/README.md): anvil in a
Testcontainer plus its pre-configured, strongly typed viem test client.

This folder is a **separate npm project** that consumes the library the way
an end user's project would — through `npm link` to this checkout — and is
type-checked, linted, unit-tested and end-to-end tested as part of the
library's quality gate. Every code sample below is copied from a test that
runs against a real anvil (a unit test fails if a sample drifts from its
source).

- [Running the examples](#running-the-examples)
- [How the library is linked](#how-the-library-is-linked)
- [API coverage map](#api-coverage-map)
- [Workflows](#workflows)
  1. [Fixtures and isolation](#1-fixtures-and-isolation)
  2. [Multiple actors](#2-multiple-actors)
  3. [Time travel](#3-time-travel)
  4. [Custom errors and reverts](#4-custom-errors-and-reverts)
  5. [Whales and impersonation](#5-whales-and-impersonation)
  6. [Mempool and block building](#6-mempool-and-block-building)
  7. [Events and subscriptions](#7-events-and-subscriptions)
  8. [Simulation and gas](#8-simulation-and-gas)
  9. [Mocking dependencies](#9-mocking-dependencies)
  10. [State fixtures and genesis](#10-state-fixtures-and-genesis)
  11. [Forking](#11-forking)
  12. [Signing, key material and EIP-7702](#12-signing-key-material-and-eip-7702)
  13. [Chain configuration and reorgs](#13-chain-configuration-and-reorgs)
  14. [Node configuration](#14-node-configuration)
  15. [Debugging and tracing](#15-debugging-and-tracing)
  16. [Catching misconfiguration in unit tests](#16-catching-misconfiguration-in-unit-tests)
- [Contract artifacts](#contract-artifacts)
- [Behaviours worth knowing](#behaviours-worth-knowing)
- [Project layout and scripts](#project-layout-and-scripts)

## Running the examples

From the repository root (builds the library when its sources changed,
installs this project, links the library, then runs):

```shell
pnpm examples:test               # type-check + lint + unit tests
pnpm examples:e2e                # workflows against anvil in Docker (CI)
pnpm examples:e2e --no-docker    # workflows against a local anvil binary (local testing only)
```

Or inside `examples/`, like any npm project:

```shell
npm ci
npm run link:library             # after every npm install / npm ci
npm run typecheck && npm run lint && npm test
npm run test:e2e                 # Docker
npm run test:e2e -- --no-docker  # local anvil binary
```

`--no-docker` uses the anvil shipped by the `@foundry-rs/anvil`
devDependency (or `ANVIL_BINARY`, `anvil` on the `PATH`, `~/.foundry/bin`).
It is for machines without Docker; CI must run the Docker mode.

The tests create containers with `anvilContainer(options)`
([test/support/runtime.ts](test/support/runtime.ts)): that is
`new AnvilContainer(options)` in Docker mode and a `LocalAnvilContainer` with
`--no-docker`. The local runtime overrides the library's
`AnvilContainer.startRuntime()` extension point, so validation, the test
client and error handling are the library's own in both modes
([test/support/local-anvil.ts](test/support/local-anvil.ts)).

## How the library is linked

`npm run link:library` runs `npm link <repository root>` with npm's "global"
folder kept inside this project (`.npm-link/`, git-ignored), so your global
npm prefix is never touched. The library is declared as an *optional peer
dependency*: npm neither downloads it nor complains about the link
(`npm ls` shows `@hellaweb3/foundryanvil-testcontainers-nodejs@0.4.0 -> ./..`).

The classic `npm link` pitfalls are guarded by
[test/unit/library-link.test.ts](test/unit/library-link.test.ts):

| Pitfall | Guard |
|---|---|
| `npm install` / `npm ci` silently remove links | the test fails unless `node_modules/@hellaweb3/…` is a link to this checkout; the root scripts re-link after installing |
| Testing a stale build (the link exposes `dist/`) | fails when `dist/` is older than `src`; the root scripts rebuild first |
| Dependencies leaking in from the library checkout | every dependency must be installed in `examples/node_modules` |
| `npm link` runs the linked package's `prepare` / `install` scripts | the library must not have any |

A linked package resolves **its own** dependencies from its own folder, so
the library and this project load different copies of viem. Types are
structural and work across copies, but `instanceof` against viem error
classes does not: match errors by `name` (see
[src/reverts.ts](src/reverts.ts)). A normal `npm install` of a published
version deduplicates viem.

## API coverage map

Where each part of the test client and of the anvil configuration is
demonstrated (checked by [test/unit/readme.test.ts](test/unit/readme.test.ts):
every name listed is called in that workflow). Together the workflows call
every viem test action, every anvil extra, every `cheats` step and every
`StartedAnvilContainer` member ([test/unit/api-coverage.test.ts](test/unit/api-coverage.test.ts)).

| Workflow | Test client / container API | anvil & client options |
|---|---|---|
| [Fixtures and isolation](test/e2e/fixtures-and-isolation.e2e.test.ts) | `useAnvil` `accounts` `checkpoint` `snapshot` `revert` `withSnapshot` `reset` `contractAbi` | `withMnemonic` `withAccounts` `withBalance` |
| [Multiple actors](test/e2e/multi-actor-flows.e2e.test.ts) | `testClientFor` `simulateContract` `writeContract` `multicall` `writeContractSync` `sendTransactionSync` `createTestClient` `sendEthTransaction` | `withBatch` |
| [Time travel](test/e2e/time-travel.e2e.test.ts) | `increaseTime` `setNextBlockTimestamp` `setTime` `setBlockTimestampInterval` `removeBlockTimestampInterval` `mine` `getIntervalMining` `setIntervalMining` | `withBlockTime` `withMixedMining` `withTimestamp` |
| [Custom errors and reverts](test/e2e/custom-errors.e2e.test.ts) | `simulateContract` `writeContract` `confirm` `call` |  |
| [Whales and impersonation](test/e2e/whales-and-impersonation.e2e.test.ts) | `setBalance` `addBalance` `dealErc20` `setErc20Allowance` `impersonate` `stopImpersonating` `withImpersonation` `setAutoImpersonate` `sendUnsignedTransaction` `setNonce` `step` | `autoImpersonate` |
| [Mempool and block building](test/e2e/mempool-and-blocks.e2e.test.ts) | `getTxpoolStatus` `getTxpoolContent` `inspectTxpool` `dropTransaction` `removePoolTransactions` `dropAllTransactions` `setAutomine` `getAutomine` `setBlockGasLimit` `setCoinbase` `setNextBlockBaseFeePerGas` `setMinGasPrice` | `withNoMining` `withOrder` `withHardfork` |
| [Events and subscriptions](test/e2e/events-and-subscriptions.e2e.test.ts) | `watchContractEvent` `watchBlocks` `watchPendingTransactions` `createEventFilter` `getFilterChanges` `getLogs` `getContractEvents` | `withTransport` |
| [Simulation and gas](test/e2e/simulation-and-gas.e2e.test.ts) | `simulateBlocks` `simulateCalls` `call` `createAccessList` `estimateContractGas` `estimateFeesPerGas` `getFeeHistory` `fillTransaction` `getProof` |  |
| [Mocking dependencies](test/e2e/mocking-dependencies.e2e.test.ts) | `setCode` `setStorageAt` `getStorageAt` `simulateContract` |  |
| [State fixtures and genesis](test/e2e/state-fixtures.e2e.test.ts) | `dumpStateToFile` `loadStateFromFile` `dumpState` `loadState` | `withLoadState` `withInit` |
| [Forking](test/e2e/forking.e2e.test.ts) | `reset` `setRpcUrl` `metadata` `nodeInfo` | `withForkUrl` `withRetries` `withForkRetryBackoff` `withTimeout` `noStorageCaching` `noRateLimit` `withHardfork` |
| [Signing, key material and EIP-7702](test/e2e/signing.e2e.test.ts) | `signMessage` `signTypedData` `signTransaction` `sendRawTransaction` `prepareTransactionRequest` `signAuthorization` | `withLocalAccount` `withDerivationPath` `withRandomMnemonic` `withMnemonicSeedUnsafe` |
| [Chain configuration and reorgs](test/e2e/chain-config-and-reorgs.e2e.test.ts) | `getNodeInfo` `getMetadata` `reorg` `rollback` `setChainId` `createTestClient` | `withChainId` `withHardfork` `withGasLimit` `withBlockBaseFeePerGas` `withCacheTime` `withChain` |
| [Node configuration](test/e2e/node-configuration.e2e.test.ts) | `getMappedPort` `logText` `getCode` | `withAllowOrigin` `noCors` `withCodeSizeLimit` `disableDefaultCreate2Deployer` `disableBlockGasLimit` `withPruneHistory` `withBlockNumber` `withPort` `quiet` |
| [Debugging and tracing](test/e2e/debugging-and-tracing.e2e.test.ts) | `rpc` `logText` `setLoggingEnabled` | `withPrintTraces` `withStepsTracing` `verboseLogs` `withColor` |

## Workflows

### 1. Fixtures and isolation

[test/e2e/fixtures-and-isolation.e2e.test.ts](test/e2e/fixtures-and-isolation.e2e.test.ts)

One node per test file: `useAnvil` starts it in `beforeAll`, runs `setup`
once, and after every test restores the state of right after `setup` (a
snapshot revert takes milliseconds). `withAccount(0)` makes dev account 0 the
typed default signer, so writes need no `account` argument.

<!-- snippet: test/e2e/fixtures-and-isolation.e2e.test.ts#fixture -->
```ts
let token: Address;
let vault: Address;

const anvil = useAnvil(
  anvilContainer(
    new AnvilOptions().account
      .withMnemonic(MNEMONIC)
      .withAccounts(3)
      .withBalance(1_000), // ETH per dev account
  )
    .withArtifactsDir(ARTIFACTS_DIR) // for anvil.contractAbi() / contractBytecode()
    .withTestClient(
      (client) => client.withAccount(0), // deployer signs by default
    ),
  {
    // Runs once after start; every test then starts from this state.
    setup: async (node) => {
      const [, alice, bob] = await node.addresses();
      token = await deployToken(node.testClient);
      vault = await deployVault(node.testClient, token, 86_400n);
      await mint(node.testClient, token, alice, parseEther("100"));
      await mint(node.testClient, token, bob, parseEther("100"));
    },
  },
);
```
<!-- /snippet -->

Dev accounts and their private keys come from the configured mnemonic:

<!-- snippet: test/e2e/fixtures-and-isolation.e2e.test.ts#accounts -->
```ts
const accounts = await anvil.accounts(); // addresses + private keys
expect(accounts).toHaveLength(3);
accounts.forEach(({ index, address, privateKey }) => {
  expect(privateKey).toBeDefined();
  expect(mnemonicToAccount(MNEMONIC, { addressIndex: index }).address).toBe(
    address,
  );
});
expect(await anvil.getBalance(accounts[2].address)).toBe(
  parseEther("1000"),
);
```
<!-- /snippet -->

With `withArtifactsDir()`, the node loads artifacts too:

<!-- snippet: test/e2e/fixtures-and-isolation.e2e.test.ts#container-artifacts -->
```ts
const abi = anvil.contractAbi("ExampleToken/ExampleToken.json");
const bytecode = anvil.contractBytecode("ExampleToken/ExampleToken.bin");
const [deployer] = await anvil.addresses();

const receipt = await anvil.deployContract(abi, bytecode, deployer, [
  "Second",
  "TWO",
]);
expect(
  await anvil.testClient.readContract({
    address: receipt.contractAddress!,
    abi,
    functionName: "symbol",
  }),
).toBe("TWO");
```
<!-- /snippet -->

Tests can then change anything:

<!-- snippet: test/e2e/fixtures-and-isolation.e2e.test.ts#isolation -->
```ts
it("may change any state…", async () => {
  const [, alice, bob] = await anvil.addresses();
  await anvil.confirm(
    anvil.testClientFor(alice).writeContract({
      address: token,
      abi: exampleToken.abi,
      functionName: "transfer",
      args: [bob, parseEther("100")],
    }),
  );
  await anvil.cheats.mine(100).increaseTime({ days: 365 });
  expect(await balanceOf(anvil.testClient, token, alice)).toBe(0n);
});

it("…because the next test starts from the fixture again", async () => {
  const [, alice] = await anvil.addresses();
  expect(await balanceOf(anvil.testClient, token, alice)).toBe(
    parseEther("100"),
  );
});
```
<!-- /snippet -->

Roll back a block of code inside one test with `withSnapshot()`, or restore
a `checkpoint()` as often as needed for table-driven cases:

<!-- snippet: test/e2e/fixtures-and-isolation.e2e.test.ts#what-if -->
```ts
const whatIf = await anvil.withSnapshot(async (client) => {
  await anvil.cheats.dealErc20(token, alice, 0n);
  return balanceOf(client, token, alice);
});
expect(whatIf).toBe(0n); // inside the snapshot
expect(await balanceOf(anvil.testClient, token, alice)).toBe(
  parseEther("100"), // reverted afterwards
);
```
<!-- /snippet -->

<!-- snippet: test/e2e/fixtures-and-isolation.e2e.test.ts#checkpoint -->
```ts
const start = await anvil.checkpoint(); // restorable any number of times
for (const amount of [1n, 50n, 100n]) {
  await anvil.confirm(
    anvil.testClientFor(alice).writeContract({
      address: token,
      abi: exampleToken.abi,
      functionName: "transfer",
      args: [vault, parseEther(String(amount))],
    }),
  );
  expect(await balanceOf(anvil.testClient, token, vault)).toBe(
    parseEther(String(amount)),
  );
  await start.restore(); // back to the state before the transfer
}
```
<!-- /snippet -->

Snapshots are strict — reverting a used snapshot fails loudly instead of
silently continuing on dirty state:

<!-- snippet: test/e2e/fixtures-and-isolation.e2e.test.ts#strict-snapshots -->
```ts
const id = await anvil.snapshot();
await anvil.revert(id);

const error = await anvil.revert(id).catch((e: unknown) => e);
expect(error).toBeInstanceOf(AnvilTestClientError);
expect((error as AnvilTestClientError).code).toBe("SNAPSHOT_NOT_FOUND");
```
<!-- /snippet -->

`reset()` returns the node to genesis and discards every snapshot, so suites
that use it opt out of isolation:

<!-- snippet: test/e2e/fixtures-and-isolation.e2e.test.ts#no-isolation -->
```ts
// reset() discards every snapshot, so this suite opts out of isolation.
const node = useAnvil(
  anvilContainer().withTestClient((client) => client.withAccount(0)),
  { isolation: "none" },
);
let deployed: Address;

it("deploys a token…", async () => {
  deployed = await deployToken(node.testClient);
  expect(await node.testClient.getCode({ address: deployed })).toBeDefined();
});

it("…which the next test still sees (no isolation)…", async () => {
  expect(await node.testClient.getCode({ address: deployed })).toBeDefined();
});

it("…until reset() returns the node to genesis", async () => {
  await node.reset();
  expect(await node.testClient.getBlockNumber()).toBe(0n);
  expect(
    await node.testClient.getCode({ address: deployed }),
  ).toBeUndefined();
});
```
<!-- /snippet -->

### 2. Multiple actors

[test/e2e/multi-actor-flows.e2e.test.ts](test/e2e/multi-actor-flows.e2e.test.ts)

`testClientFor(address)` gives each user a client with the same settings.
Writes, simulations and event decoding work directly with the JSON ABIs.

<!-- snippet: test/e2e/multi-actor-flows.e2e.test.ts#actors -->
```ts
const asAlice = anvil.testClientFor(alice);
const asBob = anvil.testClientFor(bob);

await anvil.confirm(
  asAlice.writeContract({
    address: token,
    abi: exampleToken.abi,
    functionName: "approve",
    args: [bob, parseEther("10")],
  }),
);
const receipt = await anvil.confirm(
  asBob.writeContract({
    address: token,
    abi: exampleToken.abi,
    functionName: "transferFrom",
    args: [alice, bob, parseEther("4")],
  }),
);

const [transfer] = parseEventLogs({
  abi: exampleToken.abi,
  logs: receipt.logs,
  eventName: "Transfer",
});
expect(transfer.args).toEqual({
  from: alice,
  to: bob,
  value: parseEther("4"),
});
```
<!-- /snippet -->

Simulate first to check the result without changing state, then send
exactly the simulated request:

<!-- snippet: test/e2e/multi-actor-flows.e2e.test.ts#simulate -->
```ts
const { result, request } = await asAlice.simulateContract({
  address: token,
  abi: exampleToken.abi,
  functionName: "transfer",
  args: [bob, parseEther("1")],
});
expect(result).toBe(true); // typed from the ABI: boolean
expect(await balanceOf(anvil.testClient, token, bob)).toBe(0n); // nothing sent yet

await anvil.confirm(asAlice.writeContract(request));
expect(await balanceOf(anvil.testClient, token, bob)).toBe(parseEther("1"));
```
<!-- /snippet -->

Contract instances bind an address, an ABI and a user's client:

<!-- snippet: test/e2e/multi-actor-flows.e2e.test.ts#contract-instance -->
```ts
const tokenAsAlice = getContract({
  address: token,
  abi: exampleToken.abi,
  client: anvil.testClientFor(alice),
});

const gas = await tokenAsAlice.estimateGas.transfer([bob, 1n]);
const hash = await tokenAsAlice.write.transfer([bob, 1n]);
const receipt = await anvil.confirm(hash);

expect(receipt.gasUsed).toBeLessThanOrEqual(gas);
expect(await tokenAsAlice.read.balanceOf([bob])).toBe(1n);
```
<!-- /snippet -->

Read many values in one `eth_call` — without deploying Multicall3:

<!-- snippet: test/e2e/multi-actor-flows.e2e.test.ts#multicall -->
```ts
// No Multicall3 on this chain: `deployless` runs it from bytecode in eth_call.
const [name, supply, aliceBalance, broken] =
  await anvil.testClient.multicall({
    deployless: true,
    allowFailure: true,
    contracts: [
      { address: token, abi: exampleToken.abi, functionName: "name" },
      {
        address: token,
        abi: exampleToken.abi,
        functionName: "totalSupply",
      },
      {
        address: token,
        abi: exampleToken.abi,
        functionName: "balanceOf",
        args: [alice],
      },
      { address: bob, abi: exampleToken.abi, functionName: "totalSupply" }, // not a contract
    ],
  });
expect(name).toEqual({ status: "success", result: "Example Token" });
expect(supply.result).toBe(parseEther("50"));
expect(aliceBalance.result).toBe(parseEther("50"));
expect(broken.status).toBe("failure"); // reported, not thrown
```
<!-- /snippet -->

Batch concurrent JSON-RPC requests over HTTP:

<!-- snippet: test/e2e/multi-actor-flows.e2e.test.ts#batching -->
```ts
const batched = await anvil.createTestClient(
  (client) => client.withBatch({ wait: 5 }), // collect requests for 5 ms per HTTP call
);
const balances = await Promise.all(
  addresses.map((address) => balanceOf(batched, token, address)),
);
```
<!-- /snippet -->

A transaction with a nonce gap waits until the gap is filled:

<!-- snippet: test/e2e/multi-actor-flows.e2e.test.ts#nonces -->
```ts
const next = await anvil.testClient.getTransactionCount({ address: alice });

const later = await transfer(next + 1); // skips a nonce…
expect(await anvil.testClient.getTxpoolStatus()).toEqual({
  pending: 0,
  queued: 1, // …so it waits in the queue
});

const first = await transfer(next); // fills the gap: both are mined
const receipts = await Promise.all(
  [first, later].map((hash) => anvil.confirm(hash)),
);
expect(receipts.map((receipt) => receipt.status)).toEqual([
  "success",
  "success",
]);
expect(await balanceOf(anvil.testClient, token, bob)).toBe(parseEther("2"));
```
<!-- /snippet -->

Get the receipt from the sending call itself (`eth_sendTransactionSync`):

<!-- snippet: test/e2e/multi-actor-flows.e2e.test.ts#sync -->
```ts
const receipt = await anvil.testClientFor(alice).writeContractSync({
  address: token,
  abi: exampleToken.abi,
  functionName: "transfer",
  args: [bob, parseEther("2")],
});
expect(receipt.status).toBe("success");

const payment = await anvil.testClientFor(bob).sendTransactionSync({
  to: alice,
  value: parseEther("1"),
});
expect(payment.blockNumber).toBe(receipt.blockNumber + 1n);
```
<!-- /snippet -->

Clients your application builds itself work against the node too, and the
exported `anvilActions` decorator adds the anvil extras to them:

<!-- snippet: test/e2e/multi-actor-flows.e2e.test.ts#own-client -->
```ts
// e.g. the client your application code already creates:
const appClient = createPublicClient({
  chain: anvil.chain, // id, name and URLs of this node
  transport: http(anvil.rpcUrl),
}).extend(anvilActions); // add the anvil extras to any viem client

await appClient.addBalance({ address: alice, value: parseEther("1") });
const balance = await appClient.readContract({
  address: token,
  abi: exampleToken.abi,
  functionName: "balanceOf",
  args: [alice],
});
expect(balance).toBe(parseEther("50"));
```
<!-- /snippet -->

### 3. Time travel

[test/e2e/time-travel.e2e.test.ts](test/e2e/time-travel.e2e.test.ts)

Jump ahead with a duration, then mine a block so the new time applies:

<!-- snippet: test/e2e/time-travel.e2e.test.ts#fast-forward -->
```ts
await anvil.cheats.increaseTime({ days: 30 }).mine();

const { request } = await withdraw();
await anvil.confirm(anvil.testClientFor(alice).writeContract(request));
expect(await balanceOf(anvil.testClient, token, alice)).toBe(
  parseEther("10"),
);
```
<!-- /snippet -->

Test an exact boundary by fixing the timestamp of the next block:

<!-- snippet: test/e2e/time-travel.e2e.test.ts#boundary -->
```ts
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
```
<!-- /snippet -->

Simulate regular block times (node settings are not part of snapshots, so
restore them yourself), space blocks in time, or set the clock outright:

<!-- snippet: test/e2e/time-travel.e2e.test.ts#block-times -->
```ts
// Node settings are not part of snapshots: restore them yourself.
await anvil.cheats.setBlockTimestampInterval(12); // 12 s "slots"
try {
  const start = await anvil.latestTimestamp();
  await anvil.mine(5);
  expect(await anvil.latestTimestamp()).toBe(start + 60n);
} finally {
  await anvil.cheats.removeBlockTimestampInterval();
}
```
<!-- /snippet -->

<!-- snippet: test/e2e/time-travel.e2e.test.ts#spaced-blocks -->
```ts
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
```
<!-- /snippet -->

<!-- snippet: test/e2e/time-travel.e2e.test.ts#set-time -->
```ts
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
```
<!-- /snippet -->

A node that mines on its own clock, from a fixed genesis time, controlled at
runtime:

<!-- snippet: test/e2e/time-travel.e2e.test.ts#interval-mining -->
```ts
const GENESIS = new Date("2030-06-01T00:00:00Z");
const node = useAnvil(
  anvilContainer(
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
```
<!-- /snippet -->

Mixed mining combines both: transactions on arrival, blocks on the clock:

<!-- snippet: test/e2e/time-travel.e2e.test.ts#mixed-mining -->
```ts
// Transactions are mined at once (automine) AND a block comes every second.
const node = useAnvil(
  anvilContainer(
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
```
<!-- /snippet -->

### 4. Custom errors and reverts

[test/e2e/custom-errors.e2e.test.ts](test/e2e/custom-errors.e2e.test.ts)

[src/reverts.ts](src/reverts.ts) provides `expectRevert(promise, errorName, args?)`,
which finds viem's decoded custom error in the error chain:

<!-- snippet: test/e2e/custom-errors.e2e.test.ts#custom-error -->
```ts
await expectRevert(
  anvil.testClientFor(alice).simulateContract({
    address: token,
    abi: exampleToken.abi,
    functionName: "transfer",
    args: [bob, 1n],
  }),
  "InsufficientBalance",
  [alice, 0n, 1n],
);
```
<!-- /snippet -->

Where a revert surfaces depends on **who signs**:

<!-- snippet: test/e2e/custom-errors.e2e.test.ts#write-reverts -->
```ts
// Locally signed: viem estimates gas first, so the revert surfaces
// immediately, decoded, and nothing is sent.
const local = anvil.testClientFor(privateKeyToAccount(mallory.privateKey!));
const revert = await expectRevert(
  local.writeContract({
    address: token,
    abi: exampleToken.abi,
    functionName: "mint",
    args: [mallory.address, parseEther("1000000")],
  }),
  "NotOwner",
);
expect(revert.args).toEqual([mallory.address]);

// Signed by anvil (dev/impersonated account): sent as-is, mined, reverted.
const hash = await anvil.testClientFor(mallory.address).writeContract({
  address: token,
  abi: exampleToken.abi,
  functionName: "mint",
  args: [mallory.address, parseEther("1000000")],
});
await expect(anvil.confirm(hash)).rejects.toBeInstanceOf(
  AnvilTransactionRevertedError,
);
```
<!-- /snippet -->

Mined reverts come with their receipt:

<!-- snippet: test/e2e/custom-errors.e2e.test.ts#mined-revert -->
```ts
const hash = await anvil.testClientFor(alice).writeContract({
  address: token,
  abi: exampleToken.abi,
  functionName: "transfer",
  args: [bob, 1n],
}); // signed by anvil: mined even though it reverts

const error = await anvil.confirm(hash).catch((e: unknown) => e);
expect(error).toBeInstanceOf(AnvilTransactionRevertedError);
expect(
  (error as AnvilTransactionRevertedError).receipt.gasUsed,
).toBeGreaterThan(0n);

// Or get the receipt without throwing:
const receipt = await anvil.confirm(hash, { throwOnRevert: false });
expect(receipt.status).toBe("reverted");
```
<!-- /snippet -->

Panics (overflow, division by zero, out-of-bounds…) decode as `Panic(code)`:

<!-- snippet: test/e2e/custom-errors.e2e.test.ts#panic -->
```ts
const panic = await expectRevert(
  anvil.testClient.simulateContract({
    address: token,
    abi: exampleToken.abi,
    functionName: "mint",
    args: [alice, 1n], // totalSupply would overflow uint256
  }),
  "Panic",
  [0x11n], // 0x11: arithmetic underflow or overflow
);
expect(panic.reason).toMatch(/overflow/);
```
<!-- /snippet -->

Decode raw revert bytes yourself, e.g. from a low-level call:

<!-- snippet: test/e2e/custom-errors.e2e.test.ts#raw-revert -->
```ts
const error = (await anvil.testClient
  .call({
    account: alice,
    to: token,
    data: encodeFunctionData({
      abi: exampleToken.abi,
      functionName: "transfer",
      args: [bob, 1n],
    }),
  })
  .catch((e: unknown) => e)) as BaseError;

// The raw revert bytes sit on one error of the chain.
const data = (
  error.walk((e) => typeof (e as { data?: unknown }).data === "string") as {
    data?: Hex;
  } | null
)?.data;
const decoded = decodeErrorResult({
  abi: exampleToken.abi,
  data: data!,
});
expect(decoded.errorName).toBe("InsufficientBalance");
expect(decoded.args).toEqual([alice, 0n, 1n]);
```
<!-- /snippet -->

### 5. Whales and impersonation

[test/e2e/whales-and-impersonation.e2e.test.ts](test/e2e/whales-and-impersonation.e2e.test.ts)

Give any address Ether and tokens — `dealErc20` writes the balance slot, so
no minting (and no owner) is needed:

<!-- snippet: test/e2e/whales-and-impersonation.e2e.test.ts#deal -->
```ts
await anvil.cheats
  .setBalance(WHALE, parseEther("100")) // wei (setBalanceEther takes Ether)
  .dealErc20(token, WHALE, parseEther("1000000"));

expect(await anvil.getBalance(WHALE)).toBe(parseEther("100"));
expect(await balanceOf(anvil.testClient, token, WHALE)).toBe(
  parseEther("1000000"),
);
// The balance slot was written directly: totalSupply is untouched.
expect(
  await anvil.testClient.readContract({
    address: token,
    abi: exampleToken.abi,
    functionName: "totalSupply",
  }),
).toBe(0n);
```
<!-- /snippet -->

<!-- snippet: test/e2e/whales-and-impersonation.e2e.test.ts#add-balance -->
```ts
await anvil.cheats
  .setBalanceEther(WHALE, 1)
  .addBalance(WHALE, parseEther("2")); // adds instead of overwriting
expect(await anvil.getBalance(WHALE)).toBe(parseEther("3"));
```
<!-- /snippet -->

Act as that address for a block of code, or script a whole scenario as one
cheat chain (`step()` inserts any client call):

<!-- snippet: test/e2e/whales-and-impersonation.e2e.test.ts#with-impersonation -->
```ts
await anvil.withImpersonation(WHALE, (client) =>
  anvil.confirm(
    client.writeContract({
      account: WHALE,
      address: token,
      abi: exampleToken.abi,
      functionName: "transfer",
      args: [alice, parseEther("500")],
    }),
  ),
);
```
<!-- /snippet -->

<!-- snippet: test/e2e/whales-and-impersonation.e2e.test.ts#cheat-chain -->
```ts
await anvil.cheats
  .setBalanceEther(WHALE, 1)
  .dealErc20(token, WHALE, parseEther("10"))
  .impersonate(WHALE)
  .step(
    (client) =>
      client.writeContract({
        account: WHALE,
        address: token,
        abi: exampleToken.abi,
        functionName: "transfer",
        args: [alice, parseEther("10")],
      }),
    "whale pays alice", // label used in error messages
  )
  .stopImpersonating(WHALE)
  .mine();
```
<!-- /snippet -->

Create a client whose typed default account *is* that address:

<!-- snippet: test/e2e/whales-and-impersonation.e2e.test.ts#whale-client -->
```ts
const whale = await anvil.createTestClient((client) =>
  client.withAccount(WHALE, { impersonate: true }),
);
await anvil.confirm(
  whale.writeContract({
    address: vault,
    abi: timeLockVault.abi,
    functionName: "deposit",
    args: [parseEther("10")],
  }),
);
```
<!-- /snippet -->

For a single transaction, no impersonation is needed at all:

<!-- snippet: test/e2e/whales-and-impersonation.e2e.test.ts#unsigned -->
```ts
await anvil.confirm(
  anvil.testClient.sendUnsignedTransaction({
    from: WHALE,
    to: alice,
    value: parseEther("1"),
  }),
);
```
<!-- /snippet -->

Impersonation can be revoked:

<!-- snippet: test/e2e/whales-and-impersonation.e2e.test.ts#stop-impersonating -->
```ts
await anvil.impersonate(WHALE);
await anvil.confirm(
  anvil.testClientFor(WHALE).sendTransaction({ to: alice, value: 1n }),
);

await anvil.stopImpersonating(WHALE);
await expect(
  anvil.testClientFor(WHALE).sendTransaction({ to: alice, value: 1n }),
).rejects.toThrow(); // anvil no longer signs for the whale
```
<!-- /snippet -->

Set an account's nonce to deploy at a predictable CREATE address:

<!-- snippet: test/e2e/whales-and-impersonation.e2e.test.ts#set-nonce -->
```ts
await anvil.cheats.setNonce(WHALE, 100);
const predicted = getContractAddress({ from: WHALE, nonce: 100n });

const receipt = await anvil.withImpersonation(WHALE, (client) =>
  anvil.confirm(
    client.deployContract({
      account: WHALE,
      abi: exampleToken.abi,
      bytecode: exampleToken.bytecode,
      args: ["Whale Token", "WHL"],
    }),
  ),
);
expect(receipt.contractAddress?.toLowerCase()).toBe(
  predicted.toLowerCase(),
);
expect(await anvil.testClient.getTransactionCount({ address: WHALE })).toBe(
  101,
);
```
<!-- /snippet -->

Or impersonate every sender, configured at startup and switchable at runtime:

<!-- snippet: test/e2e/whales-and-impersonation.e2e.test.ts#auto-impersonate -->
```ts
// Every sender is impersonated: no per-address impersonate() calls.
const node = useAnvil(
  anvilContainer(new AnvilOptions().account.autoImpersonate()),
);

it("sends from any address", async () => {
  const [alice] = await node.addresses();
  await node.cheats.setBalanceEther(WHALE, 1);
  const receipt = await node.confirm(
    node.testClientFor(WHALE).sendTransaction({ to: alice, value: 1n }),
  );
  expect(receipt.from.toLowerCase()).toBe(WHALE.toLowerCase());
});

it("can be switched off and on at runtime", async () => {
  const [alice] = await node.addresses();
  await node.cheats.setBalanceEther(WHALE, 1).setAutoImpersonate(false);
  try {
    await expect(
      node.testClientFor(WHALE).sendTransaction({ to: alice, value: 1n }),
    ).rejects.toThrow();
  } finally {
    await node.cheats.setAutoImpersonate(true); // node setting: restore it
  }
  await node.confirm(
    node.testClientFor(WHALE).sendTransaction({ to: alice, value: 1n }),
  );
});
```
<!-- /snippet -->

### 6. Mempool and block building

[test/e2e/mempool-and-blocks.e2e.test.ts](test/e2e/mempool-and-blocks.e2e.test.ts)

Start a node that only mines on demand:

<!-- snippet: test/e2e/mempool-and-blocks.e2e.test.ts#no-mining -->
```ts
// Blocks are only mined on demand (anvil --no-mining). confirm() and the
// deploy fixtures mine a block when a transaction is still pending.
const anvil = useAnvil(
  anvilContainer(new AnvilOptions().mining.withNoMining()).withTestClient(
    (client) => client.withAccount(0),
  ),
  {
    setup: async (node) => {
      const [, alice] = await node.addresses();
      token = await deployToken(node.testClient);
      await mint(node.testClient, token, alice, parseEther("100"));
    },
  },
);
```
<!-- /snippet -->

Queue transactions and mine them into one block:

<!-- snippet: test/e2e/mempool-and-blocks.e2e.test.ts#one-block -->
```ts
const hashes: Hash[] = [];
for (const amount of [1n, 2n, 3n]) {
  hashes.push(
    await asAlice.writeContract({
      address: token,
      abi: exampleToken.abi,
      functionName: "transfer",
      args: [bob, parseEther(String(amount))],
    }),
  );
}
expect(await anvil.testClient.getTxpoolStatus()).toEqual({
  pending: 3,
  queued: 0,
});

await anvil.mine();
const receipts = await Promise.all(
  hashes.map((hash) => anvil.confirm(hash)),
);
expect(new Set(receipts.map((r) => r.blockNumber)).size).toBe(1);
```
<!-- /snippet -->

Control the order inside a block — by fee (default) or by arrival:

<!-- snippet: test/e2e/mempool-and-blocks.e2e.test.ts#fee-order -->
```ts
// anvil ranks pending transactions by their fee cap (maxFeePerGas).
const cheap = await anvil.testClientFor(alice).sendTransaction({
  to: bob,
  maxFeePerGas: parseGwei("20"),
  maxPriorityFeePerGas: parseGwei("1"),
});
const generous = await anvil.testClientFor(bob).sendTransaction({
  to: alice,
  maxFeePerGas: parseGwei("200"),
  maxPriorityFeePerGas: parseGwei("2"),
});
await anvil.mine();

const block = await anvil.testClient.getBlock();
expect(block.transactions).toEqual([generous, cheap]); // sent later, mined first
```
<!-- /snippet -->

<!-- snippet: test/e2e/mempool-and-blocks.e2e.test.ts#fifo -->
```ts
const node = useAnvil(
  anvilContainer(
    new AnvilOptions().mining.withNoMining().state.withOrder(Order.Fifo),
  ),
);

it("mines in arrival order regardless of fees", async () => {
  const [alice, bob] = await node.addresses();
  const cheap = await node.testClientFor(alice).sendTransaction({
    to: bob,
    maxFeePerGas: parseGwei("20"),
    maxPriorityFeePerGas: parseGwei("1"),
  });
  const generous = await node.testClientFor(bob).sendTransaction({
    to: alice,
    maxFeePerGas: parseGwei("200"),
    maxPriorityFeePerGas: parseGwei("2"),
  });
  await node.mine();
  expect((await node.testClient.getBlock()).transactions).toEqual([
    cheap,
    generous,
  ]);
});
```
<!-- /snippet -->

Pending transactions are not part of snapshots; `useAnvil` clears them
between tests:

<!-- snippet: test/e2e/mempool-and-blocks.e2e.test.ts#pool-isolation -->
```ts
it("may leave transactions pending…", async () => {
  const [, alice, bob] = await anvil.addresses();
  await anvil.testClientFor(alice).sendTransaction({ to: bob });
  expect((await anvil.testClient.getTxpoolStatus()).pending).toBe(1);
});

it("…because useAnvil empties the pool between tests", async () => {
  // Reverting a snapshot alone would keep them (and mine them next block).
  expect((await anvil.testClient.getTxpoolStatus()).pending).toBe(0);
});
```
<!-- /snippet -->

Inspect and edit the pool:

<!-- snippet: test/e2e/mempool-and-blocks.e2e.test.ts#txpool -->
```ts
const first = await anvil.testClientFor(alice).sendTransaction({ to: bob });
await anvil.testClientFor(bob).sendTransaction({ to: alice });

const { pending } = await anvil.testClient.getTxpoolContent();
expect(Object.keys(pending)).toHaveLength(2); // two senders

await anvil.cheats.dropTransaction(first); // alice's is gone…
await anvil.cheats.removePoolTransactions(bob); // …and everything from bob
expect(await anvil.testClient.getTxpoolStatus()).toEqual({
  pending: 0,
  queued: 0,
});

await anvil.testClientFor(alice).sendTransaction({ to: bob });
await anvil.cheats.dropAllTransactions(); // or clear the pool at once
expect((await anvil.testClient.getTxpoolStatus()).pending).toBe(0);
```
<!-- /snippet -->

<!-- snippet: test/e2e/mempool-and-blocks.e2e.test.ts#automine-toggle -->
```ts
const hash = await anvil.testClientFor(alice).sendTransaction({
  to: bob,
  value: 5n,
});
const { pending } = await anvil.testClient.inspectTxpool();
expect(JSON.stringify(pending)).toMatch(/5 wei \+ 21000 gas/);

await anvil.cheats.setAutomine(true); // mines everything pending…
try {
  expect(
    (await anvil.testClient.getTransactionReceipt({ hash })).status,
  ).toBe("success");
  expect(await anvil.testClient.getAutomine()).toBe(true);
} finally {
  await anvil.cheats.setAutomine(false); // …and back to on-demand mining
}
```
<!-- /snippet -->

Fill blocks to their gas limit:

<!-- snippet: test/e2e/mempool-and-blocks.e2e.test.ts#gas-limit -->
```ts
await anvil.cheats.setBlockGasLimit(50_000n); // room for two 21k transfers
try {
  for (let i = 0; i < 3; i++) {
    await anvil.testClientFor(alice).sendTransaction({ to: bob });
  }
  await anvil.mine();
  expect((await anvil.testClient.getBlock()).transactions).toHaveLength(2);
  expect((await anvil.testClient.getTxpoolStatus()).pending).toBe(1);
} finally {
  await anvil.cheats.setBlockGasLimit(30_000_000n); // node setting: restore
}
await anvil.mine();
expect((await anvil.testClient.getBlock()).transactions).toHaveLength(1);
```
<!-- /snippet -->

Set the base fee and follow the money — the base fee is burned, the tip goes
to the coinbase:

<!-- snippet: test/e2e/mempool-and-blocks.e2e.test.ts#fees -->
```ts
await anvil.cheats
  .setCoinbase(BUILDER)
  .setNextBlockBaseFeePerGas(parseGwei("10"));
try {
  const hash = await anvil.testClientFor(alice).sendTransaction({
    to: bob,
    maxFeePerGas: parseGwei("20"),
    maxPriorityFeePerGas: parseGwei("2"),
  });
  await anvil.mine();
  const receipt = await anvil.confirm(hash);

  expect((await anvil.testClient.getBlock()).baseFeePerGas).toBe(
    parseGwei("10"),
  );
  expect(receipt.effectiveGasPrice).toBe(parseGwei("12")); // base fee + tip
  // The base fee is burned; the coinbase earns only the tip.
  expect(await anvil.getBalance(BUILDER)).toBe(
    parseGwei("2") * receipt.gasUsed,
  );
} finally {
  await anvil.cheats.setCoinbase(miner); // node setting: restore
}
```
<!-- /snippet -->

Legacy (pre-London) gas pricing:

<!-- snippet: test/e2e/mempool-and-blocks.e2e.test.ts#legacy-gas -->
```ts
const node = useAnvil(
  anvilContainer(new AnvilOptions().evm.withHardfork(Hardfork.Berlin)),
);

it("sets the gas price the node suggests", async () => {
  const [alice, bob] = await node.addresses();
  await node.cheats.setMinGasPrice(parseGwei("5"));
  expect(await node.testClient.getGasPrice()).toBe(parseGwei("5"));

  const receipt = await node.confirm(
    node.testClient.sendTransaction({
      account: alice,
      to: bob,
      gasPrice: await node.testClient.getGasPrice(), // explicit on pre-London chains
    }),
  );
  expect(receipt.type).toBe("legacy");
  expect(receipt.effectiveGasPrice).toBe(parseGwei("5"));
});
```
<!-- /snippet -->

### 7. Events and subscriptions

[test/e2e/events-and-subscriptions.e2e.test.ts](test/e2e/events-and-subscriptions.e2e.test.ts)

A WebSocket test client receives events through `eth_subscribe` instead of
polling (the connection is closed when the node stops).

Watchers subscribe **asynchronously** and viem gives no "subscription is
live" signal, so triggering an event right after starting a watcher can
race the subscription. Sleeping "long enough" is flaky under load; instead,
`triggerUntil()` ([src/watchers.ts](src/watchers.ts)) repeats the trigger
until the watcher reports it:

<!-- snippet: test/e2e/events-and-subscriptions.e2e.test.ts#websocket -->
```ts
const anvil = useAnvil(
  anvilContainer().withTestClient((client) =>
    client.withAccount(0).withTransport("webSocket"),
  ),
  { setup: async (node) => void (token = await deployToken(node.testClient)) },
);
```
<!-- /snippet -->

<!-- snippet: test/e2e/events-and-subscriptions.e2e.test.ts#watch -->
```ts
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
```
<!-- /snippet -->

Stream new blocks and pending transactions. viem fetches each announced
block separately, so blocks can be **reported out of order**: collect them
and compare sets, not sequences.

<!-- snippet: test/e2e/events-and-subscriptions.e2e.test.ts#watch-blocks -->
```ts
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
```
<!-- /snippet -->

<!-- snippet: test/e2e/events-and-subscriptions.e2e.test.ts#pending -->
```ts
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
```
<!-- /snippet -->

A human-readable event signature gives typed logs, even with JSON ABIs:

<!-- snippet: test/e2e/events-and-subscriptions.e2e.test.ts#event-signature -->
```ts
// A human-readable event signature gives full type inference for log args,
// even though the JSON ABIs are untyped.
const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
```
<!-- /snippet -->

<!-- snippet: test/e2e/events-and-subscriptions.e2e.test.ts#typed-logs -->
```ts
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
```
<!-- /snippet -->

Query history by indexed argument, or poll a filter for changes:

<!-- snippet: test/e2e/events-and-subscriptions.e2e.test.ts#history -->
```ts
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
```
<!-- /snippet -->

<!-- snippet: test/e2e/events-and-subscriptions.e2e.test.ts#filter -->
```ts
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
```
<!-- /snippet -->

Your own WebSocket clients connect to `anvil.wsUrl`:

<!-- snippet: test/e2e/events-and-subscriptions.e2e.test.ts#own-websocket -->
```ts
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
```
<!-- /snippet -->

### 8. Simulation and gas

[test/e2e/simulation-and-gas.e2e.test.ts](test/e2e/simulation-and-gas.e2e.test.ts)

Simulate several blocks — with block overrides such as time — without
sending anything (`eth_simulateV1`):

<!-- snippet: test/e2e/simulation-and-gas.e2e.test.ts#simulate-blocks -->
```ts
const now = (await anvil.testClient.getBlock()).timestamp;
const [today, later] = await anvil.testClient.simulateBlocks({
  blocks: [
    {
      calls: [
        {
          from: alice,
          to: token,
          abi: exampleToken.abi,
          functionName: "approve",
          args: [vault, 5n],
        },
        {
          from: alice,
          to: vault,
          abi: timeLockVault.abi,
          functionName: "deposit",
          args: [5n],
        },
      ],
    },
    {
      blockOverrides: { time: now + 2n * LOCK }, // two days later
      calls: [
        {
          from: alice,
          to: vault,
          abi: timeLockVault.abi,
          functionName: "withdraw",
        },
      ],
    },
  ],
});
expect(today.calls.map((call) => call.status)).toEqual([
  "success",
  "success",
]);
expect(later.calls[0].status).toBe("success");
expect(later.timestamp).toBe(now + 2n * LOCK);

// Nothing happened on chain:
expect(await balanceOf(anvil.testClient, token, vault)).toBe(0n);
```
<!-- /snippet -->

Failing calls are reported, not thrown:

<!-- snippet: test/e2e/simulation-and-gas.e2e.test.ts#simulate-failure -->
```ts
const [block] = await anvil.testClient.simulateBlocks({
  blocks: [
    {
      calls: [
        {
          from: alice,
          to: vault,
          abi: timeLockVault.abi,
          functionName: "withdraw",
        },
        {
          from: alice,
          to: token,
          abi: exampleToken.abi,
          functionName: "balanceOf",
          args: [alice],
        },
      ],
    },
  ],
});
expect(block.calls[0].status).toBe("failure"); // NothingToWithdraw
expect(block.calls[1]).toMatchObject({
  status: "success",
  result: parseEther("10"),
});
```
<!-- /snippet -->

<!-- snippet: test/e2e/simulation-and-gas.e2e.test.ts#simulate-calls -->
```ts
const { results } = await anvil.testClient.simulateCalls({
  account: alice,
  calls: [
    {
      to: token,
      abi: exampleToken.abi,
      functionName: "transfer",
      args: [bob, 1n],
    },
    { to: bob, value: parseEther("1") },
  ],
});
expect(results.map((result) => result.status)).toEqual([
  "success",
  "success",
]);
expect(results[0].gasUsed).toBeGreaterThan(0n);
```
<!-- /snippet -->

Override block fields for a single `eth_call`:

<!-- snippet: test/e2e/simulation-and-gas.e2e.test.ts#block-overrides -->
```ts
const withdraw = {
  account: alice,
  to: vault,
  data: encodeFunctionData({
    abi: timeLockVault.abi,
    functionName: "withdraw",
  }),
};
const { timestamp } = await anvil.testClient.getBlock();

await expect(anvil.testClient.call(withdraw)).rejects.toThrow(); // still locked
await expect(
  anvil.testClient.call({
    ...withdraw,
    blockOverrides: { time: timestamp + LOCK + 1n },
  }),
).resolves.toBeDefined(); // would succeed after the lock
```
<!-- /snippet -->

Build an EIP-2930 access list and send with it:

<!-- snippet: test/e2e/simulation-and-gas.e2e.test.ts#access-list -->
```ts
const data = encodeFunctionData({
  abi: exampleToken.abi,
  functionName: "transfer",
  args: [bob, 1n],
});
const { accessList, gasUsed } = await anvil.testClient.createAccessList({
  account: alice,
  to: token,
  data,
});
expect(accessList[0].address.toLowerCase()).toBe(token.toLowerCase());
expect(accessList[0].storageKeys.length).toBeGreaterThan(0); // both balances
expect(gasUsed).toBeGreaterThan(0n);

const receipt = await anvil.confirm(
  anvil
    .testClientFor(alice)
    .sendTransaction({ to: token, data, accessList }),
);
expect(receipt.type).toBe("eip1559");
```
<!-- /snippet -->

Estimate gas and fees, let the node fill a transaction, prove storage:

<!-- snippet: test/e2e/simulation-and-gas.e2e.test.ts#estimates -->
```ts
const gas = await anvil.testClient.estimateContractGas({
  account: alice,
  address: token,
  abi: exampleToken.abi,
  functionName: "transfer",
  args: [bob, 1n],
});
const { maxFeePerGas, maxPriorityFeePerGas } =
  await anvil.testClient.estimateFeesPerGas();
const history = await anvil.testClient.getFeeHistory({
  blockCount: 3,
  rewardPercentiles: [50],
});

expect(gas).toBeGreaterThan(21_000n);
expect(maxFeePerGas).toBeGreaterThan(maxPriorityFeePerGas);
expect(history.baseFeePerGas.length).toBeGreaterThan(0);
```
<!-- /snippet -->

<!-- snippet: test/e2e/simulation-and-gas.e2e.test.ts#fill-transaction -->
```ts
const { transaction } = await anvil.testClient.fillTransaction({
  account: alice,
  to: bob,
  value: 1n,
});
expect(transaction).toMatchObject({
  nonce: await anvil.testClient.getTransactionCount({ address: alice }),
  chainId: anvil.chainId,
  type: "eip1559",
});
expect(transaction.gas).toBe(21_000n);
```
<!-- /snippet -->

<!-- snippet: test/e2e/simulation-and-gas.e2e.test.ts#proof -->
```ts
const totalSupplySlot = numberToHex(2, { size: 32 }); // 3rd state variable
const proof = await anvil.testClient.getProof({
  address: token,
  storageKeys: [totalSupplySlot],
});
expect(proof.storageProof[0].value).toBe(parseEther("10"));
expect(proof.accountProof.length).toBeGreaterThan(0);
```
<!-- /snippet -->

### 9. Mocking dependencies

[test/e2e/mocking-dependencies.e2e.test.ts](test/e2e/mocking-dependencies.e2e.test.ts)

The contract under test reads a price oracle at a fixed mainnet address.
`setCode` needs *runtime* code, while artifacts hold *creation* bytecode:
deploy the test double once and read its code back.

<!-- snippet: test/e2e/mocking-dependencies.e2e.test.ts#runtime-code -->
```ts
// setCode needs *runtime* code: deploy the test double once from its
// creation bytecode (.bin) and read the code the constructor left behind.
const template = await deployFixedPriceOracle(node.testClient);
oracleCode = (await node.testClient.getCode({ address: template }))!;
```
<!-- /snippet -->

Then put that code at the oracle address and write its storage directly:

<!-- snippet: test/e2e/mocking-dependencies.e2e.test.ts#etch -->
```ts
await anvil.cheats
  .setCode(ORACLE, oracleCode)
  .setStorageAt(ORACLE, 0, parseUnits("3000", 8)); // slot 0: `price`

expect(await quote(anvil.testClient, consumer, parseEther("2"))).toBe(
  parseUnits("6000", 8),
);
```
<!-- /snippet -->

Or mock it for a single call only, with a state override — nothing is
written:

<!-- snippet: test/e2e/mocking-dependencies.e2e.test.ts#state-override -->
```ts
// The override exists only inside this eth_call: nothing is written.
const { result } = await anvil.testClient.simulateContract({
  address: consumer,
  abi: priceConsumer.abi,
  functionName: "quote",
  args: [parseEther("1")],
  stateOverride: [
    {
      address: ORACLE,
      code: oracleCode,
      stateDiff: [
        {
          slot: numberToHex(0, { size: 32 }),
          value: numberToHex(parseUnits("2500", 8), { size: 32 }),
        },
      ],
    },
  ],
});
expect(result).toBe(parseUnits("2500", 8));
expect(await anvil.testClient.getCode({ address: ORACLE })).toBeUndefined();
```
<!-- /snippet -->

Storage of mappings lives at `keccak256(key ‖ slot)`:

<!-- snippet: test/e2e/mocking-dependencies.e2e.test.ts#mapping-slot -->
```ts
// balanceOf is the 4th state variable (slot 3): entry = keccak256(key . slot)
const slot = keccak256(
  encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [alice, 3n],
  ),
);
expect(await anvil.testClient.getStorageAt({ address: token, slot })).toBe(
  numberToHex(1n, { size: 32 }),
); // confirms the layout

await anvil.cheats.setStorageAt(token, slot, parseEther("500"));
expect(await balanceOf(anvil.testClient, token, alice)).toBe(
  parseEther("500"),
);
```
<!-- /snippet -->

The same technique replaces any dependency: a token, a router, an access
controller. Storage slots follow the contract's storage layout (the test
double keeps `price` in slot 0).

### 10. State fixtures and genesis

[test/e2e/state-fixtures.e2e.test.ts](test/e2e/state-fixtures.e2e.test.ts)

Build an expensive fixture once and save it:

<!-- snippet: test/e2e/state-fixtures.e2e.test.ts#build-fixture -->
```ts
const builder = await anvilContainer()
  .withTestClient((client) => client.withAccount(0))
  .start();
try {
  token = await deployToken(builder.testClient);
  holders = await builder.addresses();
  for (const holder of holders) {
    await mint(builder.testClient, token, holder, parseEther("1000"));
  }
  await builder.dumpStateToFile(fixtureFile); // the `--load-state` format
  oracleCode = (await builder.testClient.getCode({
    address: await deployFixedPriceOracle(builder.testClient),
  }))!;
} finally {
  await builder.stop();
}
```
<!-- /snippet -->

Boot nodes from it (the file is copied into the container), or merge it into
a running node:

<!-- snippet: test/e2e/state-fixtures.e2e.test.ts#boot-from-fixture -->
```ts
const anvil = await anvilContainer(
  new AnvilOptions().state.withLoadState(fixtureFile),
).start();
try {
  expect(await balanceOf(anvil.testClient, token, holders[9])).toBe(
    parseEther("1000"),
  );
} finally {
  await anvil.stop();
}
```
<!-- /snippet -->

<!-- snippet: test/e2e/state-fixtures.e2e.test.ts#load-at-runtime -->
```ts
await anvil.loadStateFromFile(fixtureFile);
```
<!-- /snippet -->

Keep state in memory instead of a file:

<!-- snippet: test/e2e/state-fixtures.e2e.test.ts#dump-in-memory -->
```ts
await anvil.setBalanceEther(alice, 42);
const state = await anvil.dumpState(); // hex blob, e.g. to cache between suites

await anvil.reset(); // back to genesis: the balance is gone…
expect(await anvil.getBalance(alice)).toBe(parseEther("10000"));

await anvil.loadState(state); // …and restored
expect(await anvil.getBalance(alice)).toBe(parseEther("42"));
```
<!-- /snippet -->

Or write a genesis file with pre-funded accounts and pre-deployed contracts:

<!-- snippet: test/e2e/state-fixtures.e2e.test.ts#genesis -->
```ts
const ORACLE: Address = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
const TREASURY: Address = "0x1111111111111111111111111111111111111111";
const genesisFile = path.join(directory, "genesis.json");
fs.writeFileSync(
  genesisFile,
  JSON.stringify({
    config: { chainId: 1337 },
    timestamp: numberToHex(1_700_000_000),
    gasLimit: numberToHex(30_000_000),
    alloc: {
      [TREASURY]: { balance: numberToHex(parseEther("1000000")) },
      [ORACLE]: {
        balance: "0x0", // required by anvil for every entry
        code: oracleCode, // runtime code: the contract exists from block 0
        storage: {
          [numberToHex(0, { size: 32 })]: numberToHex(
            parseUnits("3000", 8),
            {
              size: 32,
            },
          ),
        },
      },
    },
  }),
);

const anvil = await anvilContainer(
  new AnvilOptions().state.withInit(genesisFile),
).start();
try {
  expect(anvil.chainId).toBe(1337);
  expect(await anvil.getBalance(TREASURY)).toBe(parseEther("1000000"));
  expect(
    await anvil.testClient.readContract({
      address: ORACLE,
      abi: fixedPriceOracle.abi,
      functionName: "latestPrice",
    }),
  ).toBe(parseUnits("3000", 8));
  const genesis = await anvil.testClient.getBlock({ blockNumber: 0n });
  expect(genesis.timestamp).toBe(1_700_000_000n);
} finally {
  await anvil.stop();
}
```
<!-- /snippet -->

### 11. Forking

[test/e2e/forking.e2e.test.ts](test/e2e/forking.e2e.test.ts)

Tests run against another chain's deployed state. Here the "upstream" is a
second anvil playing mainnet; point `withForkUrl` at a real RPC URL for real
networks. Both nodes run in Docker on a shared network (`startNetwork()` in
[test/support/runtime.ts](test/support/runtime.ts)), or locally with
`--no-docker`.

<!-- snippet: test/e2e/forking.e2e.test.ts#upstream -->
```ts
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
```
<!-- /snippet -->

<!-- snippet: test/e2e/forking.e2e.test.ts#fork -->
```ts
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
```
<!-- /snippet -->

The fork sees upstream state at the fork block, and changes stay local:

<!-- snippet: test/e2e/forking.e2e.test.ts#fork-state -->
```ts
expect(fork.chainId).toBe(1); // the client follows the forked chain
expect(await balanceOf(fork.testClient, token, HOLDER)).toBe(
  parseEther("1000000"), // the later mint is not part of the fork
);
const { forkedNetwork } = await fork.metadata();
expect(forkedNetwork).toMatchObject({
  chainId: 1,
  forkBlockNumber: Number(forkBlock),
});
```
<!-- /snippet -->

<!-- snippet: test/e2e/forking.e2e.test.ts#fork-local -->
```ts
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
```
<!-- /snippet -->

`reset()` re-forks at the fork block, `reset({ blockNumber })` moves the
fork, `setRpcUrl()` switches the upstream endpoint:

<!-- snippet: test/e2e/forking.e2e.test.ts#fork-reset -->
```ts
await fork.cheats.dealErc20(token, HOLDER, 0n).mine(10);

await fork.reset();

expect(await fork.testClient.getBlockNumber()).toBe(forkBlock);
expect(await balanceOf(fork.testClient, token, HOLDER)).toBe(
  parseEther("1000000"),
);
```
<!-- /snippet -->

<!-- snippet: test/e2e/forking.e2e.test.ts#fork-move -->
```ts
await fork.reset({ blockNumber: forkBlock + 1n });

expect(await balanceOf(fork.testClient, token, HOLDER)).toBe(
  parseEther("1000000") + 1n, // now includes the later mint
);
```
<!-- /snippet -->

<!-- snippet: test/e2e/forking.e2e.test.ts#set-rpc-url -->
```ts
const backup = network.urlOf(mainnet, "mainnet-backup");
await fork.cheats.setRpcUrl(backup); // e.g. fail over to another provider

expect((await fork.nodeInfo()).forkConfig.forkUrl).toBe(backup);
await fork.reset(); // re-forks through the new endpoint
expect(await balanceOf(fork.testClient, token, HOLDER)).toBe(
  parseEther("1000000"),
);
```
<!-- /snippet -->

### 12. Signing, key material and EIP-7702

[test/e2e/signing.e2e.test.ts](test/e2e/signing.e2e.test.ts)

A local account signs in the test process, like a wallet:

<!-- snippet: test/e2e/signing.e2e.test.ts#local-account -->
```ts
// Dev account 1 signs locally (its key is derived from anvil's mnemonic).
const anvil = useAnvil(
  anvilContainer().withTestClient((client) => client.withLocalAccount(1)),
  {
    // A contract to delegate EOAs to (EIP-7702), deployed once.
    setup: async (node) =>
      void (delegate = await deployFixedPriceOracle(node.testClient)),
  },
);
```
<!-- /snippet -->

<!-- snippet: test/e2e/signing.e2e.test.ts#mnemonic -->
```ts
const expected = mnemonicToAccount(DEFAULT_MNEMONIC, { addressIndex: 1 });
expect(anvil.testClient.account.address).toBe(expected.address);
```
<!-- /snippet -->

Messages, raw bytes and EIP-712 typed data:

<!-- snippet: test/e2e/signing.e2e.test.ts#recover -->
```ts
const raw = await anvil.testClient.signMessage({
  message: { raw: "0xdeadbeef" }, // sign bytes, not their hex text
});
expect(
  await recoverMessageAddress({
    message: { raw: "0xdeadbeef" },
    signature: raw,
  }),
).toBe(anvil.testClient.account.address);
```
<!-- /snippet -->

<!-- snippet: test/e2e/signing.e2e.test.ts#typed-data -->
```ts
const order = {
  domain: {
    name: "Example Exchange",
    version: "1",
    chainId: 31337,
    verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
  },
  types: {
    Order: [
      { name: "maker", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
  },
  primaryType: "Order",
} as const;
```
<!-- /snippet -->

<!-- snippet: test/e2e/signing.e2e.test.ts#sign-typed-data -->
```ts
const message = { maker, amount: parseEther("1"), nonce: 0n };
const signature = await anvil.testClient.signTypedData({
  ...order,
  message,
});

expect(
  await verifyTypedData({ ...order, message, address: maker, signature }),
).toBe(true);
expect(
  await recoverTypedDataAddress({ ...order, message, signature }),
).toBe(maker);
```
<!-- /snippet -->

Sign offline and broadcast raw bytes, or create a fresh funded user per test:

<!-- snippet: test/e2e/signing.e2e.test.ts#offline -->
```ts
const request = await anvil.testClient.prepareTransactionRequest({
  to: alice,
  value: parseEther("1"),
});
const raw = await anvil.testClient.signTransaction(request);
const hash = await anvil.testClient.sendRawTransaction({
  serializedTransaction: raw,
});
```
<!-- /snippet -->

<!-- snippet: test/e2e/signing.e2e.test.ts#fresh-user -->
```ts
const user = privateKeyToAccount(generatePrivateKey());
await anvil.cheats.setBalanceEther(user.address, 1);
const asUser = anvil.testClientFor(user);

const [alice] = await anvil.addresses();
await anvil.confirm(asUser.sendTransaction({ to: alice, value: 1n }));
expect(
  await anvil.testClient.getTransactionCount({ address: user.address }),
).toBe(1);
```
<!-- /snippet -->

EIP-7702: delegate an account's code to a contract, executed by the account
itself or sponsored by another:

<!-- snippet: test/e2e/signing.e2e.test.ts#eip7702-self -->
```ts
// The sender is also the authority: sign for the nonce after this transaction.
const authorization = await anvil.testClient.signAuthorization({
  contractAddress: delegate,
  executor: "self",
});
await anvil.confirm(
  anvil.testClient.sendTransaction({
    authorizationList: [authorization],
    to: account,
    data: encodeFunctionData({
      abi: fixedPriceOracle.abi,
      functionName: "latestPrice",
    }),
  }),
);

// The EOA now carries a delegation designator (0xef0100 ‖ delegate)…
expect(await anvil.testClient.getCode({ address: account })).toBe(
  concat(["0xef0100", delegate]).toLowerCase(),
);
// …and runs the delegate's code against its own storage.
await anvil.cheats.setStorageAt(account, 0, 42n);
expect(
  await anvil.testClient.readContract({
    address: account,
    abi: fixedPriceOracle.abi,
    functionName: "latestPrice",
  }),
).toBe(42n);
```
<!-- /snippet -->

<!-- snippet: test/e2e/signing.e2e.test.ts#eip7702-sponsored -->
```ts
// A brand-new user without any Ether signs the authorization…
const user = privateKeyToAccount(generatePrivateKey());
const authorization = await anvil
  .testClientFor(user)
  .signAuthorization({ contractAddress: delegate });

// …and the default account submits (and pays for) it.
await anvil.confirm(
  anvil.testClient.sendTransaction({
    authorizationList: [authorization],
    to: user.address,
    data: encodeFunctionData({
      abi: fixedPriceOracle.abi,
      functionName: "latestPrice",
    }),
  }),
);
expect(await anvil.getBalance(user.address)).toBe(0n);
expect(await anvil.testClient.getCode({ address: user.address })).toBe(
  concat(["0xef0100", delegate]).toLowerCase(),
);
```
<!-- /snippet -->

Dev accounts from a custom derivation path, a random mnemonic or a seed:

<!-- snippet: test/e2e/signing.e2e.test.ts#key-material -->
```ts
const MNEMONIC =
  "legal winner thank year wave sausage worth useful legal winner thank yellow";
// Dev accounts from a second BIP-44 account branch: m/44'/60'/1'/0/i
const derived = useAnvil(
  anvilContainer(
    new AnvilOptions().account
      .withMnemonic(MNEMONIC)
      .withDerivationPath("m/44'/60'/1'/0/")
      .withAccounts(2),
  ),
);
// A fresh random mnemonic per run; keys are read from anvil's startup banner.
const random = useAnvil(
  anvilContainer(
    new AnvilOptions().account.withRandomMnemonic(),
  ).withTestClient((client) => client.withLocalAccount(0)),
);

// Reproducible "random" accounts: the same seed gives the same mnemonic.
const seeded = useAnvil(
  anvilContainer(new AnvilOptions().account.withMnemonicSeedUnsafe(42)),
);
const seededAgain = useAnvil(
  anvilContainer(new AnvilOptions().account.withMnemonicSeedUnsafe(42)),
);

it("derives accounts along the configured path", async () => {
  const accounts = await derived.accounts();
  accounts.forEach(({ index, address }) =>
    expect(
      mnemonicToAccount(MNEMONIC, { accountIndex: 1, addressIndex: index })
        .address,
    ).toBe(address),
  );
});

it("reproduces seeded accounts across nodes", async () => {
  const [first] = await seeded.addresses();
  expect(await seededAgain.addresses()).toEqual(await seeded.addresses());
  expect(first).not.toBe(mnemonicToAccount(DEFAULT_MNEMONIC).address);
});

it("signs locally with keys of a random mnemonic", async () => {
  const [first] = await random.accounts();
  expect(first.privateKey).toBeDefined();
  expect(random.testClient.account.address).toBe(first.address);
  const [, other] = await random.addresses();
  const receipt = await random.confirm(
    random.testClient.sendTransaction({ to: other, value: 1n }),
  );
  expect(receipt.from.toLowerCase()).toBe(first.address.toLowerCase());
});
```
<!-- /snippet -->

### 13. Chain configuration and reorgs

[test/e2e/chain-config-and-reorgs.e2e.test.ts](test/e2e/chain-config-and-reorgs.e2e.test.ts)

Chain id, hardfork, gas limit and base fee are anvil flags; the client
follows the node's chain id and takes extra chain metadata:

<!-- snippet: test/e2e/chain-config-and-reorgs.e2e.test.ts#chain-config -->
```ts
const anvil = useAnvil(
  anvilContainer(
    new AnvilOptions().evm
      .withChainId(8453)
      .withHardfork(Hardfork.Cancun)
      .withGasLimit(60_000_000)
      .withBlockBaseFeePerGas(parseGwei("7")),
  ).withTestClient((client) =>
    client
      .withAccount(0)
      .withChain({
        name: "Local Base",
        blockExplorers: {
          default: { name: "None", url: "http://localhost" },
        },
      })
      .withPollingInterval(50),
  ),
);
```
<!-- /snippet -->

<!-- snippet: test/e2e/chain-config-and-reorgs.e2e.test.ts#node-info -->
```ts
const info = await anvil.testClient.getNodeInfo();
expect(info.hardFork.toLowerCase()).toBe("cancun");
expect(hexToNumber(info.environment.chainId)).toBe(8453);
expect(BigInt(info.environment.gasLimit)).toBe(60_000_000n);

const metadata = await anvil.testClient.getMetadata();
expect(metadata.clientVersion).toMatch(/anvil/);
expect(metadata.forkedNetwork).toBeFalsy(); // not a fork

// The exact command line anvil was started with, and the client settings:
expect(anvil.configuration.command.join(" ")).toContain("--chain-id 8453");
expect(anvil.testClientConfiguration.pollingInterval).toBe(50);
expect((await anvil.nodeInfo()).currentBlockNumber).toBeDefined();
```
<!-- /snippet -->

Change the chain id at runtime:

<!-- snippet: test/e2e/chain-config-and-reorgs.e2e.test.ts#set-chain-id -->
```ts
await anvil.cheats.setChainId(10);
try {
  expect(anvil.chainId).toBe(10); // the container's clients follow
  // Sign locally: anvil's own dev-account signer keeps the startup chain id.
  const signer = anvil.testClientFor(
    privateKeyToAccount(alice.privateKey!),
  );
  const receipt = await anvil.confirm(
    signer.sendTransaction({ to: alice.address, value: 1n }),
  );
  expect(receipt.status).toBe("success");
} finally {
  await anvil.cheats.setChainId(8453); // node setting: restore
}
```
<!-- /snippet -->

Caching trades freshness for fewer requests:

<!-- snippet: test/e2e/chain-config-and-reorgs.e2e.test.ts#cache-time -->
```ts
const cached = await anvil.createTestClient((client) =>
  client.withCacheTime(60_000),
);
const height = await cached.getBlockNumber();
await anvil.mine();

expect(await cached.getBlockNumber()).toBe(height); // served from cache
expect(await anvil.testClient.getBlockNumber()).toBe(height + 1n); // default: no cache
```
<!-- /snippet -->

Test code that waits for confirmations against reorgs:

<!-- snippet: test/e2e/chain-config-and-reorgs.e2e.test.ts#reorg -->
```ts
const receipt = await anvil.confirm(
  anvil.testClient.sendTransaction({ to: alice, value: parseEther("1") }),
);
await anvil.mine(2); // 3 confirmations

// Replace the last 3 blocks with empty ones: the transaction disappears.
await anvil.testClient.reorg({ depth: 3 });

expect(await anvil.testClient.getBlockNumber()).toBe(
  receipt.blockNumber + 2n, // same height, different blocks
);
await expect(
  anvil.testClient.getTransactionReceipt({ hash: receipt.transactionHash }),
).rejects.toThrow(/could not be found/);
```
<!-- /snippet -->

<!-- snippet: test/e2e/chain-config-and-reorgs.e2e.test.ts#reorg-replace -->
```ts
// The new last block contains a payment to bob that never happened before.
await anvil.testClient.reorg({
  depth: 1,
  transactions: [
    {
      transaction: { from: deployer, to: bob, value: parseEther("5") },
      block: 0,
    },
  ],
});
expect(await anvil.getBalance(bob)).toBe(before + parseEther("5"));
```
<!-- /snippet -->

### 14. Node configuration

[test/e2e/node-configuration.e2e.test.ts](test/e2e/node-configuration.e2e.test.ts)

CORS, for tests of browser dApps:

<!-- snippet: test/e2e/node-configuration.e2e.test.ts#cors -->
```ts
const open = useAnvil(
  anvilContainer(new AnvilOptions().server.withAllowOrigin(ORIGIN)),
);
const closed = useAnvil(anvilContainer(new AnvilOptions().server.noCors()));

it("allows the configured origin", async () => {
  const response = await preflight(open.rpcUrl);
  expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
});

it("rejects cross-origin requests with --no-cors", async () => {
  const response = await preflight(closed.rpcUrl);
  expect(response.ok).toBe(false);
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
});
```
<!-- /snippet -->

The EIP-170 contract size limit, enforced by default and configurable:

<!-- snippet: test/e2e/node-configuration.e2e.test.ts#code-size -->
```ts
const strict = useAnvil(
  anvilContainer().withTestClient((client) => client.withAccount(0)),
);
const raised = useAnvil(
  anvilContainer(
    new AnvilOptions().evm.withCodeSizeLimit(32_768),
  ).withTestClient((client) => client.withAccount(0)),
);

it("rejects contracts over 24,576 bytes by default", async () => {
  const hash = await strict.testClient.deployContract({
    abi: oversizedContract.abi,
    bytecode: oversizedContract.bytecode, // deploys 24,577 bytes
  });
  await expect(strict.confirm(hash)).rejects.toBeInstanceOf(
    AnvilTransactionRevertedError,
  );
});

it("deploys them with a raised limit (e.g. unoptimised debug builds)", async () => {
  const { contractAddress } = await raised.confirm(
    raised.testClient.deployContract({
      abi: oversizedContract.abi,
      bytecode: oversizedContract.bytecode,
    }),
  );
  const code = await raised.testClient.getCode({
    address: contractAddress!,
  });
  expect((code!.length - 2) / 2).toBe(24_577);
});
```
<!-- /snippet -->

Deterministic deployments through the pre-deployed CREATE2 deployer:

<!-- snippet: test/e2e/node-configuration.e2e.test.ts#create2 -->
```ts
const node = useAnvil(
  anvilContainer().withTestClient((client) => client.withAccount(0)),
);
const bare = useAnvil(
  anvilContainer(new AnvilOptions().evm.disableDefaultCreate2Deployer()),
);

it("deploys to a precomputed address through the CREATE2 deployer", async () => {
  const salt = `0x${"00".repeat(31)}2a` as const;
  const predicted = getContractAddress({
    opcode: "CREATE2",
    from: CREATE2_DEPLOYER,
    salt,
    bytecode: fixedPriceOracle.bytecode,
  });
  // The deployer's calldata is simply salt ‖ creation code.
  await node.confirm(
    node.testClient.sendTransaction({
      to: CREATE2_DEPLOYER,
      data: concat([salt, fixedPriceOracle.bytecode]),
    }),
  );
  expect(
    await node.testClient.getCode({ address: predicted }),
  ).toBeDefined();
});

it("can start without the deployer (e.g. to deploy your own)", async () => {
  expect(
    await bare.testClient.getCode({ address: CREATE2_DEPLOYER }),
  ).toBeUndefined();
});
```
<!-- /snippet -->

Block gas limit, port and logging, history and genesis height:

<!-- snippet: test/e2e/node-configuration.e2e.test.ts#block-gas-limit -->
```ts
const limited = useAnvil(anvilContainer());
const unlimited = useAnvil(
  anvilContainer(new AnvilOptions().evm.disableBlockGasLimit()),
);

it("rejects transactions above the block gas limit by default", async () => {
  const [alice, bob] = await limited.addresses();
  await expect(
    limited.testClient.sendTransaction({
      account: alice,
      to: bob,
      gas: 100_000_000n,
    }),
  ).rejects.toThrow(/gas/);
});

it("accepts them without a block gas limit (gas-heavy tests, fuzzing)", async () => {
  const [alice, bob] = await unlimited.addresses();
  const receipt = await unlimited.confirm(
    unlimited.testClient.sendTransaction({
      account: alice,
      to: bob,
      gas: 100_000_000n,
    }),
  );
  expect(receipt.status).toBe("success");
});
```
<!-- /snippet -->

<!-- snippet: test/e2e/node-configuration.e2e.test.ts#server -->
```ts
// anvil listens on 9545 inside the container; the host port is mapped.
const custom = useAnvil(
  anvilContainer(new AnvilOptions().server.withPort(9545).logs.quiet()),
);

it("maps the configured port to a free host port", async () => {
  const hostPort = custom.getMappedPort(9545);
  expect(custom.rpcUrl).toBe(`http://${custom.getHost()}:${hostPort}`);
  expect(await custom.testClient.getChainId()).toBe(31337);
});

it("starts quietly (no banner) and still knows the dev keys", async () => {
  expect(await custom.logText()).not.toContain("Available Accounts");
  const [first] = await custom.accounts(); // derived from the mnemonic
  expect(first.privateKey).toBeDefined();
});
```
<!-- /snippet -->

<!-- snippet: test/e2e/node-configuration.e2e.test.ts#history -->
```ts
// Long-running suites: keep only the latest state in memory.
const pruned = useAnvil(
  anvilContainer(new AnvilOptions().state.withPruneHistory()),
  { isolation: "none" },
);
// Start at a mainnet-like height.
const tall = useAnvil(
  anvilContainer(new AnvilOptions().mining.withBlockNumber(20_000_000)),
);

it("answers historical queries only without pruning", async () => {
  const [alice] = await pruned.addresses();
  await pruned.cheats.setBalanceEther(alice, 1).mine(3);
  await expect(
    pruned.testClient.getBalance({ address: alice, blockNumber: 1n }),
  ).rejects.toThrow(/block height/);
  expect(await pruned.getBalance(alice)).toBe(parseEther("1"));
});

it("starts at the configured block number", async () => {
  expect(await tall.testClient.getBlockNumber()).toBe(20_000_000n);
});
```
<!-- /snippet -->

### 15. Debugging and tracing

[test/e2e/debugging-and-tracing.e2e.test.ts](test/e2e/debugging-and-tracing.e2e.test.ts)

A node that records everything:

<!-- snippet: test/e2e/debugging-and-tracing.e2e.test.ts#tracing-node -->
```ts
const anvil = useAnvil(
  anvilContainer(
    new AnvilOptions().evm
      .withPrintTraces() // call traces in anvil's log output
      .withStepsTracing() // opcode-level debug_traceTransaction
      .logs.verboseLogs(LogVerbosity.Three)
      .withColor(Color.Never), // plain text, easy to search
  ).withTestClient((client) => client.withAccount(0)),
  {
    setup: async (node) => {
      const [, alice] = await node.addresses();
      token = await deployToken(node.testClient);
      vault = await deployVault(node.testClient, token, 0n);
      await mint(node.testClient, token, alice, parseEther("10"));
    },
  },
);
```
<!-- /snippet -->

Find the inner call that actually failed, step through opcodes, or trace a
call without sending it:

<!-- snippet: test/e2e/debugging-and-tracing.e2e.test.ts#call-tracer -->
```ts
const trace = await anvil.rpc<CallFrame>("debug_traceTransaction", [
  hash,
  { tracer: "callTracer" },
]);
expect(trace.to.toLowerCase()).toBe(vault.toLowerCase());
expect(trace.error).toBe("execution reverted");

// The revert originated one level down, in the token:
const [inner] = trace.calls!;
expect(inner.to.toLowerCase()).toBe(token.toLowerCase());
const cause = decodeErrorResult({
  abi: exampleToken.abi,
  data: inner.output!,
});
expect(cause.errorName).toBe("InsufficientAllowance");
expect(cause.args).toEqual([vault, 0n, 1n]); // spender, allowance, needed
```
<!-- /snippet -->

<!-- snippet: test/e2e/debugging-and-tracing.e2e.test.ts#struct-logs -->
```ts
const { structLogs } = await anvil.rpc<{
  structLogs: { op: string; depth: number }[];
}>("debug_traceTransaction", [hash, {}]);
expect(structLogs.length).toBeGreaterThan(100);
expect(structLogs.filter((step) => step.op === "REVERT")).toHaveLength(2); // token, then vault
```
<!-- /snippet -->

<!-- snippet: test/e2e/debugging-and-tracing.e2e.test.ts#trace-call -->
```ts
const trace = await anvil.rpc<CallFrame>("debug_traceCall", [
  {
    from: alice,
    to: token,
    data: encodeFunctionData({
      abi: exampleToken.abi,
      functionName: "transfer",
      args: [bob, 1n],
    }),
  },
  "latest",
  { tracer: "callTracer" },
]);
expect(trace.type).toBe("CALL");
expect(trace.error).toBeUndefined();
```
<!-- /snippet -->

Read anvil's own trace output, and silence it when it gets noisy:

<!-- snippet: test/e2e/debugging-and-tracing.e2e.test.ts#print-traces -->
```ts
const logs = await anvil.logText(200); // last 200 lines of anvil's output
const selector = "0x192b9e4e"; // InsufficientAllowance(address,uint256,uint256)
expect(logs).toContain(`[Revert] custom error ${selector}`);
```
<!-- /snippet -->

<!-- snippet: test/e2e/debugging-and-tracing.e2e.test.ts#logging -->
```ts
await anvil.setLoggingEnabled(false);
try {
  const hash = await anvil.testClient.sendTransaction({
    to: alice,
    value: 1n,
  });
  await anvil.confirm(hash);
  expect(await anvil.logText()).not.toContain(hash);
} finally {
  await anvil.setLoggingEnabled(true); // node setting: restore
}
```
<!-- /snippet -->

Any RPC method is one `rpc()` call away:

<!-- snippet: test/e2e/debugging-and-tracing.e2e.test.ts#raw-rpc -->
```ts
const { creator } = await anvil.rpc<{ hash: Hash; creator: Address }>(
  "ots_getContractCreator",
  [token],
);
expect(creator.toLowerCase()).toBe(deployer.toLowerCase());
```
<!-- /snippet -->

### 16. Catching misconfiguration in unit tests

[test/unit/configuration.test.ts](test/unit/configuration.test.ts)

No container needed: setters validate immediately…

<!-- snippet: test/unit/configuration.test.ts#conflicts -->
```ts
expect(() =>
  new AnvilOptions().mining.withNoMining().mining.withBlockTime(1),
).toThrow(AnvilConfigurationError);
```
<!-- /snippet -->

…`prepare()` checks the test client against the anvil options…

<!-- snippet: test/unit/configuration.test.ts#pre-start -->
```ts
const container = new AnvilContainer(
  new AnvilOptions().account.withAccounts(2),
).withTestClient((client) => client.withAccount(5));

expect(() => container.prepare()).toThrow(
  AnvilTestClientConfigurationError,
);
expect(() => container.prepare()).toThrow(
  /dev account 5 does not exist: anvil is configured with 2 account\(s\)/,
);
```
<!-- /snippet -->

…and test client presets can be shared between suites:

<!-- snippet: test/unit/configuration.test.ts#presets -->
```ts
const base = new TestClientOptions()
  .withPollingInterval(50)
  .withRetries(0) // fail fast on a local node
  .withChain({ name: "Local" });

const asDeployer = base.clone().withAccount(0);
const readOnly = asDeployer.clone().withoutAccount();
const mainnetFork = base.clone().withMulticall3(); // Multicall3 exists on forks of mainnet

expect(asDeployer.build().account).toEqual({
  kind: "index",
  index: 0,
  signing: "node",
});
expect(readOnly.build().account).toBeUndefined();
expect(mainnetFork.build().chain.contracts?.multicall3?.address).toBe(
  "0xcA11bde05977b3631167028862bE2a173976CA11",
);
expect(base.build().pollingInterval).toBe(50); // presets stay untouched
```
<!-- /snippet -->


## Contract artifacts

The examples run purely on contract artifacts — no Solidity sources, no
compiler. Each contract has a directory in [artifacts/](artifacts) with its
ABI (`<Name>.json`, a plain ABI array) and creation bytecode (`<Name>.bin`,
hex), the same layout as the library's own test artifacts; drop in the output
of Foundry, Hardhat or a block explorer the same way.

| Artifact | Used for |
|---|---|
| `ExampleToken` | ERC-20 with owner-only `mint` and custom errors (`NotOwner`, `InsufficientBalance`, `InsufficientAllowance`) |
| `TimeLockVault` | time-locked ERC-20 deposits (`StillLocked`, `NothingToWithdraw`) |
| `PriceConsumer` | reads `latestPrice()` from an oracle at a fixed address (`PriceUnavailable`) |
| `FixedPriceOracle` | test-double oracle: `latestPrice()` returns storage slot 0 |
| `OversizedContract` | creation code deploying 24,577 bytes (one over EIP-170), for code-size limits |

[src/artifacts.ts](src/artifacts.ts) loads them with the library's
`loadContractAbi()` / `loadContractBytecode()`.
[src/deploy.ts](src/deploy.ts) wraps deployments and reads in fixture helpers
(`deployToken`, `deployVault`, `mint`, `balanceOf`, `vaultLock`, …) that take
any client with a default account (`AnvilTestClient<Account>`). JSON ABIs are
typed as viem's generic `Abi`, so `readContract` returns `unknown`; the read
helpers narrow the result once (`balanceOf` → `bigint`, `vaultLock` →
`{ amount, unlockTime }`) so tests need no casts.

The unit suite checks that every artifact has both files, that each ABI
matches its bytecode (every function selector is dispatched) and that the
repository contains no Solidity sources.

## Behaviours worth knowing

Found while writing these examples, all covered by tests:

| Behaviour | Consequence |
|---|---|
| Writes signed **by anvil** (dev / impersonated accounts) are sent without client-side gas estimation and reverting transactions are mined | check the receipt (`anvil.confirm()` throws `AnvilTransactionRevertedError`) or `simulateContract` first |
| Writes signed **locally** are estimated first | a revert throws a decoded error before anything is sent |
| `--order fees` ranks pending transactions by fee cap (`maxFeePerGas`) | raise `maxFeePerGas`, not only the tip, to be mined first |
| Reverting a snapshot keeps pending transactions | `useAnvil` empties the pool between tests; do it yourself around `withSnapshot()` / `checkpoint()` |
| Snapshots do not restore node settings (automine, block time interval, impersonation, …) | restore them in `finally` / `afterEach` |
| Receipts carry `contractAddress` in lower case | normalise with `getAddress()` (as `deploy.ts` does) before comparing |
| `npm link` loads a second copy of viem for the library | match viem errors by `name`, not `instanceof` |
| After `setChainId()`, anvil's dev-account signer keeps the startup chain id | sign locally (or impersonate) after changing the chain id |
| A fork's hardfork follows the forked chain id's schedule at the fork block | pin `evm.withHardfork()` when forking a chain that reuses a public chain id |
| A bare `anvil_reset` detaches a forked node from its fork | use `reset()` (re-forks at the fork block) or `reset({ blockNumber })` |
| A transaction with a nonce gap waits in the *queued* pool | it is mined as soon as the missing nonce arrives |
| Mixed mining reports `getAutomine() === false` | transactions are still mined on arrival |
| JSON ABIs are typed as `Abi` | `readContract` returns `unknown`: narrow in helpers, or use `parseAbiItem` signatures for typed logs and filters |
| Every genesis `alloc` entry needs a `balance` | add `"balance": "0x0"` to contract entries |
| EIP-5792 `sendCalls`, `simulateCalls` asset tracing | not supported by anvil 1.6 |
| viem watchers subscribe asynchronously, with no "ready" signal | repeat the trigger until observed (`triggerUntil`), never sleep-and-hope |
| `watchBlocks` over WebSocket fetches each announced block separately | blocks may be reported out of order: compare sets, not sequences |

## Project layout and scripts

```
examples/
├── artifacts/<Name>/       contract ABI (.json) and creation bytecode (.bin)
├── scripts/
│   ├── link-library.mjs       npm link to the checkout (local prefix, idempotent)
│   ├── sync-readme.mjs        README samples ← #region blocks (--check)
│   ├── e2e.mjs                e2e launcher (--no-docker)
│   └── anvil-binary.cjs       local anvil lookup for --no-docker
├── src/                     reusable example code (artifacts, fixtures, revert and watcher helpers)
└── test/
    ├── e2e/                 the workflows, one file each
    ├── unit/                link guards, artifacts, API coverage, helpers, configuration, README sync
    └── support/             anvilContainer(), startNetwork(): Docker or local runtime
```

| Script | Description |
|---|---|
| `npm run link:library` | link the library checkout (run after installs) |
| `npm run typecheck` | `tsc` with `nodenext` resolution (the package's real `exports`) |
| `npm run lint` / `lint:fix` | ESLint + Prettier |
| `npm test` | unit tests (no Docker, no anvil) |
| `npm run test:e2e [-- --no-docker]` | workflows against anvil |
| `npm run docs:sync [-- --check]` | regenerate / verify the README samples |
| `npm run check` | everything above, e2e in Docker |
