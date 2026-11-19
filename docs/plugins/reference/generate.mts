/**
 * Reference tables generated from the library itself, so they cannot drift:
 *
 *   <!-- generated:flags:account -->
 *   …table, written by `pnpm docs:sync`…
 *   <!-- /generated -->
 */
import type { FlagSpec, Library } from "./library.mts";

/** Fluent option groups, in `anvil --help` order. */
export const OPTION_GROUPS: readonly string[] = [
  "account",
  "evm",
  "fork",
  "mining",
  "logs",
  "network",
  "server",
  "state",
];

/** Enums rendered by `enum:<Name>`. */
export const ENUMS: readonly string[] = [
  "Hardfork",
  "OpHardfork",
  "Order",
  "Color",
  "LogVerbosity",
];

/** A generated block: `<!-- generated:name -->` … `<!-- /generated -->`. */
export const GENERATED_BLOCK =
  /<!-- generated:([\w:-]+) -->\n[\s\S]*?<!-- \/generated -->/g;

/** An unknown generator name. */
export class GeneratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeneratorError";
  }
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function code(items: readonly string[]): string {
  return items.map((item) => `\`${item}\``).join(", ");
}

function rules(spec: FlagSpec): string {
  return [
    spec.conflicts.length > 0 ? `⟂ ${code(spec.conflicts)}` : "",
    spec.requires.length > 0 ? `needs ${code(spec.requires)}` : "",
    spec.requiresAnyOf.length > 0
      ? `needs one of ${code(spec.requiresAnyOf)}`
      : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * The flags a fluent group configures, as a list (responsive, unlike a wide
 * table): method → flag (aliases), then anvil's description and the rules.
 */
export function renderFlagTable(library: Library, group: string): string {
  if (!OPTION_GROUPS.includes(group)) {
    throw new GeneratorError(
      `unknown option group "${group}" (expected one of ${OPTION_GROUPS.join(", ")})`,
    );
  }
  const flags = new Set(library.groupFlags(group));
  return library.ANVIL_FLAG_LIST.filter((spec) => flags.has(spec.flag))
    .map((spec) => {
      const methods = spec.methods
        .filter((method) => method.startsWith(`${group}.`))
        .map((method) => method.slice(group.length + 1));
      const aliases = spec.aliases.length > 0 ? ` (${code(spec.aliases)})` : "";
      const rule = rules(spec);
      return [
        `- ${code(methods)} → \`${spec.flag}\`${aliases}\\`,
        `  ${cell(spec.description)}${rule ? `\\\n  **Rules:** ${rule}.` : ""}`,
      ].join("\n");
    })
    .join("\n");
}

/** Every conflict and dependency the setters and `validate()` enforce. */
export function renderFlagRules(library: Library): string {
  const rows = library.ANVIL_FLAG_LIST.filter(
    (spec) =>
      spec.conflicts.length + spec.requires.length + spec.requiresAnyOf.length >
      0,
  ).map(
    (spec) =>
      `| \`${spec.flag}\` | ${code(spec.methods)} | ${code(spec.conflicts)} | ${[
        code(spec.requires),
        spec.requiresAnyOf.length > 0
          ? `one of ${code(spec.requiresAnyOf)}`
          : "",
      ]
        .filter(Boolean)
        .join(
          "; ",
        )} | ${spec.stricterThanAnvil ? cell(`Stricter than anvil: ${spec.stricterThanAnvil}`) : ""} |`,
  );
  return [
    "| Flag | Set by | Conflicts with | Requires | Note |",
    "|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

/** Flags the library manages itself (not configurable). */
export function renderManagedFlags(library: Library): string {
  return library.ANVIL_FLAG_LIST.filter((spec) => spec.managed)
    .map((spec) => `- \`${spec.flag}\`: ${cell(spec.description)}`)
    .join("\n");
}

/** `AnvilTestClientError` codes with their meaning. */
export function renderErrorCodes(library: Library): string {
  return [
    "| `code` | Meaning |",
    "|---|---|",
    ...Object.entries(library.ANVIL_TEST_CLIENT_ERROR_CODES).map(
      ([name, meaning]) => `| \`${name}\` | ${cell(meaning)} |`,
    ),
  ].join("\n");
}

/** Members of an exported enum. */
export function renderEnum(library: Library, name: string): string {
  const value = library[name];
  if (!ENUMS.includes(name) || typeof value !== "object" || value === null) {
    throw new GeneratorError(
      `unknown enum "${name}" (expected one of ${ENUMS.join(", ")})`,
    );
  }
  // Numeric enums map both ways: keep name → value entries only.
  const entries = Object.entries(value).filter(([key]) => !/^\d+$/.test(key));
  return [
    `| \`${name}\` member | Value |`,
    "|---|---|",
    ...entries.map(
      ([member, raw]) =>
        `| \`${name}.${member}\` | \`${JSON.stringify(raw)}\` |`,
    ),
  ].join("\n");
}

/**
 * Exported constants (primitive values and lists of them) with their values;
 * the per-group flag lists (`*_FLAGS`) are left to prose.
 */
export function renderConstants(library: Library): string {
  const constants = Object.entries(library)
    .filter(
      ([name]) => /^[A-Z][A-Z0-9_]+$/.test(name) && !name.endsWith("_FLAGS"),
    )
    .filter(
      ([, value]) =>
        ["string", "number", "boolean"].includes(typeof value) ||
        (Array.isArray(value) &&
          value.every((item) => typeof item !== "object")),
    )
    .sort(([a], [b]) => a.localeCompare(b));
  return [
    "| Constant | Value |",
    "|---|---|",
    ...constants.map(
      ([name, value]) => `| \`${name}\` | \`${cell(JSON.stringify(value))}\` |`,
    ),
  ].join("\n");
}

/** Content of the generator `name`, e.g. `flags:evm` or `enum:Hardfork`. */
export function generate(library: Library, name: string): string {
  const [kind, argument] = name.split(":");
  if (kind === "flags" && argument) return renderFlagTable(library, argument);
  if (kind === "enum" && argument) return renderEnum(library, argument);
  if (!argument) {
    if (kind === "flag-rules") return renderFlagRules(library);
    if (kind === "managed-flags") return renderManagedFlags(library);
    if (kind === "error-codes") return renderErrorCodes(library);
    if (kind === "constants") return renderConstants(library);
  }
  throw new GeneratorError(`unknown generated block "${name}"`);
}

/** Names of the generated blocks of a document. */
export function generatedBlocks(markdown: string): string[] {
  return [...markdown.matchAll(GENERATED_BLOCK)].map((match) => match[1]);
}

/** `markdown` with every generated block regenerated. */
export function renderGenerated(markdown: string, library: Library): string {
  return markdown.replace(
    GENERATED_BLOCK,
    (_, name: string) =>
      `<!-- generated:${name} -->\n${generate(library, name)}\n<!-- /generated -->`,
  );
}
