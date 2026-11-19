import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generate,
  generatedBlocks,
  GeneratorError,
  renderConstants,
  renderEnum,
  renderErrorCodes,
  renderFlagRules,
  renderFlagTable,
  renderGenerated,
  renderManagedFlags,
} from "../../plugins/reference/generate.mts";
import { fakeLibrary } from "../support/fake-library.mts";

const library = fakeLibrary();

describe("reference generators", () => {
  it("lists a group's flags with methods, aliases, descriptions and rules", () => {
    assert.equal(
      renderFlagTable(library, "mining"),
      [
        "- `withBlockTime()`, `withMixedMining()` → `--block-time` (`-b`)\\",
        "  Sets --block-time.\\",
        "  **Rules:** ⟂ `--no-mining`.",
        "- `withNoMining()` → `--no-mining`\\",
        "  Sets --no-mining.\\",
        "  **Rules:** ⟂ `--block-time`.",
      ].join("\n"),
    );
    assert.match(
      renderFlagTable(library, "state"),
      /\*\*Rules:\*\* needs one of `--dump-state`, `--state`\.$/m,
    );
    assert.match(
      renderFlagTable(library, "fork"),
      /\*\*Rules:\*\* needs `--fork-url`\.$/m,
    );
    // A flag set by two groups appears in both, with that group's method.
    assert.match(
      renderFlagTable(library, "evm"),
      /^- `autoImpersonate\(\)` → `--auto-impersonate`\\\n {2}Sets --auto-impersonate\.$/m,
    );
    assert.throws(() => renderFlagTable(library, "nope"), GeneratorError);
  });

  it("renders every rule", () => {
    const rules = renderFlagRules(library).split("\n");
    assert.equal(rules.length, 2 + 4);
    assert.equal(
      rules[4],
      "| `--state-interval` | `state.withStateInterval()` |  | one of `--dump-state`, `--state` | Stricter than anvil: anvil ignores it. |",
    );
    assert.equal(
      rules[5],
      "| `--retries` | `fork.withRetries()` |  | `--fork-url` |  |",
    );
  });

  it("renders managed flags, error codes, enums and constants, escaping pipes", () => {
    assert.equal(
      renderManagedFlags(library),
      "- `--host`: The hosts \\| to listen on.",
    );
    assert.equal(
      renderErrorCodes(library),
      "| `code` | Meaning |\n|---|---|\n| `CONTAINER_STOPPED` | the node \\| was stopped |",
    );
    assert.equal(
      renderEnum(library, "Order"),
      '| `Order` member | Value |\n|---|---|\n| `Order.Fees` | `"fees"` |\n| `Order.Fifo` | `"fifo"` |',
    );
    assert.equal(
      renderEnum(library, "LogVerbosity"),
      "| `LogVerbosity` member | Value |\n|---|---|\n| `LogVerbosity.One` | `1` |\n| `LogVerbosity.Two` | `2` |",
    );
    assert.throws(() => renderEnum(library, "Nope"), /unknown enum "Nope"/);
    assert.throws(
      () => renderEnum(fakeLibrary({ Color: undefined }), "Color"),
      GeneratorError,
    );
    assert.equal(
      renderConstants(library),
      '| Constant | Value |\n|---|---|\n| `DEFAULT_PORT` | `8545` |\n| `NAME` | `"anvil"` |\n| `WORDS` | `[12,24]` |',
    );
  });

  it("dispatches generator names", () => {
    assert.equal(
      generate(library, "flags:mining"),
      renderFlagTable(library, "mining"),
    );
    assert.equal(generate(library, "enum:Order"), renderEnum(library, "Order"));
    assert.equal(generate(library, "flag-rules"), renderFlagRules(library));
    assert.equal(
      generate(library, "managed-flags"),
      renderManagedFlags(library),
    );
    assert.equal(generate(library, "error-codes"), renderErrorCodes(library));
    assert.equal(generate(library, "constants"), renderConstants(library));
    for (const name of ["nope", "flags", "constants:x"]) {
      assert.throws(
        () => generate(library, name),
        new GeneratorError(`unknown generated block "${name}"`),
      );
    }
  });

  it("finds and regenerates blocks in a document", () => {
    const markdown =
      "Intro\n\n<!-- generated:error-codes -->\nold\n<!-- /generated -->\n\nEnd\n";
    assert.deepEqual(generatedBlocks(markdown), ["error-codes"]);
    assert.equal(
      renderGenerated(markdown, library),
      `Intro\n\n<!-- generated:error-codes -->\n${renderErrorCodes(library)}\n<!-- /generated -->\n\nEnd\n`,
    );
  });
});
