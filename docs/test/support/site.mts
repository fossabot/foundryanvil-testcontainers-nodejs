/** The real docs content, parsed once for the content and coverage tests. */
import * as fs from "node:fs";
import * as path from "node:path";
import { findCodeFences } from "../../plugins/snippets/markdown.mts";
import { CONTENT_DIR, REPO_ROOT } from "../../plugins/snippets/project.mts";
import { RegionResolver, listFiles } from "../../plugins/snippets/sync.mts";

/** A page of the site. */
export interface Page {
  /** Path relative to `content/`, POSIX separators, e.g. `tasks/x/y.md`. */
  readonly id: string;
  readonly file: string;
  readonly text: string;
  /** Front matter key/values (flat `key: value` lines). */
  readonly frontMatter: Readonly<Record<string, string>>;
  /** Markdown after the front matter. */
  readonly body: string;
  /** Code of the page's linked samples (resolved from their regions). */
  readonly snippets: readonly string[];
}

function parseFrontMatter(text: string): {
  frontMatter: Record<string, string>;
  body: string;
} {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return { frontMatter: {}, body: text };
  const frontMatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const entry = /^([\w-]+):\s*(.*)$/.exec(line);
    if (entry) frontMatter[entry[1]] = entry[2].replace(/^"(.*)"$/, "$1");
  }
  return { frontMatter, body: text.slice(match[0].length) };
}

/** Every page of `content/`. */
export function loadPages(contentDir: string = CONTENT_DIR): Page[] {
  const resolver = new RegionResolver(REPO_ROOT);
  return listFiles(contentDir, (file) => /\.mdx?$/.test(file)).map((file) => {
    const text = fs.readFileSync(file, "utf8");
    const { frontMatter, body } = parseFrontMatter(text);
    return {
      id: path.relative(contentDir, file).split(path.sep).join("/"),
      file,
      text,
      frontMatter,
      body,
      snippets: findCodeFences(text)
        .filter((fence) => fence.reference)
        .map((fence) => resolver.resolve(fence.reference!).code),
    };
  });
}

/** Doc ids referenced by `sidebars.ts` (e.g. `tasks/x/y`). */
export function sidebarIds(sidebarsFile: string): string[] {
  const source = fs.readFileSync(sidebarsFile, "utf8");
  return [
    ...source.matchAll(
      /"((?:intro|get-started|tasks|reference|concepts)[\w/-]*)"/g,
    ),
  ].map((match) => match[1]);
}
