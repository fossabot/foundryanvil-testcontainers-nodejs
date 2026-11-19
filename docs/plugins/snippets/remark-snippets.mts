/**
 * Remark plugin enforcing the link/sync contract while the site is built:
 *
 * - every code block must be linked to a tested example region
 *   (`snippet="examples/<file>#<region>"`), except terminal/text blocks;
 * - a linked block must equal its region: the build fails when it is stale
 *   (`onStale: "error"`) or shows the current region (`"update"`, for
 *   `docusaurus start` while editing examples);
 * - each linked block gets a "Tested in <file>:<line>" link to its source.
 */
import type { Code, Link, Node, Paragraph, Parent, Root } from "mdast";
import {
  formatReference,
  parseSnippetMeta,
  requiresLink,
  type SnippetReference,
} from "./markdown.mts";
import type { Region } from "./regions.mts";
import { RegionResolver } from "./sync.mts";

export interface RemarkSnippetsOptions {
  /** Absolute path of the repository root (snippet paths are relative to it). */
  readonly repoRoot: string;
  /** What to do with a block that differs from its region (default `"error"`). */
  readonly onStale?: "error" | "update";
  /** URL of a region's source lines, e.g. on GitHub; no link when omitted. */
  readonly sourceUrl?: (region: Region) => string;
}

/** The subset of a VFile the plugin uses. */
export interface SnippetFile {
  readonly path?: string;
  message(reason: string, place?: Node): unknown;
  fail(reason: string, place?: Node): never;
}

/** Class of the paragraph holding the source link (styled in custom.css). */
export const SOURCE_LINK_CLASS = "snippet-source";

/** The "Tested in …" paragraph placed after a synced block. */
export function sourceLink(region: Region, url: string): Paragraph {
  const link: Link = {
    type: "link",
    url,
    title: `${region.file}, lines ${region.startLine}–${region.endLine}`,
    children: [
      { type: "inlineCode", value: `${region.file}:${region.startLine}` },
    ],
  };
  return {
    type: "paragraph",
    data: { hProperties: { className: [SOURCE_LINK_CLASS] } },
    children: [{ type: "text", value: "Tested in " }, link],
  };
}

function codeBlocks(tree: Root): { node: Code; parent: Parent }[] {
  const found: { node: Code; parent: Parent }[] = [];
  const visit = (parent: Parent) => {
    for (const child of parent.children) {
      if (child.type === "code") found.push({ node: child, parent });
      else if ("children" in child) visit(child);
    }
  };
  visit(tree);
  return found;
}

/** Remark plugin: see the module comment. */
export default function remarkSnippets(options: RemarkSnippetsOptions) {
  const { repoRoot, onStale = "error", sourceUrl } = options;
  return (tree: Root, file: SnippetFile): void => {
    // One resolver per document: regions are re-read on every build/rebuild.
    const resolver = new RegionResolver(repoRoot);
    for (const { node, parent } of codeBlocks(tree)) {
      let reference: SnippetReference | undefined;
      try {
        reference = parseSnippetMeta(node.meta);
      } catch (error: unknown) {
        file.fail((error as Error).message, node);
      }
      if (!reference) {
        if (requiresLink(node.lang ?? "")) {
          file.fail(
            `\`\`\`${node.lang ?? "(no language)"} code must be synced from a tested example: ` +
              `add snippet="examples/<file>#<region>" (see docs/README.md)`,
            node,
          );
        }
        continue;
      }
      let region: Region;
      try {
        region = resolver.resolve(reference);
      } catch (error: unknown) {
        file.fail((error as Error).message, node);
      }
      if (node.value !== region.code) {
        const stale = `${formatReference(reference)} differs from the tested source: run \`pnpm docs:sync\``;
        if (onStale === "error") file.fail(stale, node);
        file.message(stale, node);
        node.value = region.code;
      }
      if (sourceUrl) {
        parent.children.splice(
          parent.children.indexOf(node) + 1,
          0,
          sourceLink(region, sourceUrl(region)),
        );
      }
    }
  };
}
