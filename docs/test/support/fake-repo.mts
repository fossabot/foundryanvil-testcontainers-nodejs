/** Throwaway repositories with example sources and docs, for unit tests. */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after } from "node:test";

const created: string[] = [];
after(() => {
  for (const directory of created.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

/** Creates `files` (repository-relative path → content) in a temp dir. */
export function fakeRepo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-snippets-"));
  created.push(root);
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

/** `text` of a repository file. */
export function read(root: string, file: string): string {
  return fs.readFileSync(path.join(root, file), "utf8");
}

/** A test file with regions `one` and `two`. */
export const EXAMPLE = [
  "it('works', () => {",
  "  // #region one",
  "  const one = 1;",
  "  // #endregion one",
  "  // #region two",
  "  const two = 2;",
  "  // #endregion two",
  "});",
  "",
].join("\n");

export const EXAMPLE_FILE = "examples/test/e2e/a.e2e.test.ts";

/** A fenced block linked to `region` of {@link EXAMPLE_FILE}. */
export function fence(region: string, body: string, lang = "ts"): string {
  return `\`\`\`${lang} snippet="${EXAMPLE_FILE}#${region}"\n${body}\n\`\`\``;
}
