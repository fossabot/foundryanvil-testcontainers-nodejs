/**
 * Where the docs project's synced documents and their example sources live.
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Region } from "./regions.mts";
import { listFiles } from "./sync.mts";

/** The docs project (`<repo>/docs`). */
export const DOCS_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/** The repository root: snippet paths are relative to it. */
export const REPO_ROOT = path.resolve(DOCS_ROOT, "..");

/** Markdown pages of the site. */
export const CONTENT_DIR = path.join(DOCS_ROOT, "content");

/** GitHub repository of the library (source links, edit links). */
export const REPOSITORY_URL =
  "https://github.com/hella-web3/foundryanvil-testcontainers-nodejs";

/** Branch the published docs link to. */
export const DEFAULT_BRANCH = "main";

/**
 * Every document whose code samples are synced: the site's pages and the
 * repository README (its quick start is a tested example too).
 */
export function syncedDocuments(
  docsRoot: string = DOCS_ROOT,
  repoRoot: string = REPO_ROOT,
): string[] {
  const markdown = (file: string) => /\.mdx?$/.test(file);
  return [
    ...listFiles(path.join(docsRoot, "content"), markdown),
    ...listFiles(path.join(docsRoot, "src", "pages"), markdown),
    path.join(repoRoot, "README.md"),
  ];
}

/** GitHub URL of a region's lines. */
export function githubSourceUrl(
  region: Pick<Region, "file" | "startLine" | "endLine">,
  repositoryUrl: string = REPOSITORY_URL,
  branch: string = DEFAULT_BRANCH,
): string {
  return `${repositoryUrl}/blob/${branch}/${region.file}#L${region.startLine}-L${region.endLine}`;
}
