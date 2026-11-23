/**
 * Rules for the real content: task pages are short, sample-first and end
 * with their concept links; every page is reachable; samples come from
 * code the examples project actually runs.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import { findCodeFences } from "../../plugins/snippets/markdown.mts";
import {
  DOCS_ROOT,
  REPO_ROOT,
  syncedDocuments,
} from "../../plugins/snippets/project.mts";
import { findOrphans, syncDocuments } from "../../plugins/snippets/sync.mts";
import { lazyLibrary } from "../../scripts/sync.mts";
import { loadPages, sidebarIds } from "../support/site.mts";

const pages = loadPages();
const byId = new Map(
  pages.map((page) => [page.id.replace(/\.mdx?$/, ""), page]),
);
const tasks = pages.filter((page) => page.id.startsWith("tasks/"));

describe("docs content", () => {
  it("is in sync with the tested examples and the library", () => {
    const report = syncDocuments(REPO_ROOT, syncedDocuments(), {
      library: lazyLibrary(REPO_ROOT),
    });
    assert.deepEqual(report.problems, []);
    assert.deepEqual(findOrphans(REPO_ROOT, report), []);
  });

  it("puts every page in exactly one sidebar place", () => {
    const ids = sidebarIds(path.join(DOCS_ROOT, "sidebars.ts"));
    assert.deepEqual(
      [...byId.keys()].filter((id) => !ids.includes(id)),
      [],
      "pages missing from sidebars.ts",
    );
    assert.deepEqual(
      ids.filter((id) => !byId.has(id)),
      [],
      "sidebar entries without a page",
    );
    assert.equal(new Set(ids).size, ids.length, "duplicate sidebar entries");
  });

  it("gives every page a title and a description", () => {
    const missing = pages
      .filter(
        (page) => !page.frontMatter.title || !page.frontMatter.description,
      )
      .map((page) => page.id);
    assert.deepEqual(missing, []);
  });

  it("keeps task pages sample-first, terse and linked to concepts", () => {
    const problems = tasks.flatMap((page) => {
      const issues: string[] = [];
      if (page.snippets.length === 0) issues.push("has no tested sample");
      const headings = [...page.body.matchAll(/^## (.+)$/gm)].map(
        (match) => match[1],
      );
      if (headings.at(-1) !== "Concepts")
        issues.push('must end with a "## Concepts" section');
      const concepts = page.body.slice(page.body.lastIndexOf("## Concepts"));
      if (!/\]\([^)]*\.md(#[\w-]+)?\)/.test(concepts)) {
        issues.push("Concepts section has no links");
      }
      if (!/\]\([^)]*(concepts|reference)\/[^)]*\.md/.test(concepts)) {
        issues.push(
          "Concepts section should link to a concept page or the reference",
        );
      }
      // Prose outside code, tables and headings: tasks stay short.
      const prose = page.body
        .replace(/```[\s\S]*?```/g, "")
        .split("\n")
        .filter(
          (line) => line.trim() && !/^(\||#|:::|- \[|<!--)/.test(line.trim()),
        )
        .join(" ")
        .split(/\s+/).length;
      if (prose > 250)
        issues.push(
          `has ${prose} words of prose (max 250): move context to a concept page`,
        );
      // The first thing after the front matter is a sentence or a sample, not a heading.
      if (/^\s*#/.test(page.body))
        issues.push("starts with a heading instead of the answer");
      return issues.map((issue) => `${page.id}: ${issue}`);
    });
    assert.deepEqual(problems, []);
  });

  it("takes samples only from code the examples project runs", () => {
    const examples = path.join(REPO_ROOT, "examples");
    const jestConfig = fs.readFileSync(
      path.join(examples, "jest.config.cjs"),
      "utf8",
    );
    assert.match(jestConfig, /roots: \["<rootDir>\/src", "<rootDir>\/test"\]/);
    const files = new Set(
      syncedDocuments().flatMap((document) =>
        findCodeFences(fs.readFileSync(document, "utf8"))
          .filter((fence) => fence.reference)
          .map((fence) => fence.reference!.file),
      ),
    );
    const untested = [...files].filter(
      (file) =>
        !/^examples\/test\/(e2e|unit)\/.+\.test\.ts$/.test(file) &&
        // Helpers and test support are imported by those tests.
        !/^examples\/(src|test\/support)\/.+\.ts$/.test(file),
    );
    assert.deepEqual(untested, []);
    assert.ok(files.size >= 20);
  });

  it("links the landing page's tasks to real pages", () => {
    const source = fs.readFileSync(
      path.join(DOCS_ROOT, "src", "data", "tasks.ts"),
      "utf8",
    );
    const targets = [...source.matchAll(/to: "([^"]+)"/g)].map(
      (match) => match[1],
    );
    assert.ok(targets.length >= 8);
    assert.deepEqual(
      targets.filter((to) => !byId.has(to.replace(/^\/docs\//, ""))),
      [],
    );
  });

  it("uses only relative links between pages", () => {
    const absolute = pages.flatMap((page) =>
      [...page.body.matchAll(/\]\((\/docs\/[^)]*)\)/g)].map(
        (match) => `${page.id}: ${match[1]}`,
      ),
    );
    assert.deepEqual(
      absolute,
      [],
      "use relative .md links so Docusaurus checks them",
    );
  });
});
