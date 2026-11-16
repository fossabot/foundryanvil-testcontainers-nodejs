import { AnvilConfigurationError, AnvilFlag } from "../../../src";
import { ANVIL_HOST, FlagStore } from "../../../src/flags/flag-store";

describe("FlagStore", () => {
  let store: FlagStore;

  beforeEach(() => {
    store = new FlagStore();
  });

  describe("rendering", () => {
    it("always starts with the managed host binding", () => {
      expect(store.render()).toEqual(["--host", ANVIL_HOST]);
    });

    it("renders boolean, value, optional, multi and count flags", () => {
      store.set("--no-mining", true);
      store.set("--accounts", "5");
      store.set("--ipc", null);
      store.set("--prune-history", "10");
      store.set("--fork-url", "http://x");
      store.set("--fork-header", ["A: 1", "B: 2"]);
      store.set("--verbosity", 3);
      expect(store.render()).toEqual([
        "--host",
        "0.0.0.0",
        "--accounts",
        "5",
        "--ipc",
        "--no-mining",
        "--prune-history=10",
        "-vvv",
        "--fork-url",
        "http://x",
        "--fork-header",
        "A: 1",
        "--fork-header",
        "B: 2",
      ]);
    });

    it("attaches values starting with '-' using '=' so clap cannot misparse them", () => {
      store.set("--fork-url", "http://x");
      store.set("--fork-block-number", "-100");
      store.set("--fork-header", ["-weird: yes"]);
      expect(store.render()).toEqual([
        "--host",
        "0.0.0.0",
        "--fork-url",
        "http://x",
        "--fork-block-number=-100",
        "--fork-header=-weird: yes",
      ]);
    });

    it("renders in canonical help order regardless of insertion order", () => {
      store.set("--chain-id", "1");
      store.set("--accounts", "2");
      store.set("--json", true);
      const first = store.render();
      const other = new FlagStore();
      other.set("--json", true);
      other.set("--accounts", "2");
      other.set("--chain-id", "1");
      expect(other.render()).toEqual(first);
      expect(first).toEqual([
        "--host",
        "0.0.0.0",
        "--accounts",
        "2",
        "--json",
        "--chain-id",
        "1",
      ]);
    });

    it("appends extra args last", () => {
      store.set("--accounts", "1");
      store.addExtraArgs(["--future-flag", "x"]);
      expect(store.render().slice(-2)).toEqual(["--future-flag", "x"]);
    });
  });

  describe("writes", () => {
    it("rejects values of the wrong kind", () => {
      expect(() => store.set("--no-mining", "yes")).toThrow(
        AnvilConfigurationError,
      );
      expect(() => store.set("--accounts", true)).toThrow(
        AnvilConfigurationError,
      );
      expect(() => store.set("--verbosity", 0)).toThrow(
        AnvilConfigurationError,
      );
      expect(() => store.set("--verbosity", "3")).toThrow(
        AnvilConfigurationError,
      );
      expect(() => store.set("--fork-header", "A: 1")).toThrow(
        AnvilConfigurationError,
      );
      expect(() => store.set("--ipc", true)).toThrow(AnvilConfigurationError);
    });

    it("rejects the managed --host flag", () => {
      expect(() => store.set("--host", "127.0.0.1")).toThrow(
        /managed by the container/,
      );
      expect(() => store.unset("--host")).toThrow(/managed by the container/);
    });

    it("rejects conflicting flags eagerly with an actionable message", () => {
      store.set("--mnemonic", "a b c");
      expect(() => store.set("--mnemonic-random", null)).toThrow(
        /--mnemonic-random \(account.withRandomMnemonic\(\)\) cannot be combined with --mnemonic \(account.withMnemonic\(\)\).*unset\("--mnemonic"\)/,
      );
      try {
        store.set("--mnemonic-random", null);
      } catch (error) {
        const configError = error as AnvilConfigurationError;
        expect(configError.flag).toBe("--mnemonic-random");
        expect(configError.relatedFlags).toEqual(["--mnemonic"]);
        expect(configError.name).toBe("AnvilConfigurationError");
      }
    });

    it("allows re-setting the same flag", () => {
      store.set("--accounts", "1");
      store.set("--accounts", "2");
      expect(store.get("--accounts")).toBe("2");
    });

    it("toggle only works on boolean switches", () => {
      store.toggle("--no-mining", true);
      expect(store.has("--no-mining")).toBe(true);
      store.toggle("--no-mining", false);
      expect(store.has("--no-mining")).toBe(false);
      expect(() => store.toggle("--accounts", true)).toThrow(
        /not a boolean switch/,
      );
    });

    it("add only works on repeatable flags", () => {
      store.add("--fork-header", "A: 1");
      store.add("--fork-header", "B: 2");
      expect(store.get("--fork-header")).toEqual(["A: 1", "B: 2"]);
      expect(() => store.add("--accounts", "1")).toThrow(
        /not a repeatable flag/,
      );
    });

    it("add checks conflicts too", () => {
      store.set("--fork-url", "http://x");
      store.set("--fork-block-number", "1");
      expect(() => store.add("--fork-header", "A: 1")).not.toThrow();
    });

    it("unset removes the flag and its file transfers", () => {
      store.set("--load-state", "/tmp/x");
      store.addImport({
        flag: "--load-state",
        hostPath: "/host/x",
        containerPath: "/tmp/x",
        required: true,
      });
      store.addExport({
        flag: "--load-state",
        hostPath: "/host/x",
        containerPath: "/tmp/x",
        when: "stop",
      });
      expect(store.fileImports()).toHaveLength(1);
      expect(store.fileExports()).toHaveLength(1);
      store.unset("--load-state");
      expect(store.has("--load-state")).toBe(false);
      expect(store.fileImports()).toEqual([]);
      expect(store.fileExports()).toEqual([]);
      expect(() => store.unset("--load-state")).not.toThrow();
    });

    it("unsetAll removes several flags", () => {
      store.set("--accounts", "1");
      store.set("--balance", "2");
      store.unsetAll(["--accounts", "--balance", "--chain-id"]);
      expect(store.entries()).toEqual([]);
    });

    it("rejects known flags and --host in extra args", () => {
      expect(() => store.addExtraArgs(["--accounts", "1"])).toThrow(
        /known anvil flag/,
      );
      expect(() => store.addExtraArgs(["--host=1.2.3.4"])).toThrow(
        /known anvil flag/,
      );
      expect(() => store.addExtraArgs([""])).toThrow(/non-empty strings/);
      expect(() => store.addExtraArgs([1 as unknown as string])).toThrow(
        /non-empty strings/,
      );
    });
  });

  describe("clone", () => {
    it("creates an independent deep copy", () => {
      store.set("--fork-url", "http://x");
      store.set("--fork-header", ["A: 1"]);
      store.addExtraArgs(["--z"]);
      store.addImport({
        flag: "--load-state",
        hostPath: "/h",
        containerPath: "/c",
        required: true,
      });
      const copy = store.clone();
      copy.add("--fork-header", "B: 2");
      copy.set("--accounts", "3");
      copy.addExtraArgs(["--y"]);
      copy.unset("--load-state");
      expect(store.get("--fork-header")).toEqual(["A: 1"]);
      expect(store.has("--accounts")).toBe(false);
      expect(store.render().slice(-1)).toEqual(["--z"]);
      expect(copy.render().slice(-2)).toEqual(["--z", "--y"]);
      expect(store.fileImports()).toHaveLength(1);
      expect(copy.get("--fork-header")).toEqual(["A: 1", "B: 2"]);
    });
  });

  describe("violations", () => {
    it("reports missing requirements", () => {
      store.set("--retries", "3");
      store.set("--mixed-mining", true);
      const flags = store.violations().map((error) => error.flag);
      expect(flags.sort()).toEqual(["--mixed-mining", "--retries"]);
    });

    it("reports requiresAnyOf once", () => {
      store.set("--state-interval", "10");
      const violations = store.violations();
      expect(violations).toHaveLength(1);
      expect(violations[0].relatedFlags).toEqual(["--dump-state", "--state"]);
      store.set("--state", "/tmp/s");
      expect(store.violations()).toEqual([]);
    });

    it("reports conflicts exactly once per pair (defensive – setters already prevent them)", () => {
      // Bypass the eager check by building the map through clone + internal state.
      store.set("--json", true);
      const sneaky = store.clone() as unknown as {
        values: Map<AnvilFlag, unknown>;
      };
      sneaky.values.set("--quiet", true);
      sneaky.values.set("--md", true);
      const violations = (sneaky as unknown as FlagStore).violations();
      const pairs = violations.map(
        (error) => `${error.flag}<>${error.relatedFlags[0]}`,
      );
      expect(pairs.sort()).toEqual(["--json<>--md", "--json<>--quiet"]);
    });
  });

  describe("reads", () => {
    it("exposes entries and a plain object in canonical order", () => {
      store.set("--chain-id", "1");
      store.set("--accounts", "2");
      expect(store.entries()).toEqual([
        ["--accounts", "2"],
        ["--chain-id", "1"],
      ]);
      expect(store.toObject()).toEqual({
        "--accounts": "2",
        "--chain-id": "1",
      });
      expect(store.get("--balance")).toBeUndefined();
    });

    it("copies array values out of the store", () => {
      store.set("--fork-header", ["A: 1"]);
      const value = store.toObject()["--fork-header"] as string[];
      value.push("B: 2");
      expect(store.get("--fork-header")).toEqual(["A: 1"]);
    });
  });
});
