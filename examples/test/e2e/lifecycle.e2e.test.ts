/**
 * Workflow: controlling the node's lifecycle yourself — manual start/stop,
 * explicit test hooks, custom start logic, startup timeouts and what the
 * clients do once the node is stopped.
 */
import {
  AnvilContainer,
  AnvilOptions,
  AnvilTestClientError,
  type StartedAnvilContainer,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import { parseEther } from "viem";

describe("manual start and stop", () => {
  // #region manual-lifecycle
  let anvil: StartedAnvilContainer;

  beforeAll(async () => {
    anvil = await new AnvilContainer(new AnvilOptions().logs.quiet())
      .withStartupTimeout(120_000) // first run: image pull
      .start();
  }, 120_000);

  afterAll(async () => {
    await anvil?.stop();
  });

  it("uses the started node", async () => {
    expect(await anvil.testClient.getBlockNumber()).toBe(0n);
  });
  // #endregion manual-lifecycle
});

describe("explicit hooks and custom start logic", () => {
  // #region explicit-hooks
  // Pass the hooks yourself when your runner has no Jest-style globals.
  const anvil = useAnvil(new AnvilContainer(), {
    hooks: { beforeAll, afterAll, afterEach },
    timeout: 120_000, // start/stop hook timeout
  });
  // #endregion explicit-hooks

  // #region start-function
  // Any async start logic: the handle works the same way.
  const funded = useAnvil({
    start: async () => {
      const node = await new AnvilContainer().start();
      const [first] = await node.addresses();
      await node.setBalanceEther(first, 1);
      return node;
    },
  });
  // #endregion start-function

  it("starts both nodes before the tests", async () => {
    expect(await anvil.testClient.getChainId()).toBe(31337);
    const [first] = await funded.addresses();
    expect(await funded.getBalance(first)).toBe(parseEther("1"));
  });
});

describe("after stop()", () => {
  it("rejects requests instead of hanging", async () => {
    // #region after-stop
    const anvil = await new AnvilContainer().start();
    const client = anvil.testClient;
    await anvil.stop();

    expect(anvil.isStopped).toBe(true);
    const error = await client.getBlockNumber().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnvilTestClientError);
    expect((error as AnvilTestClientError).code).toBe("CONTAINER_STOPPED");
    // #endregion after-stop
  });
});
