/**
 * The README is the entry point to the documentation site (docs/): its code
 * is synced from tested example regions, and its links reach real pages.
 * That the site documents the whole API is checked by the docs project
 * itself (docs/test/unit/api-coverage.test.mts, `pnpm docs:unit`).
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const README = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
const SITE = "https://hella-labs.github.io/foundryanvil-testcontainers-nodejs";
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
) as { homepage: string };

/** The dedented body of `// #region name` in a repository file. */
function region(file: string, name: string): string {
  const lines = fs
    .readFileSync(path.join(ROOT, file), "utf8")
    .split("\n")
    .map((line) => line.replace(/\r$/, ""));
  const start = lines.findIndex((line) => line.trim() === `// #region ${name}`);
  const end = lines.findIndex(
    (line) => line.trim() === `// #endregion ${name}`,
  );
  if (start === -1 || end <= start)
    throw new Error(`${file}#${name} not found`);
  const body = lines.slice(start + 1, end);
  const indent = Math.min(
    ...body
      .filter((line) => line.trim())
      .map((line) => /^ */.exec(line)![0].length),
  );
  return body
    .map((line) => (line.trim() ? line.slice(indent).trimEnd() : ""))
    .join("\n");
}

describe("README", () => {
  it("points to the documentation site", () => {
    expect(manifest.homepage).toBe(`${SITE}/`);
    expect(README).toContain(`[📖 Documentation](${SITE}/)`);
  });

  it("shows only code synced from tested example regions", () => {
    const fences = [
      ...README.matchAll(/^```(\w*)([^\n]*)\n([\s\S]*?)^```$/gm),
    ].filter(([, lang]) => !["shell", "bash", "sh", "text"].includes(lang));
    expect(fences.length).toBeGreaterThan(0);
    const problems = fences.flatMap(([, lang, meta, body]) => {
      const reference = /snippet="(examples\/[^"#]+)#([\w-]+)"/.exec(meta);
      if (!reference) return [`unlinked \`\`\`${lang} block`];
      return region(reference[1], reference[2]) === body.replace(/\n$/, "")
        ? []
        : [`${reference[1]}#${reference[2]} is stale: run \`pnpm docs:sync\``];
    });
    expect(problems).toEqual([]);
  });

  it("links to pages that exist, as do the JSDoc comments", () => {
    const sources = fs
      .readdirSync(path.join(ROOT, "src"), { recursive: true })
      .map(String)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => fs.readFileSync(path.join(ROOT, "src", file), "utf8"))
      .join("\n");
    const readmeLinks = [
      ...README.matchAll(new RegExp(`\\(${SITE}/docs/?([^)#]*)\\)`, "g")),
    ].map((match) => match[1]);
    const jsdocLinks = [
      ...sources.matchAll(new RegExp(`${SITE}/docs/([\\w/-]+)`, "g")),
    ].map((match) => match[1]);
    expect(readmeLinks.length).toBeGreaterThan(10);
    expect(jsdocLinks.length).toBeGreaterThanOrEqual(7);
    const links = [...readmeLinks, ...jsdocLinks];
    const content = path.join(ROOT, "docs", "content");
    const missing = links.filter((link) => {
      const page = link === "" ? "intro" : link;
      return ![`${page}.md`, `${page}/index.md`].some((file) =>
        fs.existsSync(path.join(content, file)),
      );
    });
    expect(missing).toEqual([]);
  });
});
