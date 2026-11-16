/**
 * Prints the anvil flag coverage matrix as Markdown (used in the README).
 *
 * Usage: npx tsx scripts/flag-matrix.ts
 */
import { ANVIL_FLAG_LIST } from "../src";

const rows: string[] = [
  "| Category | Flag | Aliases | Fluent API | Conflicts with | Requires |",
  "|---|---|---|---|---|---|",
];

for (const spec of ANVIL_FLAG_LIST) {
  const aliases = spec.aliases.map((alias) => `\`${alias}\``).join(", ") || "–";
  const methods = spec.managed
    ? "_managed by the container (always `0.0.0.0`)_"
    : spec.methods.map((method) => `\`${method}\``).join(", ");
  const conflicts = spec.conflicts.map((flag) => `\`${flag}\``).join(", ") || "–";
  const requires =
    [
      ...spec.requires.map((flag) => `\`${flag}\``),
      ...(spec.requiresAnyOf.length > 0
        ? [`one of ${spec.requiresAnyOf.map((flag) => `\`${flag}\``).join(", ")}`]
        : []),
    ].join(", ") || "–";
  rows.push(
    `| ${spec.category} | \`${spec.flag}\` | ${aliases} | ${methods} | ${conflicts} | ${requires} |`,
  );
}

console.log(rows.join("\n"));
