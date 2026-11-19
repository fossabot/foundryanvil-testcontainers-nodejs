import assert from "node:assert/strict";
import * as path from "node:path";
import { describe, it } from "node:test";
import {
  findOrphans,
  listFiles,
  listRegions,
  RegionResolver,
  syncDocuments,
} from "../../plugins/snippets/sync.mts";
import { RegionError } from "../../plugins/snippets/regions.mts";
import { renderErrorCodes } from "../../plugins/reference/generate.mts";
import {
  EXAMPLE,
  EXAMPLE_FILE,
  fakeRepo,
  fence,
  read,
} from "../support/fake-repo.mts";
import { fakeLibrary } from "../support/fake-library.mts";

describe("RegionResolver", () => {
  const root = fakeRepo({
    [EXAMPLE_FILE]: EXAMPLE,
    "examples/src/plain.ts": "x\n",
  });
  const resolver = new RegionResolver(root);

  it("resolves a region", () => {
    assert.equal(
      resolver.resolve({ file: EXAMPLE_FILE, region: "two" }).code,
      "const two = 2;",
    );
  });

  it("explains missing files and regions", () => {
    assert.throws(
      () => resolver.resolve({ file: "examples/test/nope.ts", region: "a" }),
      (error: unknown) =>
        error instanceof RegionError &&
        /examples\/test\/nope.ts does not exist/.test(error.message),
    );
    assert.throws(
      () => resolver.resolve({ file: EXAMPLE_FILE, region: "three" }),
      new RegionError(
        `${EXAMPLE_FILE} has no "// #region three" (it has: one, two)`,
      ),
    );
    assert.throws(
      () => resolver.resolve({ file: "examples/src/plain.ts", region: "a" }),
      new RegionError('examples/src/plain.ts has no "// #region a"'),
    );
  });
});

describe("syncDocuments", () => {
  const page = (body: string) =>
    [
      "# Page",
      "",
      fence("one", body),
      "",
      "```shell",
      "pnpm test",
      "```",
      "",
    ].join("\n");

  it("accepts documents whose samples match their regions", () => {
    const root = fakeRepo({
      [EXAMPLE_FILE]: EXAMPLE,
      "docs/content/a.md": page("const one = 1;"),
    });
    const report = syncDocuments(root, [path.join(root, "docs/content/a.md")]);
    assert.deepEqual(report.problems, []);
    assert.deepEqual(report.written, []);
    assert.deepEqual(
      [...report.snippets],
      [["docs/content/a.md", [{ file: EXAMPLE_FILE, region: "one" }]]],
    );
  });

  it("reports stale samples without writing by default", () => {
    const root = fakeRepo({
      [EXAMPLE_FILE]: EXAMPLE,
      "docs/content/a.md": page("const one = 0;"),
    });
    const report = syncDocuments(root, [path.join(root, "docs/content/a.md")]);
    assert.deepEqual(report.problems, [
      {
        document: "docs/content/a.md",
        line: 3,
        kind: "stale",
        message: `${EXAMPLE_FILE}#one differs from the tested source`,
      },
    ]);
    assert.equal(read(root, "docs/content/a.md"), page("const one = 0;"));
  });

  it("rewrites stale samples with write: true", () => {
    const root = fakeRepo({
      [EXAMPLE_FILE]: EXAMPLE,
      "docs/content/a.md": `${page("stale")}\n${fence("two", "const two = 2;")}\n`,
      "docs/content/b.md": page("const one = 1;"),
    });
    const documents = ["a.md", "b.md"].map((name) =>
      path.join(root, "docs/content", name),
    );
    const report = syncDocuments(root, documents, { write: true });
    assert.deepEqual(report.problems, []);
    assert.deepEqual(report.written, ["docs/content/a.md"]);
    assert.equal(
      read(root, "docs/content/a.md"),
      `${page("const one = 1;")}\n${fence("two", "const two = 2;")}\n`,
    );
    assert.deepEqual(syncDocuments(root, documents).problems, []);
  });

  it("reports unlinked code and broken references, and never rewrites them", () => {
    const markdown = [
      "```ts",
      "const untested = true;",
      "```",
      "```",
      "no language",
      "```",
      '```ts snippet="src/index.ts#a"',
      "x",
      "```",
      fence("missing", "x"),
      '```ts snippet="examples/test/none.ts#a"',
      "x",
      "```",
      fence("one", "stale"),
      fence("two", "unclosed"),
    ]
      .join("\n")
      .replace(/```$/, "");
    const root = fakeRepo({ [EXAMPLE_FILE]: EXAMPLE, "README.md": markdown });
    const report = syncDocuments(root, [path.join(root, "README.md")], {
      write: true,
    });
    assert.deepEqual(
      report.problems.map(({ line, kind }) => [line, kind]),
      [
        [1, "unlinked"],
        [4, "unlinked"],
        [7, "broken"],
        [10, "broken"],
        [13, "broken"],
        [19, "broken"],
      ],
    );
    assert.match(
      report.problems[1].message,
      /```\(no language\) code must be synced/,
    );
    assert.match(report.problems[2].message, /snippets must come from/);
    assert.match(report.problems[3].message, /has no "\/\/ #region missing"/);
    assert.match(
      report.problems[4].message,
      /examples\/test\/none.ts does not exist/,
    );
    assert.match(report.problems[5].message, /#two is never closed/);
    // The stale (but valid) sample was synced; nothing else changed.
    assert.equal(
      read(root, "README.md"),
      markdown.replace("stale", "const one = 1;"),
    );
  });
});

describe("listFiles / listRegions / findOrphans", () => {
  const root = fakeRepo({
    [EXAMPLE_FILE]: EXAMPLE,
    "examples/src/helpers.ts":
      "// #region helper\nexport const a = 1;\n// #endregion helper\n",
    "examples/src/readme.md":
      "// #region not-code\nx\n// #endregion not-code\n",
    "examples/node_modules/dep/index.ts":
      "// #region dep\nx\n// #endregion dep\n",
    "examples/scripts/tool.mjs": "// #region tool\nx\n// #endregion tool\n",
    "docs/content/a.md": fence("one", "const one = 1;"),
  });

  it("lists files recursively, skipping node_modules", () => {
    assert.deepEqual(
      listFiles(path.join(root, "examples"), (file) =>
        file.endsWith(".ts"),
      ).map((file) => path.relative(root, file).split(path.sep).join("/")),
      ["examples/src/helpers.ts", EXAMPLE_FILE],
    );
    assert.deepEqual(
      listFiles(path.join(root, "missing"), () => true),
      [],
    );
  });

  it("lists the regions of the snippet source roots only", () => {
    assert.deepEqual(listRegions(root), [
      { file: EXAMPLE_FILE, region: "one" },
      { file: EXAMPLE_FILE, region: "two" },
      { file: "examples/src/helpers.ts", region: "helper" },
    ]);
  });

  it("finds regions no document shows", () => {
    const report = syncDocuments(root, [path.join(root, "docs/content/a.md")]);
    assert.deepEqual(findOrphans(root, report), [
      { file: EXAMPLE_FILE, region: "two" },
      { file: "examples/src/helpers.ts", region: "helper" },
    ]);
  });
});

describe("syncDocuments: generated blocks", () => {
  const block = (name: string, body: string) =>
    `<!-- generated:${name} -->\n${body}\n<!-- /generated -->`;
  const codes = renderErrorCodes(fakeLibrary());

  it("reports and rewrites stale generated blocks", () => {
    const root = fakeRepo({
      "docs/content/a.md": `# A\n\n${block("error-codes", "old")}\n`,
    });
    const document = path.join(root, "docs/content/a.md");
    const check = syncDocuments(root, [document], {
      library: () => fakeLibrary(),
    });
    assert.deepEqual(check.problems, [
      {
        document: "docs/content/a.md",
        line: 3,
        kind: "stale",
        message: "generated:error-codes differs from the library",
      },
    ]);
    const sync = syncDocuments(root, [document], {
      write: true,
      library: () => fakeLibrary(),
    });
    assert.deepEqual(sync.problems, []);
    assert.equal(
      read(root, "docs/content/a.md"),
      `# A\n\n${block("error-codes", codes)}\n`,
    );
  });

  it("reports unknown generators and a missing library as broken", () => {
    const root = fakeRepo({
      "a.md": `${block("nope", "x")}\n${block("error-codes", "x")}\n`,
    });
    const withLibrary = syncDocuments(root, [path.join(root, "a.md")], {
      library: () => fakeLibrary(),
    });
    assert.deepEqual(
      withLibrary.problems.map(({ line, kind }) => [line, kind]),
      [
        [1, "broken"],
        [4, "stale"],
      ],
    );
    assert.match(
      withLibrary.problems[0].message,
      /generated:nope: unknown generated block "nope"/,
    );
    const without = syncDocuments(root, [path.join(root, "a.md")], {
      write: true,
    });
    assert.deepEqual(
      without.problems.map(({ kind }) => kind),
      ["broken", "broken"],
    );
    assert.match(without.problems[1].message, /no library to generate from/);
    assert.deepEqual(without.written, []);
  });

  it("needs no library for documents without generated blocks", () => {
    const root = fakeRepo({
      [EXAMPLE_FILE]: EXAMPLE,
      "a.md": fence("one", "const one = 1;"),
    });
    const report = syncDocuments(root, [path.join(root, "a.md")], {
      library: () => assert.fail("the library must not be loaded"),
    });
    assert.deepEqual(report.problems, []);
  });
});
