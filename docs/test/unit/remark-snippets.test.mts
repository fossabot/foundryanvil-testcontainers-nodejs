import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Code, Paragraph } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import remarkSnippets, {
  type SnippetFile,
  SOURCE_LINK_CLASS,
  sourceLink,
} from "../../plugins/snippets/remark-snippets.mts";
import {
  EXAMPLE,
  EXAMPLE_FILE,
  fakeRepo,
  fence,
} from "../support/fake-repo.mts";

class FakeFile implements SnippetFile {
  public readonly messages: string[] = [];
  public message(reason: string): void {
    this.messages.push(reason);
  }
  public fail(reason: string): never {
    throw new Error(reason);
  }
}

const root = fakeRepo({ [EXAMPLE_FILE]: EXAMPLE });
const url = (region: { file: string; startLine: number }) =>
  `https://example.test/${region.file}#L${region.startLine}`;

function transform(
  markdown: string,
  options: { onStale?: "error" | "update"; link?: boolean } = {},
) {
  const tree = fromMarkdown(markdown);
  const file = new FakeFile();
  remarkSnippets({
    repoRoot: root,
    onStale: options.onStale,
    sourceUrl: options.link === false ? undefined : url,
  })(tree, file);
  return { tree, file };
}

describe("remarkSnippets", () => {
  it("keeps synced blocks and links each to its tested source", () => {
    const { tree, file } = transform(
      [
        "Intro",
        "",
        fence("one", "const one = 1;"),
        "",
        "> quote",
        ">",
        "> " + fence("two", "const two = 2;").split("\n").join("\n> "),
      ].join("\n"),
    );
    assert.deepEqual(file.messages, []);
    const [intro, code, link, quote] = tree.children;
    assert.equal(intro.type, "paragraph");
    assert.equal((code as Code).value, "const one = 1;");
    assert.deepEqual(link, {
      type: "paragraph",
      data: { hProperties: { className: [SOURCE_LINK_CLASS] } },
      children: [
        { type: "text", value: "Tested in " },
        {
          type: "link",
          url: `https://example.test/${EXAMPLE_FILE}#L3`,
          title: `${EXAMPLE_FILE}, lines 3–3`,
          children: [{ type: "inlineCode", value: `${EXAMPLE_FILE}:3` }],
        },
      ],
    });
    // Nested blocks (quotes, lists, admonitions) are handled too.
    assert.equal(quote.type, "blockquote");
    assert.deepEqual(
      (quote as { children: { type: string }[] }).children.map(
        (child) => child.type,
      ),
      ["paragraph", "code", "paragraph"],
    );
  });

  it("adds no link without a sourceUrl", () => {
    const { tree } = transform(fence("one", "const one = 1;"), { link: false });
    assert.deepEqual(
      tree.children.map((child) => child.type),
      ["code"],
    );
  });

  it("allows unlinked terminal and text blocks", () => {
    const { tree } = transform("```shell\npnpm test\n```\n\n```text\nout\n```");
    assert.deepEqual(
      tree.children.map((child) => child.type),
      ["code", "code"],
    );
  });

  it("fails the build for unlinked code", () => {
    assert.throws(
      () => transform("```ts\nconst x = 1;\n```"),
      /```ts code must be synced from a tested example/,
    );
    assert.throws(
      () => transform("```\nx\n```"),
      /```\(no language\) code must be synced/,
    );
  });

  it("fails the build for stale blocks by default", () => {
    assert.throws(
      () => transform(fence("one", "const one = 0;")),
      new RegExp(
        `${EXAMPLE_FILE}#one differs from the tested source: run \`pnpm docs:sync\``,
      ),
    );
  });

  it("shows the current region with onStale: update, and warns", () => {
    const { tree, file } = transform(fence("one", "old"), {
      onStale: "update",
    });
    assert.equal((tree.children[0] as Code).value, "const one = 1;");
    assert.equal(file.messages.length, 1);
    assert.match(file.messages[0], /differs from the tested source/);
  });

  it("fails the build for broken references", () => {
    assert.throws(
      () => transform(fence("nope", "x")),
      /has no "\/\/ #region nope"/,
    );
    assert.throws(
      () => transform('```ts snippet="README.md#a"\nx\n```'),
      /snippets must come from/,
    );
  });

  it("builds the source link paragraph", () => {
    const paragraph: Paragraph = sourceLink(
      {
        file: "examples/src/a.ts",
        name: "a",
        code: "",
        startLine: 4,
        endLine: 9,
      },
      "u",
    );
    assert.equal(
      (paragraph.children[1] as { title: string }).title,
      "examples/src/a.ts, lines 4–9",
    );
  });
});
