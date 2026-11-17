/**
 * The examples must exercise the library exactly as built from this
 * checkout, through `npm link` — never a published copy, a stale build or
 * dependencies leaking in from the library's own node_modules.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as library from "@hellaweb3/foundryanvil-testcontainers-nodejs";

const EXAMPLES = path.resolve(__dirname, "../..");
const LIBRARY = fs.realpathSync(path.resolve(EXAMPLES, ".."));
const NAME = "@hellaweb3/foundryanvil-testcontainers-nodejs";
describe("library link", () => {
  it("resolves the library through an npm link to this checkout", () => {
    const link = path.join(EXAMPLES, "node_modules", ...NAME.split("/"));
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(link)).toBe(LIBRARY);
    expect(require.resolve(NAME)).toBe(path.join(LIBRARY, "dist", "index.cjs"));
  });

  it("exposes the public API from the package entry point", () => {
    for (const name of [
      "AnvilContainer",
      "AnvilOptions",
      "TestClientOptions",
      "useAnvil",
      "AnvilCheats",
    ] as const) {
      expect(typeof library[name]).toBe("function");
    }
  });

  it("installs every dependency inside this project (nothing leaks from the checkout)", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(EXAMPLES, "package.json"), "utf8"),
    ) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const missing = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).filter(
      (name) =>
        !fs.existsSync(
          path.join(
            EXAMPLES,
            "node_modules",
            ...name.split("/"),
            "package.json",
          ),
        ),
    );
    expect(missing).toEqual([]);
  });

  it("the library has no lifecycle scripts that `npm link` would run", () => {
    const { scripts = {} } = JSON.parse(
      fs.readFileSync(path.join(LIBRARY, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const lifecycle = ["preinstall", "install", "postinstall", "prepare"];
    expect(
      Object.keys(scripts).filter((name) => lifecycle.includes(name)),
    ).toEqual([]);
  });
});
