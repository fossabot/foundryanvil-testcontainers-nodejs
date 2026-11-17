/**
 * Workflow: build an expensive fixture once, save the chain state to a file,
 * and boot other nodes (or test files) directly from it.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  AnvilOptions,
  StartedAnvilContainer,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import {
  type Address,
  type Hex,
  numberToHex,
  parseEther,
  parseUnits,
} from "viem";
import {
  balanceOf,
  deployFixedPriceOracle,
  deployToken,
  fixedPriceOracle,
  mint,
} from "../../src";
import { anvilContainer } from "../support/runtime";

let directory: string;
let fixtureFile: string;
let token: Address;
let holders: Address[];
let oracleCode: Hex;

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "anvil-fixture-"));
  fixtureFile = path.join(directory, "fixture.json");
  // #region build-fixture
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
  // #endregion build-fixture
  expect(builder.isStopped).toBe(true); // its clients now reject requests
}, 120_000);

afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

describe("state fixtures", () => {
  it("boots a new node straight from the fixture file", async () => {
    // #region boot-from-fixture
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
    // #endregion boot-from-fixture
  });

  it("loads the fixture into a running node", async () => {
    let anvil: StartedAnvilContainer | undefined;
    try {
      anvil = await anvilContainer().start();
      expect(
        await anvil.testClient.getCode({ address: token }),
      ).toBeUndefined();
      // #region load-at-runtime
      await anvil.loadStateFromFile(fixtureFile);
      // #endregion load-at-runtime
      expect(await balanceOf(anvil.testClient, token, holders[0])).toBe(
        parseEther("1000"),
      );
    } finally {
      await anvil?.stop();
    }
  });

  it("snapshots state in memory with dumpState / loadState", async () => {
    const anvil = await anvilContainer().start();
    try {
      const [alice] = await anvil.addresses();
      // #region dump-in-memory
      await anvil.setBalanceEther(alice, 42);
      const state = await anvil.dumpState(); // hex blob, e.g. to cache between suites

      await anvil.reset(); // back to genesis: the balance is gone…
      expect(await anvil.getBalance(alice)).toBe(parseEther("10000"));

      await anvil.loadState(state); // …and restored
      expect(await anvil.getBalance(alice)).toBe(parseEther("42"));
      // #endregion dump-in-memory
    } finally {
      await anvil.stop();
    }
  });

  it("boots from a custom genesis with pre-deployed contracts", async () => {
    // #region genesis
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
    // #endregion genesis
  });
});
