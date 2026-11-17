import { privateKeyToAccount } from "viem/accounts";
import {
  AnvilConfigurationError,
  AnvilOptions,
  AnvilTestClientConfigurationError,
  DEFAULT_POLLING_INTERVAL_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_DELAY_MS,
  MULTICALL3_ADDRESS,
  TestClientOptions,
} from "../../../src";

const KEY_0 =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEV_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const STRANGER = "0x1111111111111111111111111111111111111111";

describe("TestClientOptions", () => {
  it("has defaults tuned for a local node", () => {
    expect(new TestClientOptions().build()).toEqual({
      transport: "http",
      pollingInterval: DEFAULT_POLLING_INTERVAL_MS,
      cacheTime: 0,
      timeout: DEFAULT_REQUEST_TIMEOUT_MS,
      retryCount: DEFAULT_RETRY_COUNT,
      retryDelay: DEFAULT_RETRY_DELAY_MS,
      batch: false,
      chain: {},
    });
  });

  it("applies every setting fluently and freezes the result", () => {
    const configuration = new TestClientOptions()
      .withTransport("webSocket")
      .withPollingInterval(50)
      .withCacheTime(1_000)
      .withTimeout(2_000)
      .withRetries(0, 10)
      .withChain({ name: "Local", testnet: true })
      .withMulticall3(undefined, 5)
      .withChain({ contracts: { ensRegistry: { address: STRANGER } } })
      .withAccount(2)
      .build();
    expect(configuration).toMatchObject({
      transport: "webSocket",
      pollingInterval: 50,
      cacheTime: 1_000,
      timeout: 2_000,
      retryCount: 0,
      retryDelay: 10,
      account: { kind: "index", index: 2, signing: "node" },
      chain: {
        name: "Local",
        testnet: true,
        contracts: {
          multicall3: { address: MULTICALL3_ADDRESS, blockCreated: 5 },
          ensRegistry: { address: STRANGER },
        },
      },
    });
    expect(Object.isFrozen(configuration)).toBe(true);
    expect(Object.isFrozen(configuration.chain)).toBe(true);
    expect(new TestClientOptions().withRetries(5).build().retryDelay).toBe(
      DEFAULT_RETRY_DELAY_MS,
    );
  });

  it("configures batching", () => {
    expect(new TestClientOptions().withBatch().build().batch).toEqual({});
    expect(new TestClientOptions().withBatch(false).build().batch).toBe(false);
    const batch = new TestClientOptions()
      .withBatch({ batchSize: 10, wait: 5 })
      .build().batch;
    expect(batch).toEqual({ batchSize: 10, wait: 5 });
    expect(Object.isFrozen(batch)).toBe(true);
  });

  it("configures default accounts", () => {
    const local = privateKeyToAccount(KEY_0);
    expect(new TestClientOptions().withAccount(DEV_0).build().account).toEqual({
      kind: "address",
      address: DEV_0,
      impersonate: false,
    });
    expect(
      new TestClientOptions()
        .withAccount(STRANGER, { impersonate: true })
        .build().account,
    ).toEqual({ kind: "address", address: STRANGER, impersonate: true });
    expect(new TestClientOptions().withLocalAccount(1).build().account).toEqual(
      { kind: "index", index: 1, signing: "local" },
    );
    const fromKey = new TestClientOptions().withLocalAccount(KEY_0).build()
      .account as { kind: string; account: { address: string } };
    expect(fromKey.kind).toBe("local");
    expect(fromKey.account.address).toBe(DEV_0);
    expect(
      new TestClientOptions().withLocalAccount(local).build().account,
    ).toEqual({ kind: "local", account: local });
    expect(
      new TestClientOptions().withAccount(0).withoutAccount().build().account,
    ).toBeUndefined();
  });

  it("rejects invalid values immediately, naming the setting", () => {
    const options = new TestClientOptions();
    const cases: Array<[() => unknown, RegExp]> = [
      [
        () => options.withTransport("ipc" as never),
        /withTransport\(\): expected "http" or "webSocket", received "ipc"/,
      ],
      [
        () => options.withPollingInterval(0),
        /withPollingInterval\(\): the polling interval must be an integer ≥ 1, received 0/,
      ],
      [() => options.withPollingInterval(1.5), /received 1\.5/],
      [() => options.withCacheTime(-1), /withCacheTime\(\)/],
      [() => options.withTimeout(0), /withTimeout\(\)/],
      [() => options.withRetries(-1), /the retry count/],
      [() => options.withRetries(1, -1), /the retry delay/],
      [
        () => options.withBatch("yes" as never),
        /withBatch\(\): expected a boolean/,
      ],
      [() => options.withBatch(null as never), /withBatch\(\)/],
      [() => options.withBatch({ batchSize: 0 }), /batchSize/],
      [() => options.withBatch({ wait: -1 }), /wait/],
      [() => options.withAccount(-1), /withAccount\(\): the dev account index/],
      [() => options.withAccount("0x12"), /a 20-byte address, received "0x12"/],
      [() => options.withAccount(1n as never), /received 1n/],
      [() => options.withLocalAccount(-2), /withLocalAccount\(\)/],
      [
        () => options.withLocalAccount("0x1234"),
        /32-byte private key, received a 6-character string/,
      ],
      [
        () => options.withLocalAccount({ address: DEV_0 } as never),
        /a viem LocalAccount/,
      ],
      [
        () => options.withLocalAccount(null as never),
        /a viem LocalAccount, received null/,
      ],
      [
        () => options.withChain(null as never),
        /withChain\(\): expected an object/,
      ],
      [
        () => options.withChain({ id: 1 } as never),
        /"id" is derived from the running node.*evm\.withChainId\(\)/,
      ],
      [
        () => options.withChain({ rpcUrls: {} } as never),
        /"rpcUrls" is derived from the running node and cannot be overridden$/,
      ],
      [
        () => options.withChain({ name: " " }),
        /name must be a non-empty string/,
      ],
      [
        () => options.withMulticall3("0x1"),
        /withMulticall3\(\): expected a 20-byte address/,
      ],
      [() => options.withMulticall3(undefined, -1), /blockCreated/],
    ];
    for (const [run, message] of cases) {
      let error: unknown;
      try {
        run();
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(AnvilTestClientConfigurationError);
      expect(error).toBeInstanceOf(AnvilConfigurationError);
      expect((error as Error).message).toMatch(message);
    }
    // Nothing invalid was applied.
    expect(options.build()).toEqual(new TestClientOptions().build());
  });

  it("clone() is independent", () => {
    const original = new TestClientOptions().withChain({ name: "A" });
    const copy = original.clone().withChain({ name: "B" }).withTimeout(5);
    expect(original.build().chain.name).toBe("A");
    expect(original.build().timeout).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
    expect(copy.build()).toMatchObject({ timeout: 5, chain: { name: "B" } });
  });

  describe("pre-start validation against the anvil options", () => {
    const build =
      (client: TestClientOptions<never>, options: AnvilOptions) => () =>
        client.build(options.build());

    function error(run: () => unknown): AnvilTestClientConfigurationError {
      try {
        run();
      } catch (e) {
        return e as AnvilTestClientConfigurationError;
      }
      throw new Error("expected an error");
    }

    it("rejects batching with the WebSocket transport", () => {
      expect(() =>
        new TestClientOptions().withTransport("webSocket").withBatch().build(),
      ).toThrow(/batching is only supported by the "http" transport/);
    });

    it("checks dev account indexes against --accounts", () => {
      const e = error(
        build(
          new TestClientOptions().withAccount(5) as never,
          new AnvilOptions().account.withAccounts(5),
        ),
      );
      expect(e.setting).toBe("withAccount");
      expect(e.flag).toBe("--accounts");
      expect(e.message).toMatch(
        /dev account 5 does not exist: anvil is configured with 5 account\(s\).*index from 0 to 4/,
      );
      expect(() =>
        new TestClientOptions()
          .withAccount(4)
          .build(new AnvilOptions().account.withAccounts(5).build()),
      ).not.toThrow();
    });

    it("needs a readable key for local signing with generated mnemonics", () => {
      const random = error(
        build(
          new TestClientOptions().withLocalAccount(0) as never,
          new AnvilOptions().account.withRandomMnemonic().logs.quiet(),
        ),
      );
      expect(random.setting).toBe("withLocalAccount");
      expect(random.relatedFlags).toEqual(["--quiet", "--mnemonic-random"]);
      expect(random.message).toMatch(/withAccount\(0\) to let anvil sign/);

      const seeded = error(
        build(
          new TestClientOptions().withLocalAccount(0) as never,
          new AnvilOptions().account.withMnemonicSeedUnsafe(1).logs.quiet(),
        ),
      );
      expect(seeded.relatedFlags).toEqual([
        "--quiet",
        "--mnemonic-seed-unsafe",
      ]);

      // Keys are derivable or readable from the banner: fine.
      for (const options of [
        new AnvilOptions().logs.quiet(),
        new AnvilOptions().account.withRandomMnemonic(),
      ]) {
        expect(() =>
          new TestClientOptions().withLocalAccount(0).build(options.build()),
        ).not.toThrow();
      }
      expect(() =>
        new TestClientOptions()
          .withAccount(0)
          .build(
            new AnvilOptions().account
              .withRandomMnemonic()
              .logs.quiet()
              .build(),
          ),
      ).not.toThrow();
    });

    it("requires impersonation for addresses anvil cannot sign for", () => {
      const e = error(
        build(
          new TestClientOptions().withAccount(STRANGER) as never,
          new AnvilOptions(),
        ),
      );
      expect(e.message).toMatch(
        /anvil cannot sign for 0x1111.*not one of the 10 dev accounts.*impersonate: true.*autoImpersonate/,
      );
      const ok: Array<[TestClientOptions<never>, AnvilOptions]> = [
        [
          new TestClientOptions().withAccount(DEV_0) as never,
          new AnvilOptions(),
        ],
        [
          new TestClientOptions().withAccount(
            DEV_0.toLowerCase() as never,
          ) as never,
          new AnvilOptions(),
        ],
        [
          new TestClientOptions().withAccount(STRANGER, {
            impersonate: true,
          }) as never,
          new AnvilOptions(),
        ],
        [
          new TestClientOptions().withAccount(STRANGER) as never,
          new AnvilOptions().account.autoImpersonate(),
        ],
        // Unknown mnemonic: cannot be checked statically.
        [
          new TestClientOptions().withAccount(STRANGER) as never,
          new AnvilOptions().account.withRandomMnemonic(),
        ],
        [
          new TestClientOptions().withLocalAccount(KEY_0) as never,
          new AnvilOptions().account.withAccounts(0),
        ],
      ];
      for (const [client, options] of ok) {
        expect(build(client, options)).not.toThrow();
      }
    });
  });
});
