/**
 * scripts/bench.mjs (`pnpm bench`): the comparison table and the CLI
 * plumbing. The benchmark itself runs against real anvil and is not part of
 * the gate (timings are machine-dependent).
 */
import { execFileSync, spawnSync } from "node:child_process";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SCRIPT = path.join(ROOT, "scripts", "bench.mjs");

function formatTable(samples: unknown, builds: string[]): string {
  const code = `import(${JSON.stringify(SCRIPT)}).then((bench) => process.stdout.write(bench.formatTable(${JSON.stringify(samples)}, ${JSON.stringify(builds)})))`;
  return execFileSync(process.execPath, ["-e", code], { encoding: "utf8" });
}

describe("bench script", () => {
  it("shows the median of each build and the speed-up", () => {
    const table = formatTable(
      {
        baseline: { "confirm()": [10, 12, 30] },
        current: { "confirm()": [5, 6, 50] },
      },
      ["baseline", "current"],
    ).split("\n");
    expect(table[0]).toMatch(/^Operation\s+baseline\s+current\s+speed-up$/);
    expect(table[1]).toMatch(/^confirm\(\)\s+12\.00 ms\s+6\.00 ms\s+2\.00x$/);
  });

  it("shows a single build without a ratio", () => {
    const table = formatTable({ current: { "start()": [3] } }, ["current"]);
    expect(table).toMatch(/start\(\)\s+3\.00 ms\s*$/);
  });

  it("runs as a CLI (zero rounds: no anvil started)", () => {
    const result = spawnSync(process.execPath, [SCRIPT, "--rounds", "0"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/0 round\(s\) of current…/);
  });
});
