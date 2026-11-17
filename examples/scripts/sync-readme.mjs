#!/usr/bin/env node
/**
 * Keeps README code samples identical to the tested source.
 *
 * A README sample is declared as
 *
 *   <!-- snippet: test/e2e/time-travel.e2e.test.ts#boundary -->
 *   ```ts
 *   …generated…
 *   ```
 *   <!-- /snippet -->
 *
 * and filled from the `// #region boundary` … `// #endregion boundary` block
 * of that file (dedented).
 *
 *   npm run docs:sync            # rewrite the samples
 *   npm run docs:sync -- --check # fail when a sample is stale or missing
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const README = path.join(root, "README.md");

const SNIPPET =
  /<!-- snippet: ([^#\s]+)#([\w-]+) -->\n[\s\S]*?<!-- \/snippet -->/g;

/** The dedented body of `// #region name` in `file`. */
export function region(file, name) {
  const source = fs.readFileSync(path.join(root, file), "utf8").split("\n");
  const start = source.findIndex(
    (line) => line.trim() === `// #region ${name}`,
  );
  const end = source.findIndex(
    (line) => line.trim() === `// #endregion ${name}`,
  );
  if (start === -1 || end <= start) {
    throw new Error(
      `${file} has no "// #region ${name}" … "// #endregion ${name}" block`,
    );
  }
  const lines = source.slice(start + 1, end);
  const indent = Math.min(
    ...lines
      .filter((line) => line.trim())
      .map((line) => line.match(/^ */)[0].length),
  );
  return lines.map((line) => line.slice(indent)).join("\n");
}

/** README text with every snippet regenerated. */
export function render(readme = fs.readFileSync(README, "utf8")) {
  return readme.replace(
    SNIPPET,
    (_, file, name) =>
      `<!-- snippet: ${file}#${name} -->\n\`\`\`ts\n${region(file, name)}\n\`\`\`\n<!-- /snippet -->`,
  );
}

/** `[file, region]` of every snippet in the README. */
export function snippets(readme = fs.readFileSync(README, "utf8")) {
  return [...readme.matchAll(SNIPPET)].map((match) => [match[1], match[2]]);
}

function main() {
  const current = fs.readFileSync(README, "utf8");
  const next = render(current);
  if (process.argv.includes("--check")) {
    if (next !== current) {
      console.error(
        "✖ README samples differ from the tested source: run `npm run docs:sync`.",
      );
      process.exit(1);
    }
    console.log(
      `✔ ${snippets(current).length} README samples match the tested source`,
    );
    return;
  }
  fs.writeFileSync(README, next);
  console.log(`✔ synced ${snippets(next).length} README samples`);
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
