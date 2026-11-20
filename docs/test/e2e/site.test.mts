/**
 * End-to-end checks of the built site (`npm run test:e2e` builds it first):
 * every page is generated, every sample on a page is exactly its tested
 * region with a link to its lines, and generated references are rendered.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import { findCodeFences } from "../../plugins/snippets/markdown.mts";
import {
  DOCS_ROOT,
  githubSourceUrl,
  REPO_ROOT,
} from "../../plugins/snippets/project.mts";
import { RegionResolver } from "../../plugins/snippets/sync.mts";
import { loadLibrary } from "../../plugins/reference/library.mts";
import { loadPages, type Page } from "../support/site.mts";
import { BASE_URL, SITE_URL } from "../../src/lib/site.mts";

const BUILD = process.env.DOCS_BUILD_DIR ?? path.join(DOCS_ROOT, "build");
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const resolver = new RegionResolver(REPO_ROOT);
const pages = loadPages();

/** The built HTML file of a page (`trailingSlash: false`). */
function builtFile(page: Page): string {
  const slug = page.frontMatter.slug;
  const route = slug
    ? `docs${slug === "/" ? "" : slug}`
    : `docs/${page.id.replace(/\.mdx?$/, "")}`;
  return path.join(BUILD, `${route}.html`);
}

function decode(html: string): string {
  return html
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Text of every code block of a built page, in order. */
function codeBlocks(html: string): string[] {
  return [
    ...html.matchAll(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/g),
  ].map((match) => decode(match[1]).replace(/\n$/, ""));
}

describe("built site", () => {
  it("exists (run `npm run test:e2e`, which builds it)", () => {
    assert.ok(
      fs.existsSync(path.join(BUILD, "index.html")),
      `no build in ${BUILD}`,
    );
  });

  it("generates every page, the landing page, 404 and the sitemap", () => {
    const missing = pages.map(builtFile).filter((file) => !fs.existsSync(file));
    assert.deepEqual(missing, []);
    for (const file of ["404.html", "sitemap.xml"]) {
      assert.ok(fs.existsSync(path.join(BUILD, file)), file);
    }
    const landing = fs.readFileSync(path.join(BUILD, "index.html"), "utf8");
    assert.match(landing, /What do you want to do\?/);
    assert.match(
      landing,
      new RegExp(`href="${escape(BASE_URL)}docs/get-started/quick-start"`),
    );
  });

  it("renders every sample exactly as its tested region, with a link to its lines", () => {
    const problems: string[] = [];
    let checked = 0;
    for (const page of pages) {
      const html = fs.readFileSync(builtFile(page), "utf8");
      const blocks = codeBlocks(html);
      const fences = findCodeFences(page.text);
      if (blocks.length !== fences.length) {
        problems.push(
          `${page.id}: ${fences.length} code blocks in markdown, ${blocks.length} built`,
        );
        continue;
      }
      fences.forEach((fence, index) => {
        if (!fence.reference) return;
        const region = resolver.resolve(fence.reference);
        checked++;
        if (blocks[index] !== region.code) {
          problems.push(
            `${page.id}: block ${index + 1} differs from ${fence.reference.file}#${fence.reference.region}`,
          );
        }
        if (!html.includes(`href="${githubSourceUrl(region)}"`)) {
          problems.push(
            `${page.id}: no source link to ${githubSourceUrl(region)}`,
          );
        }
      });
    }
    assert.deepEqual(problems, []);
    assert.ok(checked > 150, `only ${checked} samples checked`);
  });

  it("renders the generated reference tables", () => {
    const html = fs.readFileSync(
      path.join(BUILD, "docs", "reference", "anvil-options.html"),
      "utf8",
    );
    const library = loadLibrary(REPO_ROOT);
    const missing = library.ANVIL_FLAG_LIST.filter(
      (spec) => !html.includes(`<code>${spec.flag}</code>`),
    );
    assert.deepEqual(
      missing.map((spec) => spec.flag),
      [],
    );
    const errors = fs.readFileSync(
      path.join(BUILD, "docs", "reference", "errors.html"),
      "utf8",
    );
    for (const code of Object.keys(library.ANVIL_TEST_CLIENT_ERROR_CODES)) {
      assert.ok(errors.includes(`<code>${code}</code>`), code);
    }
  });

  it("serves assets from the GitHub Pages base URL", () => {
    const html = fs.readFileSync(path.join(BUILD, "docs.html"), "utf8");
    assert.match(
      html,
      new RegExp(`<link[^>]+href="${escape(BASE_URL)}assets/css/`),
    );
    assert.match(
      html,
      new RegExp(
        `<link[^>]+rel="canonical" href="${escape(`${SITE_URL}${BASE_URL}docs`)}"`,
      ),
    );
  });
});
