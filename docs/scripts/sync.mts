/**
 * Link/sync of the docs with the code they describe:
 *
 * - code samples ← tested `#region` blocks of ../examples;
 * - generated reference tables ← the library's flag registry and exports.
 *
 *   npm run sync     rewrite stale samples and tables
 *   npm run check    fail on stale, unlinked or broken samples and tables,
 *                    and on example regions that no page shows
 */
import { formatReference } from "../plugins/snippets/markdown.mts";
import { REPO_ROOT, syncedDocuments } from "../plugins/snippets/project.mts";
import {
  findOrphans,
  type SnippetReport,
  syncDocuments,
} from "../plugins/snippets/sync.mts";
import { type Library, loadLibrary } from "../plugins/reference/library.mts";

/** Human-readable lines for a report; empty when everything is fine. */
export function describeProblems(
  report: SnippetReport,
  orphans: ReturnType<typeof findOrphans>,
): string[] {
  return [
    ...report.problems.map(
      (problem) =>
        `${problem.document}:${problem.line}  ${problem.kind}  ${problem.message}`,
    ),
    ...orphans.map(
      (orphan) =>
        `${formatReference(orphan)}  orphan  tested example region not shown on any page`,
    ),
  ];
}

/** Loads the library once, on first use. */
export function lazyLibrary(repoRoot: string): () => Library {
  let library: Library | undefined;
  return () => (library ??= loadLibrary(repoRoot));
}

/** Runs the CLI; returns the exit code. */
export function main(
  argv: readonly string[] = process.argv.slice(2),
  repoRoot: string = REPO_ROOT,
  documents: readonly string[] = syncedDocuments(),
  log: (line: string) => void = console.log,
  error: (line: string) => void = console.error,
): number {
  const write = !argv.includes("--check");
  const report = syncDocuments(repoRoot, documents, {
    write,
    library: lazyLibrary(repoRoot),
  });
  const orphans = findOrphans(repoRoot, report);
  const count = [...report.snippets.values()].flat().length;
  report.written.forEach((document) => log(`✎ synced ${document}`));
  const problems = describeProblems(report, orphans);
  if (problems.length > 0) {
    problems.forEach((line) => error(`✖ ${line}`));
    error(
      write
        ? "✖ fix the problems above (stale samples and tables were synced)"
        : "✖ the docs are out of sync: run `pnpm docs:sync` (or `npm run sync` in docs/)",
    );
    return 1;
  }
  log(
    `✔ ${count} code samples in ${report.snippets.size} documents match the tested examples; generated tables match the library`,
  );
  return 0;
}

if (import.meta.main) process.exit(main());
