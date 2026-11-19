import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findCodeFences,
  formatReference,
  parseSnippetMeta,
  replaceSnippets,
  requiresLink,
  SnippetReferenceError,
} from "../../plugins/snippets/markdown.mts";

const REF = 'snippet="examples/test/e2e/a.e2e.test.ts#one"';

describe("parseSnippetMeta", () => {
  it("reads file and region", () => {
    assert.deepEqual(parseSnippetMeta(`title="x" ${REF} showLineNumbers`), {
      file: "examples/test/e2e/a.e2e.test.ts",
      region: "one",
    });
    assert.deepEqual(parseSnippetMeta('snippet="examples/src/a.ts#b_c-1"'), {
      file: "examples/src/a.ts",
      region: "b_c-1",
    });
  });

  it("ignores fences without a snippet attribute", () => {
    assert.equal(parseSnippetMeta('title="x"'), undefined);
    assert.equal(parseSnippetMeta(""), undefined);
    assert.equal(parseSnippetMeta(null), undefined);
    assert.equal(parseSnippetMeta(undefined), undefined);
    assert.equal(parseSnippetMeta('mysnippet="a#b"'), undefined);
  });

  for (const value of [
    "examples/test/a.ts",
    "examples/test/a.ts#",
    "#a",
    "a b#c",
  ]) {
    it(`rejects the malformed reference "${value}"`, () => {
      assert.throws(
        () => parseSnippetMeta(`snippet="${value}"`),
        (error: unknown) =>
          error instanceof SnippetReferenceError &&
          error.name === "SnippetReferenceError" &&
          /must look like "examples\/<path>#<region>"/.test(error.message),
      );
    });
  }

  for (const file of [
    "src/index.ts",
    "examples/scripts/e2e.mjs",
    "examples/test/../../src/index.ts",
    "examples/./test/a.ts",
    "test/a.ts",
  ]) {
    it(`rejects sources outside the tested examples: ${file}`, () => {
      assert.throws(
        () => parseSnippetMeta(`snippet="${file}#a"`),
        /snippets must come from examples\/test\/ or examples\/src\//,
      );
    });
  }
});

describe("findCodeFences", () => {
  const markdown = [
    "# Title", // 0
    "", // 1
    `\`\`\`ts ${REF}`, // 2
    "const a = 1;", // 3
    "```", // 4
    "", // 5
    "1. Step", // 6
    "", // 7
    "   ```shell", // 8
    "   pnpm add x", // 9
    "     indented", // 10
    "   ```", // 11
    "", // 12
    "````md", // 13
    "```ts", // 14
    "not a fence", // 15
    "```", // 16
    "````", // 17
    "~~~", // 18
    "tilde", // 19
    "~~~~", // 20
    "```js `not` a fence", // 21
    "```", // 22
    "```", // 23
  ].join("\n");
  const fences = findCodeFences(markdown);

  it("finds fences with language, meta and reference", () => {
    assert.equal(fences.length, 5);
    assert.deepEqual(fences[0], {
      lang: "ts",
      meta: REF,
      indent: 0,
      openLine: 2,
      closeLine: 4,
      closed: true,
      body: "const a = 1;",
      reference: { file: "examples/test/e2e/a.e2e.test.ts", region: "one" },
      referenceError: undefined,
    });
  });

  it("strips the indentation of fences nested in lists", () => {
    assert.equal(fences[1].lang, "shell");
    assert.equal(fences[1].indent, 3);
    assert.equal(fences[1].body, "pnpm add x\n  indented");
    assert.equal(fences[1].reference, undefined);
  });

  it("treats shorter fences inside longer ones as content", () => {
    assert.equal(fences[2].lang, "md");
    assert.equal(fences[2].body, "```ts\nnot a fence\n```");
  });

  it("closes tilde fences with longer tilde fences", () => {
    assert.equal(fences[3].lang, "");
    assert.equal(fences[3].body, "tilde");
  });

  it("skips backtick info strings with backticks and reports unclosed fences", () => {
    // Line 21 is not a fence; line 22 opens one that line 23 closes.
    assert.equal(fences[4].openLine, 22);
    assert.equal(fences[4].closed, true);
    const unclosed = findCodeFences(`\`\`\`ts ${REF}\nconst a = 1;\nmore`);
    assert.deepEqual(
      [unclosed[0].closed, unclosed[0].closeLine, unclosed[0].body],
      [false, 2, "const a = 1;\nmore"],
    );
  });

  it("reports invalid references per fence instead of failing", () => {
    const [fence] = findCodeFences('```ts snippet="src/index.ts#a"\nx\n```');
    assert.equal(fence.reference, undefined);
    assert.match(fence.referenceError!, /snippets must come from/);
  });

  it("reads CRLF documents", () => {
    const [fence] = findCodeFences(`\`\`\`ts ${REF}\r\nx\r\n\`\`\`\r\n`);
    assert.equal(fence.body, "x");
    assert.equal(fence.closed, true);
  });
});

describe("requiresLink", () => {
  it("allows terminal and text blocks without a link", () => {
    for (const lang of ["shell", "bash", "sh", "text", "Shell"]) {
      assert.equal(requiresLink(lang), false, lang);
    }
  });

  it("requires a link for code, including blocks without a language", () => {
    for (const lang of ["ts", "tsx", "js", "json", "yaml", ""]) {
      assert.equal(requiresLink(lang), true, lang);
    }
  });
});

describe("replaceSnippets", () => {
  it("rewrites linked fences only, keeping their indentation", () => {
    const markdown = [
      `\`\`\`ts ${REF}`,
      "old",
      "```",
      "```ts",
      "unlinked",
      "```",
      "- item",
      "",
      `  \`\`\`ts ${REF}`,
      "  old",
      "  old",
      "  ```",
      "",
    ].join("\n");
    const next = replaceSnippets(
      markdown,
      (reference) => `new(${formatReference(reference)})\n\n  body`,
    );
    assert.equal(
      next,
      [
        `\`\`\`ts ${REF}`,
        "new(examples/test/e2e/a.e2e.test.ts#one)",
        "",
        "  body",
        "```",
        "```ts",
        "unlinked",
        "```",
        "- item",
        "",
        `  \`\`\`ts ${REF}`,
        "  new(examples/test/e2e/a.e2e.test.ts#one)",
        "",
        "    body",
        "  ```",
        "",
      ].join("\n"),
    );
  });

  it("leaves fences alone when render returns undefined", () => {
    const markdown = `\`\`\`ts ${REF}\nkeep\n\`\`\`\n\`\`\`ts ${REF}\nunclosed`;
    assert.equal(
      replaceSnippets(markdown, () => undefined),
      markdown,
    );
  });

  it("refuses to rewrite an unclosed fence", () => {
    assert.throws(
      () => replaceSnippets(`text\n\`\`\`ts ${REF}\nold`, () => "new"),
      /snippet="examples\/test\/e2e\/a.e2e.test.ts#one" \(line 2\) is never closed/,
    );
  });
});
