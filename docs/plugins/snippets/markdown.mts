/**
 * Code fences in Markdown that are linked to an example region:
 *
 * ````md
 * ```ts snippet="examples/test/e2e/time-travel.e2e.test.ts#fast-forward"
 * …code, generated from the region…
 * ```
 * ````
 */

/** A `file#region` reference of a linked code fence. */
export interface SnippetReference {
  /** Repository-relative POSIX path, inside one of the allowed source roots. */
  readonly file: string;
  readonly region: string;
}

/** A fenced code block of a Markdown document. */
export interface CodeFence {
  /** Language (first word of the info string), `""` when absent. */
  readonly lang: string;
  /** Rest of the info string. */
  readonly meta: string;
  /** Indentation of the opening fence (e.g. inside list items). */
  readonly indent: number;
  /** 0-based line index of the opening fence. */
  readonly openLine: number;
  /** 0-based line index of the closing fence (the last line when unclosed). */
  readonly closeLine: number;
  /** `false` when the document ends before the closing fence. */
  readonly closed: boolean;
  /** Content, with the fence's indentation removed. */
  readonly body: string;
  /** Set when the info string has a valid `snippet="file#region"`. */
  readonly reference?: SnippetReference;
  /** Why the `snippet="…"` attribute is invalid, when it is. */
  readonly referenceError?: string;
}

// Any indentation: fences nested in list items are indented by the item.
const OPENING = /^( *)(`{3,}|~{3,})(.*)$/;
const SNIPPET_META = /(?:^|\s)snippet="([^"]*)"/;
const REFERENCE = /^([^#\s]+)#([\w-]+)$/;

/** Where linked snippets may come from: the tested examples project. */
export const SOURCE_ROOTS: readonly string[] = [
  "examples/test/",
  "examples/src/",
];

/**
 * Fence languages that may appear without a link: terminal commands and
 * plain text. Everything else is code and must be synced from an example.
 */
export const UNLINKED_LANGUAGES: readonly string[] = [
  "shell",
  "bash",
  "sh",
  "text",
];

/** An invalid `snippet="…"` attribute. */
export class SnippetReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnippetReferenceError";
  }
}

/**
 * Parses the `snippet="file#region"` attribute of a fence's meta string.
 * @throws SnippetReferenceError for malformed references or files outside {@link SOURCE_ROOTS}.
 */
export function parseSnippetMeta(
  meta: string | null | undefined,
): SnippetReference | undefined {
  const attribute = SNIPPET_META.exec(meta ?? "");
  if (!attribute) return undefined;
  const reference = REFERENCE.exec(attribute[1]);
  if (!reference) {
    throw new SnippetReferenceError(
      `snippet="${attribute[1]}" must look like "examples/<path>#<region>"`,
    );
  }
  const [, file, region] = reference;
  if (
    file.split("/").some((part) => part === ".." || part === ".") ||
    !SOURCE_ROOTS.some((root) => file.startsWith(root))
  ) {
    throw new SnippetReferenceError(
      `snippet="${attribute[1]}": snippets must come from ${SOURCE_ROOTS.join(" or ")} (tested example code)`,
    );
  }
  return { file, region };
}

/** `file#region`, e.g. for messages. */
export function formatReference(reference: SnippetReference): string {
  return `${reference.file}#${reference.region}`;
}

function stripIndent(line: string, indent: number): string {
  let index = 0;
  while (index < indent && line[index] === " ") index++;
  return line.slice(index);
}

/** Every fenced code block of `markdown`, in document order. */
export function findCodeFences(markdown: string): CodeFence[] {
  const lines = markdown.split("\n");
  const fences: CodeFence[] = [];
  for (let index = 0; index < lines.length; index++) {
    const opening = OPENING.exec(lines[index].replace(/\r$/, ""));
    if (!opening) continue;
    const [, spaces, marker, info] = opening;
    // A backtick fence's info string may not contain backticks (CommonMark).
    if (marker[0] === "`" && info.includes("`")) continue;
    const closing = new RegExp(`^ *${marker[0]}{${marker.length},}\\s*$`);
    let end = index + 1;
    while (end < lines.length && !closing.test(lines[end].replace(/\r$/, "")))
      end++;
    const [lang = "", ...rest] = info.trim().split(/\s+/);
    let reference: SnippetReference | undefined;
    let referenceError: string | undefined;
    try {
      reference = parseSnippetMeta(rest.join(" "));
    } catch (error: unknown) {
      referenceError = (error as Error).message;
    }
    fences.push({
      lang,
      meta: rest.join(" "),
      indent: spaces.length,
      openLine: index,
      closeLine: Math.min(end, lines.length - 1),
      closed: end < lines.length,
      body: lines
        .slice(index + 1, end)
        .map((line) => stripIndent(line.replace(/\r$/, ""), spaces.length))
        .join("\n"),
      reference,
      referenceError,
    });
    index = end;
  }
  return fences;
}

/** `true` when a fence of this language must be linked to an example. */
export function requiresLink(lang: string): boolean {
  return !UNLINKED_LANGUAGES.includes(lang.toLowerCase());
}

/**
 * `markdown` with the body of linked fences replaced by `render`
 * (re-indented to the fence's indentation); fences for which `render`
 * returns `undefined` are left as they are.
 * @throws SnippetReferenceError when a fence to rewrite is never closed.
 */
export function replaceSnippets(
  markdown: string,
  render: (reference: SnippetReference, fence: CodeFence) => string | undefined,
): string {
  const lines = markdown.split("\n");
  const fences = findCodeFences(markdown).filter((fence) => fence.reference);
  // Replace from the end so earlier line indexes stay valid.
  for (const fence of fences.reverse()) {
    const code = render(fence.reference!, fence);
    if (code === undefined) continue;
    if (!fence.closed) {
      throw new SnippetReferenceError(
        `the code fence of snippet="${formatReference(fence.reference!)}" (line ${fence.openLine + 1}) is never closed`,
      );
    }
    const pad = " ".repeat(fence.indent);
    const body = code
      .split("\n")
      .map((line) => (line.length > 0 ? pad + line : line));
    lines.splice(
      fence.openLine + 1,
      fence.closeLine - fence.openLine - 1,
      ...body,
    );
  }
  return lines.join("\n");
}
