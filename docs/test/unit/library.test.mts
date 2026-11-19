import assert from "node:assert/strict";
import * as path from "node:path";
import { describe, it } from "node:test";
import {
  libraryEntry,
  loadLibrary,
  requireFromLibrary,
} from "../../plugins/reference/library.mts";
import { REPO_ROOT } from "../../plugins/snippets/project.mts";
import { fakeRepo } from "../support/fake-repo.mts";

describe("loadLibrary", () => {
  it("loads the library built from this checkout", () => {
    const library = loadLibrary(REPO_ROOT);
    assert.ok(library.ANVIL_FLAG_LIST.length > 60);
    assert.equal(typeof library.groupFlags, "function");
    assert.equal(
      libraryEntry(REPO_ROOT),
      path.join(REPO_ROOT, "dist", "index.cjs"),
    );
  });

  it("resolves modules the way the library does", () => {
    const viem = requireFromLibrary(REPO_ROOT, "viem") as {
      testActions: unknown;
    };
    assert.equal(typeof viem.testActions, "function");
  });

  it("explains a missing build", () => {
    const root = fakeRepo({ "package.json": "{}" });
    assert.throws(
      () => loadLibrary(root),
      /dist\/index.cjs is missing: build the library first/,
    );
  });
});
