import {
  AnvilConfigurationError,
  AnvilOptions,
  FORK_FLAGS,
  ForkingOptions,
} from "../../../src";

const URL = "https://mainnet.example.com/v3/key";
const HASH = `0x${"ab".repeat(32)}` as const;

describe("ForkingOptions", () => {
  let options: AnvilOptions;

  beforeEach(() => {
    options = new AnvilOptions();
  });

  it("is reachable from any view", () => {
    expect(options.fork).toBeInstanceOf(ForkingOptions);
    expect(options.fork.withForkUrl(URL)).toBeInstanceOf(ForkingOptions);
  });

  describe("withForkUrl", () => {
    it("accepts http(s), ws(s), localhost shorthand and ipc paths", () => {
      for (const url of [
        "http://host.docker.internal:8545",
        "https://a.b/c?d=e",
        "ws://x:1",
        "wss://x",
        "localhost:8545",
        "localhost:8545/rpc",
        "/tmp/reth.ipc",
      ]) {
        expect(() => options.fork.withForkUrl(url)).not.toThrow();
        expect(options.get("--fork-url")).toBe(url);
      }
    });

    it("rejects empty, malformed and unsupported URLs", () => {
      expect(() => options.fork.withForkUrl("")).toThrow(/non-empty string/);
      expect(() => options.fork.withForkUrl("not a url")).toThrow(
        /expected an http\(s\)\/ws\(s\) URL/,
      );
      expect(() => options.fork.withForkUrl("ftp://x")).toThrow(
        /unsupported fork URL scheme/,
      );
      expect(() => options.fork.withForkUrl(12 as unknown as string)).toThrow(
        AnvilConfigurationError,
      );
    });

    it("normalises anvil's url@block shorthand into --fork-block-number", () => {
      options.fork.withForkUrl(`${URL}@18000000`);
      expect(options.get("--fork-url")).toBe(URL);
      expect(options.get("--fork-block-number")).toBe("18000000");
      options.fork.withForkUrl(`${URL}@-5`);
      expect(options.get("--fork-block-number")).toBe("-5");
    });

    it("accepts a block number argument", () => {
      options.fork.withForkUrl(URL, 1n);
      expect(options.get("--fork-block-number")).toBe("1");
    });

    it("keeps user-info in URLs", () => {
      options.fork.withForkUrl("https://user:pass@host/path");
      expect(options.get("--fork-url")).toBe("https://user:pass@host/path");
      expect(options.has("--fork-block-number")).toBe(false);
    });
  });

  describe("withForkBlockNumber", () => {
    it("accepts negative (relative) numbers and renders them safely", () => {
      options.fork.withForkUrl(URL).withForkBlockNumber(-100);
      expect(options.toArgs()).toContain("--fork-block-number=-100");
      options.fork.withForkBlockNumber(5);
      expect(options.toArgs()).toEqual(
        expect.arrayContaining(["--fork-block-number", "5"]),
      );
      expect(options.toArgs()).not.toContain("-100");
    });

    it("rejects non-integers", () => {
      expect(() => options.fork.withForkBlockNumber(1.5)).toThrow(
        AnvilConfigurationError,
      );
    });

    it("conflicts with withForkTransactionHash", () => {
      options.fork.withForkUrl(URL).withForkBlockNumber(1);
      expect(() => options.fork.withForkTransactionHash(HASH)).toThrow(
        /cannot be combined/,
      );
    });
  });

  describe("withForkTransactionHash", () => {
    it("validates the hash", () => {
      options.fork.withForkUrl(URL).withForkTransactionHash(HASH);
      expect(options.get("--fork-transaction-hash")).toBe(HASH);
      expect(() =>
        options.fork.withForkTransactionHash("0x12" as `0x${string}`),
      ).toThrow(/32-byte hex transaction hash/);
      expect(() => options.fork.withForkBlockNumber(1)).toThrow(
        /cannot be combined/,
      );
    });
  });

  describe("headers", () => {
    it("withForkHeader accumulates, withForkHeaders replaces", () => {
      options.fork
        .withForkUrl(URL)
        .withForkHeader("A: 1")
        .withForkHeader("B: 2");
      expect(options.get("--fork-header")).toEqual(["A: 1", "B: 2"]);
      options.fork.withForkHeaders("C: 3");
      expect(options.get("--fork-header")).toEqual(["C: 3"]);
      options.fork.withForkHeaders();
      expect(options.has("--fork-header")).toBe(false);
    });

    it("rejects malformed headers", () => {
      expect(() => options.fork.withForkHeader("nocolon")).toThrow(
        /Name: value/,
      );
      expect(() => options.fork.withForkHeader(": x")).toThrow(/Name: value/);
      expect(() => options.fork.withForkHeader("A: 1\r\nB: 2")).toThrow(
        /Name: value/,
      );
      expect(() => options.fork.withForkHeaders("A: 1", "bad")).toThrow(
        /Name: value/,
      );
    });

    it("renders one --fork-header per value", () => {
      options.fork.withForkUrl(URL).withForkHeaders("A: 1", "B: 2");
      const args = options.toArgs();
      expect(args.filter((arg) => arg === "--fork-header")).toHaveLength(2);
    });
  });

  describe("numeric setters", () => {
    it.each([
      ["withForkChainId", "--fork-chain-id", 1, "1"],
      ["withForkRetryBackoff", "--fork-retry-backoff", 1000, "1000"],
      ["withRetries", "--retries", 3, "3"],
      ["withTimeout", "--timeout", 60_000, "60000"],
      ["withComputeUnitsPerSecond", "--compute-units-per-second", 500, "500"],
    ] as const)("%s sets %s", (method, flag, value, rendered) => {
      options.fork.withForkUrl(URL, 1);
      (options.fork[method] as (v: number) => unknown)(value);
      expect(options.get(flag)).toBe(rendered);
      expect(options.problems()).toEqual([]);
    });

    it("rejects out-of-range values", () => {
      expect(() => options.fork.withForkChainId(0)).toThrow(
        AnvilConfigurationError,
      );
      expect(() => options.fork.withTimeout(0)).toThrow(
        AnvilConfigurationError,
      );
      expect(() => options.fork.withComputeUnitsPerSecond(0)).toThrow(
        AnvilConfigurationError,
      );
      expect(() => options.fork.withRetries(2n ** 32n)).toThrow(
        AnvilConfigurationError,
      );
      expect(() => options.fork.withRetries(-1)).toThrow(
        AnvilConfigurationError,
      );
    });
  });

  describe("boolean switches", () => {
    it("noRateLimit / noStorageCaching", () => {
      options.fork.withForkUrl(URL).noRateLimit().noStorageCaching();
      expect(options.has("--no-rate-limit")).toBe(true);
      expect(options.has("--no-storage-caching")).toBe(true);
      options.fork.noRateLimit(false).noStorageCaching(false);
      expect(options.has("--no-rate-limit")).toBe(false);
      expect(options.has("--no-storage-caching")).toBe(false);
    });
  });

  describe("dependencies", () => {
    it.each(FORK_FLAGS.filter((flag) => flag !== "--fork-url"))(
      "%s requires --fork-url regardless of call order",
      (flag) => {
        const setter: Record<string, () => unknown> = {
          "--fork-block-number": () => options.fork.withForkBlockNumber(1),
          "--fork-transaction-hash": () =>
            options.fork.withForkTransactionHash(HASH),
          "--fork-chain-id": () => options.fork.withForkChainId(1),
          "--fork-header": () => options.fork.withForkHeader("A: 1"),
          "--fork-retry-backoff": () => options.fork.withForkRetryBackoff(1),
          "--retries": () => options.fork.withRetries(1),
          "--timeout": () => options.fork.withTimeout(1),
          "--compute-units-per-second": () =>
            options.fork.withComputeUnitsPerSecond(1),
          "--no-rate-limit": () => options.fork.noRateLimit(),
          "--no-storage-caching": () => options.fork.noStorageCaching(),
        };
        setter[flag]();
        expect(
          new Set(options.problems().map((problem) => problem.flag)),
        ).toEqual(new Set([flag]));
        expect(() => options.build()).toThrow(/requires --fork-url/);
        options.fork.withForkUrl(URL);
        if (flag === "--fork-chain-id") {
          // Offline-start mode also needs a fork origin.
          expect(() => options.build()).toThrow(
            /requires one of --fork-block-number, --fork-transaction-hash/,
          );
          options.fork.withForkBlockNumber(1);
        }
        expect(options.problems()).toEqual([]);
        expect(options.build().forking).toBe(true);
      },
    );
  });

  it("reset turns forking off", () => {
    options.fork
      .withForkUrl(URL)
      .withRetries(1)
      .noRateLimit()
      .evm.withChainId(1);
    options.fork.reset();
    for (const flag of FORK_FLAGS) expect(options.has(flag)).toBe(false);
    expect(options.has("--chain-id")).toBe(true);
    expect(options.build().forking).toBe(false);
  });
});
