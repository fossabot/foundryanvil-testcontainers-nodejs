/**
 * The root launchers of the separate npm projects (scripts/examples.mjs,
 * scripts/docs.mjs): which npm scripts each task runs, where, and which
 * arguments reach them — against a fixture repository and a fake `npm`.
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SCRIPTS = ["examples.mjs", "docs.mjs", path.join("lib", "projects.mjs")];
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** A repository whose library build and project installs are up to date. */
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-scripts-"));
  roots.push(root);
  const write = (file: string, content = "{}\n") => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  for (const script of SCRIPTS) {
    write(
      path.join("scripts", script),
      fs.readFileSync(path.join(ROOT, "scripts", script), "utf8"),
    );
  }
  write("src/index.ts", "export {};\n");
  write("package.json");
  write("tsconfig.json");
  write("scripts/compact-dist.mjs", "");
  write("examples/scripts/link-library.mjs", "");
  for (const project of ["examples", "docs"]) {
    write(`${project}/package.json`);
    write(`${project}/package-lock.json`);
  }
  // Newer than every input: no build, no install.
  const fresh = new Date(Date.now() + 60_000);
  for (const file of [
    "dist/index.cjs",
    "examples/node_modules/.package-lock.json",
    "docs/node_modules/.package-lock.json",
  ]) {
    write(file);
    fs.utimesSync(path.join(root, file), fresh, fresh);
  }
  // A fake npm that logs "<project> <args>" and succeeds.
  const bin = path.join(root, "bin");
  const log = path.join(root, "npm.log");
  write(
    "bin/npm",
    `#!/bin/sh\nprintf '%s %s\\n' "$(basename "$PWD")" "$*" >> "${log}"\n`,
  );
  fs.chmodSync(path.join(bin, "npm"), 0o755);
  return { root, bin, log };
}

function launch(script: string, args: string[]) {
  const { root, bin, log } = fixture();
  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts", script), ...args],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        NO_COLOR: "1",
      },
    },
  );
  const calls = fs.existsSync(log)
    ? fs.readFileSync(log, "utf8").trim().split("\n")
    : [];
  return { status: result.status, calls, stderr: result.stderr };
}

const posixOnly = process.platform === "win32" ? it.skip : it;

describe("examples launcher", () => {
  posixOnly(
    "forwards --coverage to the unit tests after the static checks",
    () => {
      const { status, calls } = launch("examples.mjs", ["unit", "--coverage"]);
      expect(status).toBe(0);
      expect(calls).toEqual([
        "examples run typecheck",
        "examples run lint",
        "examples run test:unit -- --coverage",
      ]);
    },
  );

  posixOnly("forwards --no-docker to the e2e workflows", () => {
    const { calls } = launch("examples.mjs", ["e2e", "--no-docker"]);
    expect(calls.at(-1)).toBe("examples run test:e2e -- --no-docker");
  });

  posixOnly("rejects unknown tasks", () => {
    const { status, stderr } = launch("examples.mjs", ["nope"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/Unknown task "nope"/);
  });
});

describe("docs launcher", () => {
  posixOnly("unit: sync check, static checks, then (coverage) tests", () => {
    expect(launch("docs.mjs", ["unit"]).calls).toEqual([
      "docs run check",
      "docs run typecheck",
      "docs run lint",
      "docs run test:unit",
    ]);
    expect(launch("docs.mjs", ["unit", "--coverage"]).calls.at(-1)).toBe(
      "docs run test:coverage",
    );
  });

  posixOnly(
    "e2e: runs the examples behind the samples, then the site checks",
    () => {
      const { status, calls } = launch("docs.mjs", ["e2e", "--no-docker"]);
      expect(status).toBe(0);
      expect(calls).toEqual([
        "examples run typecheck",
        "examples run lint",
        "examples run test:e2e -- --no-docker",
        "docs run test:e2e",
      ]);
      expect(launch("docs.mjs", ["e2e", "--skip-examples"]).calls).toEqual([
        "docs run test:e2e",
      ]);
    },
  );

  posixOnly("forwards Docusaurus arguments and syncs", () => {
    expect(launch("docs.mjs", ["start", "--port", "4000"]).calls).toEqual([
      "docs run start -- --port 4000",
    ]);
    expect(launch("docs.mjs", ["build"]).calls).toEqual(["docs run build --"]);
    expect(launch("docs.mjs", ["sync"]).calls).toEqual(["docs run sync"]);
    expect(launch("docs.mjs", ["check"]).calls).toEqual(["docs run check"]);
    expect(launch("docs.mjs", ["typecheck"]).calls).toEqual([
      "docs run typecheck",
    ]);
    expect(launch("docs.mjs", ["lint"]).calls).toEqual(["docs run lint"]);
  });

  posixOnly("installs the docs project when its lockfile changed", () => {
    const { root, bin, log } = fixture();
    const stale = new Date(Date.now() - 60_000);
    fs.utimesSync(
      path.join(root, "docs/node_modules/.package-lock.json"),
      stale,
      stale,
    );
    spawnSync(
      process.execPath,
      [path.join(root, "scripts", "docs.mjs"), "setup"],
      {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        },
      },
    );
    expect(fs.readFileSync(log, "utf8").trim()).toBe(
      "docs ci --no-audit --no-fund",
    );
  });
});

describe("Node version preflight", () => {
  const call = (code: string) =>
    spawnSync(
      process.execPath,
      [
        "-e",
        `import(${JSON.stringify(path.join(ROOT, "scripts", "lib", "projects.mjs"))}).then((lib) => { ${code} })`,
      ],
      { encoding: "utf8" },
    );

  it("compares versions numerically", () => {
    const result = call(
      `console.log(JSON.stringify([["22.18.0","22.18.0"],["22.21.0","22.18.0"],["24.0.0","22.18.0"],["22.9.0","22.18.0"],["v20.19.5","22.18.0"]].map(([a,b]) => lib.nodeSatisfies(a,b))))`,
    );
    expect(JSON.parse(result.stdout)).toEqual([true, true, true, false, false]);
  });

  it("stops with the reason and the fix", () => {
    const result = call(
      `lib.requireNode("22.18.0", "The docs project", "22.12.0")`,
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /The docs project needs Node\.js >= 22\.18\.0 \(running 22\.12\.0\); use the version in \.nvmrc/,
    );
  });
});
