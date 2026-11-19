/**
 * Workflow: scripting state changes with `anvil.cheats` — inspecting a
 * chain before it runs, running it explicitly, and reading step failures.
 */
import {
  AnvilContainer,
  AnvilTestClientError,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import { parseEther, parseGwei } from "viem";

const anvil = useAnvil(new AnvilContainer());
const ALICE = "0x2222222222222222222222222222222222222222";

describe("cheats", () => {
  it("lists the queued steps and runs them on demand", async () => {
    // #region cheat-plan
    const chain = anvil.cheats.setBalanceEther(ALICE, 1.5).mine(2);
    expect(chain.plan).toEqual([`setBalanceEther(${ALICE}, 1.5)`, "mine(2)"]);

    await chain.run(); // same as `await chain`; a chain runs once
    expect(await anvil.getBalance(ALICE)).toBe(parseEther("1.5"));
    // #endregion cheat-plan
  });

  it("names the failing step and skips the rest", async () => {
    const before = await anvil.testClient.getBlockNumber();
    // #region cheat-errors
    const error = await anvil.cheats
      .mine()
      .setMinGasPrice(parseGwei("1")) // rejected while EIP-1559 is active
      .mine()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AnvilTestClientError);
    expect((error as AnvilTestClientError).code).toBe("CHEAT_FAILED");
    expect((error as Error).message).toMatch(
      /step 2\/3 setMinGasPrice\(1000000000n\) failed: .*\(steps 1–1 were applied\)/,
    );
    // #endregion cheat-errors
    expect(await anvil.testClient.getBlockNumber()).toBe(before + 1n);
  });

  it("cannot be extended after it ran", async () => {
    // #region cheat-once
    const chain = anvil.cheats.mine();
    await chain.finally(() => undefined); // then / catch / finally run it too
    expect(() => chain.mine()).toThrow(
      /cheats chain that has already run; start a new chain/, // CHEATS_ALREADY_RUN
    );
    // #endregion cheat-once
  });
});
