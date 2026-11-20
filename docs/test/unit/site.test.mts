import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BASE_URL,
  DOCS_URL,
  HOME_URL,
  NPM_URL,
  REPOSITORY_URL,
} from "../../src/lib/site.mts";

describe("site", () => {
  it("serves the docs from hellalabs.dev", () => {
    assert.equal(BASE_URL, "/foundryanvil-testcontainers-nodejs/");
    assert.equal(
      HOME_URL,
      "https://hellalabs.dev/foundryanvil-testcontainers-nodejs/",
    );
    assert.equal(
      DOCS_URL,
      "https://hellalabs.dev/foundryanvil-testcontainers-nodejs/docs/",
    );
  });

  it("links the repository and the package", () => {
    assert.equal(
      REPOSITORY_URL,
      "https://github.com/hella-labs/foundryanvil-testcontainers-nodejs",
    );
    assert.equal(
      NPM_URL,
      "https://www.npmjs.com/package/@hellaweb3/foundryanvil-testcontainers-nodejs",
    );
  });
});
