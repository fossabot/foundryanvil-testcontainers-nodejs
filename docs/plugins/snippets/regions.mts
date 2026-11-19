/**
 * `// #region name` … `// #endregion name` blocks of example source files:
 * the single source of every code sample on the docs site.
 */

/** A named block of a source file, ready to be shown in the docs. */
export interface Region {
  /** Repository-relative POSIX path of the source file. */
  readonly file: string;
  readonly name: string;
  /** The block's lines, dedented, without marker lines. */
  readonly code: string;
  /** 1-based line number of the first line of the block (after the marker). */
  readonly startLine: number;
  /** 1-based line number of the last line of the block (before the marker). */
  readonly endLine: number;
}

const MARKER = /^\s*\/\/ #(region|endregion)(?:\s+(\S+))?\s*$/;
const NAME = /^[\w-]+$/;

/** A malformed region or a missing one. */
export class RegionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegionError";
  }
}

function dedent(lines: readonly string[]): string[] {
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => /^ */.exec(line)![0].length);
  const indent = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) =>
    line.trim().length > 0 ? line.slice(indent).trimEnd() : "",
  );
}

/**
 * Every region of `source`, by name. Regions may nest (inner marker lines
 * are left out of the outer block); names must be unique per file.
 * @throws RegionError for unnamed, unclosed, mismatched, duplicate or empty regions.
 */
export function parseRegions(
  source: string,
  file: string,
): ReadonlyMap<string, Region> {
  const lines = source.split(/\r?\n/);
  const open: { name: string; line: number }[] = [];
  const regions = new Map<string, Region>();
  const where = (index: number) => `${file}:${index + 1}`;

  lines.forEach((line, index) => {
    const marker = MARKER.exec(line);
    if (!marker) return;
    const [, kind, name] = marker;
    if (!name || !NAME.test(name)) {
      throw new RegionError(
        `${where(index)}: "// #${kind}" needs a name of letters, digits, "_" or "-"`,
      );
    }
    if (kind === "region") {
      if (regions.has(name) || open.some((entry) => entry.name === name)) {
        throw new RegionError(
          `${where(index)}: region "${name}" is defined twice`,
        );
      }
      open.push({ name, line: index });
      return;
    }
    const start = open.pop();
    if (!start || start.name !== name) {
      throw new RegionError(
        `${where(index)}: "// #endregion ${name}" does not close ${
          start ? `region "${start.name}"` : "any open region"
        }`,
      );
    }
    const body = lines
      .slice(start.line + 1, index)
      .filter((inner) => !MARKER.test(inner));
    if (body.every((inner) => inner.trim().length === 0)) {
      throw new RegionError(`${where(start.line)}: region "${name}" is empty`);
    }
    regions.set(name, {
      file,
      name,
      code: dedent(body).join("\n"),
      startLine: start.line + 2,
      endLine: index,
    });
  });

  const unclosed = open.pop();
  if (unclosed) {
    throw new RegionError(
      `${where(unclosed.line)}: region "${unclosed.name}" is never closed`,
    );
  }
  return regions;
}
