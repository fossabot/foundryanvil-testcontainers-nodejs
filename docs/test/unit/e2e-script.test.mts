import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { main, node } from "../../scripts/e2e.mts";

function recorder(statuses: number[]) {
  const calls: (readonly string[])[] = [];
  const run = (args: readonly string[]) => {
    calls.push(args);
    return statuses.shift() ?? 0;
  };
  return { calls, run };
}

describe("e2e script", () => {
  it("builds the site, then runs the e2e tests", () => {
    const { calls, run } = recorder([0, 0]);
    assert.equal(main([], run), 0);
    assert.equal(calls.length, 2);
    assert.match(
      calls[0][0],
      /@docusaurus[/\\]core[/\\]bin[/\\]docusaurus\.mjs$/,
    );
    assert.deepEqual(calls[0].slice(1), ["build"]);
    assert.deepEqual(calls[1], [
      "--test",
      "--test-reporter=spec",
      "test/e2e/**/*.test.mts",
    ]);
  });

  it("stops when the build fails", () => {
    const { calls, run } = recorder([3]);
    assert.equal(main([], run), 3);
    assert.equal(calls.length, 1);
  });

  it("tests an existing build with --no-build", () => {
    const { calls, run } = recorder([1]);
    assert.equal(main(["--no-build"], run), 1);
    assert.deepEqual(calls, [
      ["--test", "--test-reporter=spec", "test/e2e/**/*.test.mts"],
    ]);
  });

  it("runs node in the docs project and returns its exit code", () => {
    assert.equal(node(["-e", "process.exit(7)"]), 7);
    assert.equal(
      node(["-e", "process.cwd().endsWith('docs') || process.exit(1)"]),
      0,
    );
  });
});
