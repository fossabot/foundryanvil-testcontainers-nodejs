/**
 * Unit tests for the e2e harness pieces that do not need anvil or Docker.
 */
import { localizeArgs } from "../../helpers/local-anvil";
import { buildCliScript, parseCliOutput } from "../../helpers/e2e";
import { resolveE2EMode } from "../../helpers/runtime";
import { isDockerAvailable } from "../../../scripts/docker-runtime.cjs";

describe("e2e harness", () => {
  describe("localizeArgs (--no-docker)", () => {
    const map = new Map([
      ["/tmp/anvil-dump-state.json", "/work/anvil-dump-state.json"],
    ]);

    it("binds to loopback, rewrites the port and maps container paths", () => {
      expect(
        localizeArgs(
          [
            "--host",
            "0.0.0.0",
            "--port",
            "9545",
            "--dump-state",
            "/tmp/anvil-dump-state.json",
          ],
          40000,
          map,
        ),
      ).toEqual([
        "--host",
        "127.0.0.1",
        "--port",
        "40000",
        "--dump-state",
        "/work/anvil-dump-state.json",
      ]);
    });

    it("appends a port when none is configured and maps --flag=value paths", () => {
      expect(
        localizeArgs(
          ["--host", "0.0.0.0", "--ipc=/tmp/anvil-dump-state.json", "-vv"],
          1,
          map,
        ),
      ).toEqual([
        "--host",
        "127.0.0.1",
        "--ipc=/work/anvil-dump-state.json",
        "-vv",
        "--port",
        "1",
      ]);
      expect(localizeArgs(["--prune-history=10"], 2, map)).toEqual([
        "--prune-history=10",
        "--port",
        "2",
      ]);
    });
  });

  describe("Docker batch script", () => {
    it("quotes arguments safely and reports every case", () => {
      const script = buildCliScript([
        { args: ["--mnemonic", "it's quoted"], mode: "parse" },
        { args: ["--hardfork", "cancun"], mode: "boot" },
      ]);
      expect(script).toContain(
        `anvil '--mnemonic' 'it'\\''s quoted' completions bash`,
      );
      expect(script).toContain("timeout 2 anvil '--hardfork' 'cancun'");
      expect(script.trim().endsWith('echo "@@DONE"')).toBe(true);
    });

    it("parses results and detects incomplete output", () => {
      const cases = [
        { args: [], mode: "parse" as const },
        { args: [], mode: "boot" as const },
        { args: [], mode: "boot" as const },
      ];
      const output = [
        "@@CASE 1 124 ",
        "@@CASE 0 2 error: the argument '--a' cannot be used with '--b'",
        "@@CASE 2 1 Error: Unknown hardfork: latest",
        "@@DONE",
      ].join("\n");
      expect(parseCliOutput(output, cases)).toEqual([
        {
          exitCode: 2,
          booted: false,
          error: "error: the argument '--a' cannot be used with '--b'",
        },
        { booted: true, error: "" },
        {
          exitCode: 1,
          booted: false,
          error: "Error: Unknown hardfork: latest",
        },
      ]);
      expect(() => parseCliOutput("@@CASE 0 0 \n", cases)).toThrow(
        /2 results missing/,
      );
    });
  });

  describe("mode resolution", () => {
    it("honours ANVIL_E2E_MODE and otherwise detects a runtime", () => {
      expect(resolveE2EMode({ ANVIL_E2E_MODE: "local" })).toBe("local");
      expect(
        resolveE2EMode({ ANVIL_E2E_MODE: "skip", DOCKER_HOST: "tcp://x" }),
      ).toBe("skip");
      expect(resolveE2EMode({ DOCKER_HOST: "tcp://x" })).toBe("docker");
      expect(isDockerAvailable({ TESTCONTAINERS_HOST_OVERRIDE: "x" })).toBe(
        true,
      );
    });
  });
});
