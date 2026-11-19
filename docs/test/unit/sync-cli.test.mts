import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { describe, it } from "node:test";
import { main } from "../../scripts/sync.mts";
import { DOCS_ROOT } from "../../plugins/snippets/project.mts";
import {
  EXAMPLE,
  EXAMPLE_FILE,
  fakeRepo,
  fence,
  read,
} from "../support/fake-repo.mts";

function run(files: Record<string, string>, argv: string[]) {
  const root = fakeRepo(files);
  const out: string[] = [];
  const err: string[] = [];
  const documents = Object.keys(files)
    .filter((file) => file.endsWith(".md"))
    .map((file) => path.join(root, file));
  const code = main(
    argv,
    root,
    documents,
    (line) => out.push(line),
    (line) => err.push(line),
  );
  return { root, code, out, err };
}

const synced = `${fence("one", "const one = 1;")}\n${fence("two", "const two = 2;")}\n`;

describe("sync CLI", () => {
  it("--check passes when every sample is synced and every region shown", () => {
    const { code, out, err } = run(
      { [EXAMPLE_FILE]: EXAMPLE, "docs/content/a.md": synced },
      ["--check"],
    );
    assert.equal(code, 0);
    assert.deepEqual(err, []);
    assert.deepEqual(out, [
      "✔ 2 code samples in 1 documents match the tested examples; generated tables match the library",
    ]);
  });

  it("--check fails on stale samples and orphan regions, without writing", () => {
    const stale = fence("one", "old");
    const { root, code, err } = run(
      { [EXAMPLE_FILE]: EXAMPLE, "docs/content/a.md": stale },
      ["--check"],
    );
    assert.equal(code, 1);
    assert.deepEqual(err, [
      `✖ docs/content/a.md:1  stale  ${EXAMPLE_FILE}#one differs from the tested source`,
      `✖ ${EXAMPLE_FILE}#two  orphan  tested example region not shown on any page`,
      "✖ the docs are out of sync: run `pnpm docs:sync` (or `npm run sync` in docs/)",
    ]);
    assert.equal(read(root, "docs/content/a.md"), stale);
  });

  it("syncs stale samples", () => {
    const { root, code, out } = run(
      {
        [EXAMPLE_FILE]: EXAMPLE,
        "docs/content/a.md": synced.replace("const two = 2;", "old"),
      },
      [],
    );
    assert.equal(code, 0);
    assert.deepEqual(out, [
      "✎ synced docs/content/a.md",
      "✔ 2 code samples in 1 documents match the tested examples; generated tables match the library",
    ]);
    assert.equal(read(root, "docs/content/a.md"), synced);
  });

  it("still fails after syncing when problems remain", () => {
    const { code, err } = run(
      {
        [EXAMPLE_FILE]: EXAMPLE,
        "docs/content/a.md": `${synced}\`\`\`ts\nx\n\`\`\`\n`,
      },
      [],
    );
    assert.equal(code, 1);
    assert.equal(
      err.at(-1),
      "✖ fix the problems above (stale samples and tables were synced)",
    );
    assert.match(err[0], /docs\/content\/a.md:7 {2}unlinked/);
  });

  it("runs as a script against the real docs", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/sync.mts", "--check"],
      {
        cwd: DOCS_ROOT,
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /code samples in \d+ documents match the tested examples/,
    );
  });
});
