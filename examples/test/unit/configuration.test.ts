/**
 * Misconfiguration is caught in plain unit tests: option setters validate
 * immediately, and `prepare()` checks anvil and test-client options together
 * without starting anything.
 */
import {
  AnvilConfigurationError,
  AnvilContainer,
  AnvilOptions,
  AnvilTestClientConfigurationError,
  TestClientOptions,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";

describe("configuration checks without Docker", () => {
  it("rejects conflicting anvil flags as soon as they are set", () => {
    // #region conflicts
    expect(() =>
      new AnvilOptions().mining.withNoMining().mining.withBlockTime(1),
    ).toThrow(AnvilConfigurationError);
    // #endregion conflicts
  });

  it("validates the test client against the anvil options before start", () => {
    // #region pre-start
    const container = new AnvilContainer(
      new AnvilOptions().account.withAccounts(2),
    ).withTestClient((client) => client.withAccount(5));

    expect(() => container.prepare()).toThrow(
      AnvilTestClientConfigurationError,
    );
    expect(() => container.prepare()).toThrow(
      /dev account 5 does not exist: anvil is configured with 2 account\(s\)/,
    );
    // #endregion pre-start
  });

  it("catches local signing without a readable key", () => {
    const container = new AnvilContainer(
      new AnvilOptions().account.withRandomMnemonic().logs.quiet(),
    ).withTestClient(new TestClientOptions().withLocalAccount(0));
    expect(() => container.prepare()).toThrow(
      /--quiet hides anvil's key banner/,
    );
  });

  it("renders the exact command line for reviews and debugging", () => {
    const options = new AnvilOptions().evm
      .withChainId(8453)
      .mining.withBlockTime(2);
    expect(options.toCommand()).toBe(
      "anvil --host 0.0.0.0 --block-time 2 --chain-id 8453",
    );
  });

  it("shares test client presets between suites", () => {
    // #region presets
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
    // #endregion presets
  });

  it("tunes the client's transport", () => {
    // #region client-options
    const client = new TestClientOptions()
      .withTransport("webSocket") // eth_subscribe-based watchers
      .withTimeout(5_000) // per request (default 10 000 ms)
      .withRetries(0, 50) // count, base delay in ms (default 3, 150)
      .withCacheTime(1_000) // reuse e.g. the block number for 1 s (default 0)
      .withPollingInterval(10) // watchers and receipt waits (default 25 ms)
      .withLocalAccount(0); // dev account 0, signed locally

    expect(client.build()).toMatchObject({
      transport: "webSocket",
      timeout: 5_000,
      retryCount: 0,
      retryDelay: 50,
      account: { kind: "index", index: 0, signing: "local" },
    });
    // JSON-RPC batching needs HTTP:
    expect(() => client.clone().withBatch().build()).toThrow(
      AnvilTestClientConfigurationError,
    );
    // #endregion client-options
  });

  it("exposes its options and the prepared command without Docker", () => {
    // #region container-getters
    const options = new AnvilOptions().mining.withBlockTime(2);
    const container = new AnvilContainer(options).withTestClient((client) =>
      client.withAccount(0),
    );

    expect(container.anvilOptions).toBe(options);
    expect(container.testClientOptions.build().account?.kind).toBe("index");
    expect(container.prepare().command.join(" ")).toBe(
      "anvil --host 0.0.0.0 --block-time 2",
    );
    // #endregion container-getters
  });
});
