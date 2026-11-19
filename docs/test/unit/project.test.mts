import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import {
  CONTENT_DIR,
  DOCS_ROOT,
  githubSourceUrl,
  REPO_ROOT,
  syncedDocuments,
} from "../../plugins/snippets/project.mts";
import { fakeRepo } from "../support/fake-repo.mts";

describe("project layout", () => {
  it("locates the docs project inside the repository", () => {
    assert.equal(path.basename(DOCS_ROOT), "docs");
    assert.equal(CONTENT_DIR, path.join(DOCS_ROOT, "content"));
    assert.ok(fs.existsSync(path.join(REPO_ROOT, "examples", "package.json")));
  });

  it("syncs the site's pages and the repository README", () => {
    const root = fakeRepo({
      "README.md": "",
      "docs/content/b/page.md": "",
      "docs/content/a.mdx": "",
      "docs/content/img.png": "",
      "docs/src/pages/about.md": "",
      "docs/src/pages/index.tsx": "",
    });
    const documents = syncedDocuments(path.join(root, "docs"), root).map(
      (file) => path.relative(root, file).split(path.sep).join("/"),
    );
    assert.deepEqual(documents, [
      "docs/content/a.mdx",
      "docs/content/b/page.md",
      "docs/src/pages/about.md",
      "README.md",
    ]);
  });

  it("links regions to their lines on GitHub", () => {
    const region = {
      file: "examples/test/e2e/a.e2e.test.ts",
      startLine: 3,
      endLine: 9,
    };
    assert.equal(
      githubSourceUrl(region),
      "https://github.com/hella-web3/foundryanvil-testcontainers-nodejs/blob/main/examples/test/e2e/a.e2e.test.ts#L3-L9",
    );
    assert.equal(
      githubSourceUrl(region, "https://git.test/r", "dev"),
      "https://git.test/r/blob/dev/examples/test/e2e/a.e2e.test.ts#L3-L9",
    );
  });
});
