import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const EXAMPLES = path.resolve(__dirname, "../..");
const README = fs.readFileSync(path.join(EXAMPLES, "README.md"), "utf8");

function files(directory: string): string[] {
  return fs
    .readdirSync(path.join(EXAMPLES, directory), { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => path.posix.join(directory, file.split(path.sep).join("/")));
}

describe("README", () => {
  it("code samples are identical to the tested source", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/sync-readme.mjs", "--check"],
      { cwd: EXAMPLES, encoding: "utf8" },
    );
    expect(output).toMatch(/README samples match the tested source/);
  });

  it("links every workflow", () => {
    const unlinked = files("test/e2e").filter(
      (file) => !README.includes(`](${file})`),
    );
    expect(unlinked).toEqual([]);
  });

  it("shows every #region marked in the tests", () => {
    const unused = [...files("test/e2e"), ...files("test/unit")].flatMap(
      (file) =>
        [
          ...fs
            .readFileSync(path.join(EXAMPLES, file), "utf8")
            .matchAll(/\/\/ #region ([\w-]+)/g),
        ]
          .map((match) => `${file}#${match[1]}`)
          .filter(
            (snippet) => !README.includes(`<!-- snippet: ${snippet} -->`),
          ),
    );
    expect(unused).toEqual([]);
  });

  it("links only files that exist", () => {
    const missing = [
      ...README.matchAll(/\]\(((?:test|src|artifacts|scripts)[^)#]*)\)/g),
    ]
      .map((match) => match[1])
      .filter((link) => !fs.existsSync(path.join(EXAMPLES, link)));
    expect(missing).toEqual([]);
  });

  it("coverage map: every listed API is called in that workflow", () => {
    const map = README.slice(
      README.indexOf("## API coverage map"),
      README.indexOf("## Workflows"),
    );
    const rows = [
      ...map.matchAll(/^\| \[[^\]]+\]\((test\/e2e\/[^)]+)\) \|(.*)$/gm),
    ];
    expect(rows.length).toBeGreaterThanOrEqual(15);
    const missing = rows.flatMap(([, file, cells]) => {
      const source = fs.readFileSync(path.join(EXAMPLES, file), "utf8");
      return [...cells.matchAll(/`(\w+)`/g)]
        .map((match) => match[1])
        .filter((name) => !new RegExp(`\\b${name}\\b`).test(source))
        .map((name) => `${file}: ${name}`);
    });
    expect(missing).toEqual([]);
  });
});
