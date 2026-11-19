import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRegions, RegionError } from "../../plugins/snippets/regions.mts";

const source = [
  "import { a } from 'a';", // 1
  "", // 2
  "describe('x', () => {", // 3
  "  it('y', () => {", // 4
  "    // #region outer", // 5
  "    const one = 1;", // 6
  "    // #region inner", // 7
  "    if (one) {", // 8
  "      call(one);   ", // 9
  "", // 10
  "    }", // 11
  "    // #endregion inner", // 12
  "    // #endregion outer", // 13
  "  });", // 14
  "});", // 15
].join("\n");

describe("parseRegions", () => {
  const regions = parseRegions(source, "examples/test/a.test.ts");

  it("dedents a block and keeps blank lines", () => {
    assert.deepEqual(regions.get("inner"), {
      file: "examples/test/a.test.ts",
      name: "inner",
      code: "if (one) {\n  call(one);\n\n}",
      startLine: 8,
      endLine: 11,
    });
  });

  it("leaves nested marker lines out of the outer block", () => {
    assert.equal(
      regions.get("outer")?.code,
      "const one = 1;\nif (one) {\n  call(one);\n\n}",
    );
    assert.equal(regions.get("outer")?.startLine, 6);
    assert.equal(regions.get("outer")?.endLine, 12);
  });

  it("reads CRLF sources", () => {
    const crlf = parseRegions(
      "// #region a\r\nx();\r\n// #endregion a\r\n",
      "f",
    );
    assert.equal(crlf.get("a")?.code, "x();");
  });

  it("returns no regions for plain files", () => {
    assert.equal(parseRegions("const a = 1;\n", "f").size, 0);
  });

  const invalid: [string, string, RegExp][] = [
    [
      "unnamed",
      "// #region\nx\n// #endregion",
      /f:1: "\/\/ #region" needs a name/,
    ],
    ["bad name", "// #region a.b\nx\n// #endregion a.b", /needs a name/],
    [
      "duplicate",
      "// #region a\nx\n// #endregion a\n// #region a\ny\n// #endregion a",
      /f:4: region "a" is defined twice/,
    ],
    [
      "duplicate while open",
      "// #region a\n// #region a\nx\n// #endregion a\n// #endregion a",
      /f:2: region "a" is defined twice/,
    ],
    [
      "unopened",
      "x\n// #endregion a",
      /f:2: "\/\/ #endregion a" does not close any open region/,
    ],
    [
      "crossed",
      "// #region a\n// #region b\nx\n// #endregion a\n// #endregion b",
      /f:4: "\/\/ #endregion a" does not close region "b"/,
    ],
    ["unclosed", "// #region a\nx", /f:1: region "a" is never closed/],
    ["empty", "// #region a\n  \n// #endregion a", /f:1: region "a" is empty/],
  ];
  for (const [label, text, message] of invalid) {
    it(`rejects ${label} regions`, () => {
      assert.throws(
        () => parseRegions(text, "f"),
        (error: unknown) =>
          error instanceof RegionError &&
          error.name === "RegionError" &&
          message.test(error.message),
      );
    });
  }
});
