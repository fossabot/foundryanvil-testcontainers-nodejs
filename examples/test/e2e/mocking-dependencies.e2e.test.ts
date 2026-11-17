/**
 * Workflow: replacing an external dependency (here a price oracle at a fixed,
 * "mainnet" address) with a test double by writing code and storage directly.
 */
import { useAnvil } from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import {
  type Address,
  encodeAbiParameters,
  type Hex,
  keccak256,
  numberToHex,
  parseEther,
  parseUnits,
} from "viem";
import {
  balanceOf,
  deployFixedPriceOracle,
  deployPriceConsumer,
  deployToken,
  expectRevert,
  mint,
  priceConsumer,
  quote,
} from "../../src";
import { anvilContainer } from "../support/runtime";

/** Where the real oracle lives on mainnet; empty on a fresh local chain. */
const ORACLE: Address = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";

let consumer: Address;
let oracleCode: Hex;
let token: Address;

const anvil = useAnvil(
  anvilContainer().withTestClient((client) => client.withAccount(0)),
  {
    setup: async (node) => {
      consumer = await deployPriceConsumer(node.testClient, ORACLE);
      token = await deployToken(node.testClient);
      // #region runtime-code
      // setCode needs *runtime* code: deploy the test double once from its
      // creation bytecode (.bin) and read the code the constructor left behind.
      const template = await deployFixedPriceOracle(node.testClient);
      oracleCode = (await node.testClient.getCode({ address: template }))!;
      // #endregion runtime-code
    },
  },
);

describe("mocking dependencies with setCode / setStorageAt", () => {
  it("fails while nothing is deployed at the oracle address", async () => {
    expect(await anvil.testClient.getCode({ address: ORACLE })).toBeUndefined();
    await expect(
      quote(anvil.testClient, consumer, parseEther("1")),
    ).rejects.toThrow();
  });

  it("etches a fake oracle and sets its price", async () => {
    // #region etch
    await anvil.cheats
      .setCode(ORACLE, oracleCode)
      .setStorageAt(ORACLE, 0, parseUnits("3000", 8)); // slot 0: `price`

    expect(await quote(anvil.testClient, consumer, parseEther("2"))).toBe(
      parseUnits("6000", 8),
    );
    // #endregion etch
  });

  it("moves the price mid-test", async () => {
    await anvil.cheats
      .setCode(ORACLE, oracleCode)
      .setStorageAt(ORACLE, 0, parseUnits("3000", 8));
    expect(await quote(anvil.testClient, consumer, parseEther("1"))).toBe(
      parseUnits("3000", 8),
    );

    await anvil.cheats.setStorageAt(ORACLE, 0, parseUnits("1500", 8)); // crash!
    expect(await quote(anvil.testClient, consumer, parseEther("1"))).toBe(
      parseUnits("1500", 8),
    );
  });

  it("exercises the consumer's error path with a zero price", async () => {
    await anvil.cheats.setCode(ORACLE, oracleCode);
    await expectRevert(
      anvil.testClient.simulateContract({
        address: consumer,
        abi: priceConsumer.abi,
        functionName: "quote",
        args: [1n],
      }),
      "PriceUnavailable",
    );
  });

  it("mocks a dependency for one call only, with state overrides", async () => {
    // #region state-override
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
    // #endregion state-override
  });

  it("writes a mapping entry by computing its storage slot", async () => {
    const [, alice] = await anvil.addresses();
    await mint(anvil.testClient, token, alice, 1n);
    // #region mapping-slot
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
    // #endregion mapping-slot
  });

  it('removes code again with setCode(address, "0x")', async () => {
    await anvil.cheats.setCode(ORACLE, oracleCode).setStorageAt(ORACLE, 0, 1n);
    expect(await quote(anvil.testClient, consumer, parseEther("1"))).toBe(1n);

    await anvil.cheats.setCode(ORACLE, "0x");
    expect(await anvil.testClient.getCode({ address: ORACLE })).toBeUndefined();
    await expect(
      quote(anvil.testClient, consumer, parseEther("1")),
    ).rejects.toThrow();
  });
});
