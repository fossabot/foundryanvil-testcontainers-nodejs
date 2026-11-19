/**
 * Keeps the code samples of the docs identical to the tested example
 * regions, and reports everything that would let them drift apart.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  findCodeFences,
  formatReference,
  replaceSnippets,
  requiresLink,
  type SnippetReference,
  SOURCE_ROOTS,
} from "./markdown.mts";
import { parseRegions, type Region, RegionError } from "./regions.mts";
import { generate, GENERATED_BLOCK } from "../reference/generate.mts";
import type { Library } from "../reference/library.mts";

/** Source files that may contain regions. */
const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
  ".cjs",
];

/** Reads regions from the repository, parsing each file once. */
export class RegionResolver {
  private readonly cache = new Map<string, ReadonlyMap<string, Region>>();
  private readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /** Every region of a repository-relative file. */
  public regionsOf(file: string): ReadonlyMap<string, Region> {
    let regions = this.cache.get(file);
    if (!regions) {
      const absolute = path.join(this.repoRoot, file);
      if (!fs.existsSync(absolute)) {
        throw new RegionError(`${file} does not exist`);
      }
      regions = parseRegions(fs.readFileSync(absolute, "utf8"), file);
      this.cache.set(file, regions);
    }
    return regions;
  }

  /** @throws RegionError when the file or the region does not exist. */
  public resolve(reference: SnippetReference): Region {
    const region = this.regionsOf(reference.file).get(reference.region);
    if (!region) {
      const known = [...this.regionsOf(reference.file).keys()];
      throw new RegionError(
        `${reference.file} has no "// #region ${reference.region}"` +
          (known.length > 0 ? ` (it has: ${known.join(", ")})` : ""),
      );
    }
    return region;
  }
}

/** A problem found in one document. */
export interface SnippetProblem {
  /** Repository-relative path of the document. */
  readonly document: string;
  /** 1-based line of the code fence. */
  readonly line: number;
  readonly kind: "stale" | "unlinked" | "broken";
  readonly message: string;
}

/** Result of checking or syncing documents. */
export interface SnippetReport {
  /** Linked fences found, per repository-relative document path. */
  readonly snippets: ReadonlyMap<string, readonly SnippetReference[]>;
  readonly problems: readonly SnippetProblem[];
  /** Documents rewritten by {@link syncDocuments} (`write: true`). */
  readonly written: readonly string[];
}

function relative(repoRoot: string, file: string): string {
  return path.relative(repoRoot, file).split(path.sep).join("/");
}

/** Options of {@link syncDocuments}. */
export interface SyncOptions {
  /** Rewrite stale samples and generated blocks (default: only report). */
  readonly write?: boolean;
  /** The library, for generated reference blocks; loaded on first use. */
  readonly library?: () => Library;
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/**
 * Checks (and with `write`, fixes) every document: linked fences must match
 * their region, code fences must be linked, references must resolve, and
 * generated reference blocks must match the library. Unlinked and broken
 * fences are reported, never rewritten.
 */
export function syncDocuments(
  repoRoot: string,
  documents: readonly string[],
  { write = false, library }: SyncOptions = {},
): SnippetReport {
  const resolver = new RegionResolver(repoRoot);
  const snippets = new Map<string, SnippetReference[]>();
  const problems: SnippetProblem[] = [];
  const written: string[] = [];

  for (const document of documents) {
    const name = relative(repoRoot, document);
    const text = fs.readFileSync(document, "utf8");
    const references: SnippetReference[] = [];
    const fixable = new Set<number>();
    for (const fence of findCodeFences(text)) {
      const line = fence.openLine + 1;
      if (fence.referenceError) {
        problems.push({
          document: name,
          line,
          kind: "broken",
          message: fence.referenceError,
        });
        continue;
      }
      if (!fence.reference) {
        if (requiresLink(fence.lang)) {
          problems.push({
            document: name,
            line,
            kind: "unlinked",
            message: `\`\`\`${fence.lang || "(no language)"} code must be synced from a tested example: add snippet="examples/<file>#<region>"`,
          });
        }
        continue;
      }
      references.push(fence.reference);
      let region: Region;
      try {
        region = resolver.resolve(fence.reference);
      } catch (error: unknown) {
        problems.push({
          document: name,
          line,
          kind: "broken",
          message: (error as Error).message,
        });
        continue;
      }
      if (!fence.closed) {
        problems.push({
          document: name,
          line,
          kind: "broken",
          message: `the code fence of ${formatReference(fence.reference)} is never closed`,
        });
      } else if (fence.body !== region.code) {
        fixable.add(fence.openLine);
        problems.push({
          document: name,
          line,
          kind: "stale",
          message: `${formatReference(fence.reference)} differs from the tested source`,
        });
      }
    }
    snippets.set(name, references);

    const synced =
      fixable.size > 0
        ? replaceSnippets(text, (reference, fence) =>
            fixable.has(fence.openLine)
              ? resolver.resolve(reference).code
              : undefined,
          )
        : text;
    const next = synced.replace(
      GENERATED_BLOCK,
      (block, generator: string, offset: number) => {
        const line = lineOf(synced, offset);
        let expected: string;
        try {
          if (!library) throw new Error("no library to generate from");
          expected = `<!-- generated:${generator} -->\n${generate(library(), generator)}\n<!-- /generated -->`;
        } catch (error: unknown) {
          problems.push({
            document: name,
            line,
            kind: "broken",
            message: `generated:${generator}: ${(error as Error).message}`,
          });
          return block;
        }
        if (expected !== block) {
          problems.push({
            document: name,
            line,
            kind: "stale",
            message: `generated:${generator} differs from the library`,
          });
        }
        return expected;
      },
    );

    if (write && next !== text) {
      fs.writeFileSync(document, next);
      written.push(name);
    }
  }

  return {
    snippets,
    problems: write
      ? problems.filter((problem) => problem.kind !== "stale")
      : problems,
    written,
  };
}

/** Files below `directory` (recursively) whose name passes `accept`. */
export function listFiles(
  directory: string,
  accept: (file: string) => boolean,
): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        accept(entry.name) &&
        !path
          .relative(directory, entry.parentPath)
          .split(path.sep)
          .includes("node_modules"),
    )
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

/**
 * `file#region` of every region in the snippet source roots, e.g. to find
 * tested examples that no page shows.
 */
export function listRegions(repoRoot: string): SnippetReference[] {
  const resolver = new RegionResolver(repoRoot);
  return SOURCE_ROOTS.flatMap((root) =>
    listFiles(path.join(repoRoot, root), (file) =>
      SOURCE_EXTENSIONS.includes(path.extname(file)),
    ),
  ).flatMap((file) => {
    const name = relative(repoRoot, file);
    return [...resolver.regionsOf(name).keys()].map((region) => ({
      file: name,
      region,
    }));
  });
}

/** Regions no document links to. */
export function findOrphans(
  repoRoot: string,
  report: Pick<SnippetReport, "snippets">,
): SnippetReference[] {
  const used = new Set(
    [...report.snippets.values()]
      .flat()
      .map((reference) => formatReference(reference)),
  );
  return listRegions(repoRoot).filter(
    (reference) => !used.has(formatReference(reference)),
  );
}
