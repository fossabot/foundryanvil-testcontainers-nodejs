import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  AnvilConfigurationError,
  AnvilOptions,
  CONTAINER_FILE_PATHS,
  Order,
  STATE_FLAGS,
  StateOptions,
  containerPath,
} from "../../../src";

describe("StateOptions", () => {
  let options: AnvilOptions;
  let tmp: string;

  beforeEach(() => {
    options = new AnvilOptions();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "anvil-state-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("is reachable from any view", () => {
    expect(options.state).toBeInstanceOf(StateOptions);
    expect(options.mining.state.withOrder(Order.Fees)).toBeInstanceOf(
      StateOptions,
    );
  });

  describe("host paths are transparently transferred", () => {
    it("withLoadState copies the host file into the container", () => {
      const host = path.join(tmp, "state.json");
      options.state.withLoadState(host);
      expect(options.get("--load-state")).toBe(
        CONTAINER_FILE_PATHS["--load-state"],
      );
      const built = options.build();
      expect(built.fileImports).toEqual([
        {
          flag: "--load-state",
          hostPath: host,
          containerPath: CONTAINER_FILE_PATHS["--load-state"],
          required: true,
        },
      ]);
      expect(built.fileExports).toEqual([]);
    });

    it("withInit copies the genesis file into the container", () => {
      options.state.withInit("fixtures/genesis.json");
      const built = options.build();
      expect(built.fileImports[0]).toMatchObject({
        flag: "--init",
        hostPath: path.resolve("fixtures/genesis.json"),
        containerPath: CONTAINER_FILE_PATHS["--init"],
        required: true,
      });
    });

    it("withDumpState exports the file when the container stops", () => {
      const host = path.join(tmp, "dump.json");
      options.state.withDumpState(host);
      const built = options.build();
      expect(built.fileImports).toEqual([]);
      expect(built.fileExports).toEqual([
        {
          flag: "--dump-state",
          hostPath: host,
          containerPath: CONTAINER_FILE_PATHS["--dump-state"],
          when: "stop",
        },
      ]);
    });

    it("withDumpState expands an existing directory to <dir>/state.json", () => {
      options.state.withDumpState(tmp);
      expect(options.build().fileExports[0].hostPath).toBe(
        path.join(tmp, "state.json"),
      );
    });

    it("withState imports (optionally) and exports on stop", () => {
      const host = path.join(tmp, "state.json");
      options.state.withState(host);
      const built = options.build();
      expect(built.fileImports).toEqual([
        {
          flag: "--state",
          hostPath: host,
          containerPath: CONTAINER_FILE_PATHS["--state"],
          required: false,
        },
      ]);
      expect(built.fileExports).toEqual([
        {
          flag: "--state",
          hostPath: host,
          containerPath: CONTAINER_FILE_PATHS["--state"],
          when: "stop",
        },
      ]);
    });

    it("withConfigOut exports the file right after start", () => {
      options.state.withConfigOut(path.join(tmp, "config.json"));
      expect(options.build().fileExports[0]).toMatchObject({
        flag: "--config-out",
        when: "start",
      });
    });

    it("container paths are used verbatim without transfers", () => {
      options.state
        .withLoadState(containerPath("/data/state.json"))
        .withConfigOut(containerPath("/data/config.json"));
      expect(options.get("--load-state")).toBe("/data/state.json");
      expect(options.get("--config-out")).toBe("/data/config.json");
      const built = options.build();
      expect(built.fileImports).toEqual([]);
      expect(built.fileExports).toEqual([]);
    });

    it("re-setting a file option drops the previous transfer", () => {
      options.state.withLoadState(path.join(tmp, "a.json"));
      options.state.withLoadState(containerPath("/b.json"));
      expect(options.build().fileImports).toEqual([]);
      options.state.withLoadState(path.join(tmp, "c.json"));
      expect(options.build().fileImports).toHaveLength(1);
    });

    it("unset / reset drop transfers", () => {
      options.state.withState(path.join(tmp, "s.json"));
      options.unset("--state");
      expect(options.build().fileImports).toEqual([]);
      expect(options.build().fileExports).toEqual([]);
      options.state.withDumpState(path.join(tmp, "d.json")).reset();
      expect(options.build().fileExports).toEqual([]);
    });

    it("rejects empty paths", () => {
      expect(() => options.state.withLoadState("")).toThrow(
        AnvilConfigurationError,
      );
      expect(() => options.state.withLoadState({ containerPath: " " })).toThrow(
        AnvilConfigurationError,
      );
      expect(() => containerPath("relative/path")).toThrow(/absolute path/);
      expect(() => containerPath("")).toThrow(/non-empty path/);
    });
  });

  describe("conflicts", () => {
    it("--state excludes --init, --dump-state and --load-state", () => {
      options.state.withState(containerPath("/s"));
      expect(() => options.state.withInit(containerPath("/i"))).toThrow(
        /cannot be combined/,
      );
      expect(() => options.state.withDumpState(containerPath("/d"))).toThrow(
        /cannot be combined/,
      );
      expect(() => options.state.withLoadState(containerPath("/l"))).toThrow(
        /cannot be combined/,
      );
    });

    it("--init excludes the snapshot options", () => {
      options.state.withInit(containerPath("/i"));
      expect(() => options.state.withLoadState(containerPath("/l"))).toThrow(
        /cannot be combined/,
      );
      expect(() => options.state.withDumpState(containerPath("/d"))).toThrow(
        /cannot be combined/,
      );
      expect(() => options.state.withPreserveHistoricalStates()).toThrow(
        /cannot be combined/,
      );
    });

    it("a failed file option does not leave a dangling transfer", () => {
      options.state.withLoadState(path.join(tmp, "l.json"));
      expect(() => options.state.withInit(path.join(tmp, "g.json"))).toThrow();
      expect(
        options.build().fileImports.map((transfer) => transfer.flag),
      ).toEqual(["--load-state"]);
    });

    it("--load-state and --dump-state can be combined (different files)", () => {
      options.state
        .withLoadState(containerPath("/l"))
        .withDumpState(containerPath("/d"))
        .withPreserveHistoricalStates()
        .withStateInterval(5);
      expect(options.problems()).toEqual([]);
    });

    it("--max-persisted-states excludes --prune-history", () => {
      options.state.withMaxPersistedStates(1);
      expect(() => options.state.withPruneHistory()).toThrow(
        /cannot be combined/,
      );
      options.unset("--max-persisted-states").state.withPruneHistory(5);
      expect(() => options.state.withMaxPersistedStates(1)).toThrow(
        /cannot be combined/,
      );
    });
  });

  describe("dependencies", () => {
    it("--state-interval needs a dump target", () => {
      options.state.withStateInterval(30);
      expect(() => options.validate()).toThrow(
        /requires one of --dump-state, --state to be configured as well – anvil accepts the flag without a dump target/,
      );
      options.state.withDumpState(containerPath("/d"));
      expect(() => options.validate()).not.toThrow();
    });

    it("--preserve-historical-states needs a dump target", () => {
      options.state.withPreserveHistoricalStates();
      expect(options.problems()).toHaveLength(1);
      options.state.withState(containerPath("/s"));
      expect(options.problems()).toEqual([]);
    });
  });

  describe("value setters", () => {
    it("withStateInterval", () => {
      options.state.withStateInterval(30);
      expect(options.get("--state-interval")).toBe("30");
      expect(() => options.state.withStateInterval(0)).toThrow(
        AnvilConfigurationError,
      );
    });

    it("withPruneHistory supports the bare and valued forms", () => {
      options.state.withPruneHistory();
      expect(options.toArgs()).toContain("--prune-history");
      options.state.withPruneHistory(100);
      expect(options.toArgs()).toContain("--prune-history=100");
      expect(() => options.state.withPruneHistory(-1)).toThrow(
        AnvilConfigurationError,
      );
    });

    it("withMaxPersistedStates / withTransactionBlockKeeper", () => {
      options.state.withMaxPersistedStates(10).withTransactionBlockKeeper(50);
      expect(options.get("--max-persisted-states")).toBe("10");
      expect(options.get("--transaction-block-keeper")).toBe("50");
      expect(() => options.state.withTransactionBlockKeeper(1.5)).toThrow(
        AnvilConfigurationError,
      );
    });

    it("withTimestamp accepts seconds, bigint and Date", () => {
      options.state.withTimestamp(1_700_000_000);
      expect(options.get("--timestamp")).toBe("1700000000");
      options.state.withTimestamp(1_700_000_001n);
      expect(options.get("--timestamp")).toBe("1700000001");
      options.state.withTimestamp(new Date("2024-01-01T00:00:00Z"));
      expect(options.get("--timestamp")).toBe("1704067200");
      expect(() => options.state.withTimestamp(new Date("nope"))).toThrow(
        /invalid Date/,
      );
      expect(() => options.state.withTimestamp(-1)).toThrow(
        AnvilConfigurationError,
      );
    });

    it("withOrder validates the enum", () => {
      options.state.withOrder(Order.Fifo);
      expect(options.get("--order")).toBe("fifo");
      expect(() => options.state.withOrder("random" as Order)).toThrow(
        /unknown order/,
      );
    });
  });

  it("reset removes every state flag", () => {
    options.state
      .withState(containerPath("/s"))
      .withStateInterval(1)
      .withOrder(Order.Fifo)
      .withTimestamp(1)
      .account.withAccounts(1);
    options.state.reset();
    for (const flag of STATE_FLAGS) expect(options.has(flag)).toBe(false);
    expect(options.has("--accounts")).toBe(true);
  });
});
