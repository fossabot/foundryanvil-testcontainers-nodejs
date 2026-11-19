import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SCRIPT = fs.readFileSync(
  path.join(ROOT, "scripts", "examples.mjs"),
  "utf8",
);
const SHARED = fs.readFileSync(
  path.join(ROOT, "scripts", "lib", "projects.mjs"),
  "utf8",
);
const fixtureRoots: string[] = [];

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "examples-script-"));
  fixtureRoots.push(root);
  const examples = path.join(root, "examples");
  fs.mkdirSync(path.join(root, "scripts", "lib"), { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.mkdirSync(path.join(examples, "node_modules"), { recursive: true });
  fs.mkdirSync(path.join(examples, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(root, "scripts", "examples.mjs"), SCRIPT);
  fs.writeFileSync(path.join(root, "scripts", "lib", "projects.mjs"), SHARED);
  fs.writeFileSync(path.join(root, "scripts", "compact-dist.mjs"), "");
  fs.writeFileSync(path.join(root, "src", "input.ts"), "export {};\n");
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  fs.writeFileSync(path.join(root, "tsconfig.json"), "{}\n");
  fs.writeFileSync(path.join(examples, "package.json"), "{}\n");
  fs.writeFileSync(path.join(examples, "package-lock.json"), "{}\n");
  fs.writeFileSync(
    path.join(examples, "node_modules", ".package-lock.json"),
    "{}\n",
  );
  fs.writeFileSync(path.join(examples, "scripts", "link-library.mjs"), "");
  const entry = path.join(root, "dist", "index.cjs");
  fs.writeFileSync(entry, "old build\n");
  fs.utimesSync(entry, new Date(1), new Date(1));
  return { root, entry };
}

function makePnpm(root: string, name: string, source: string) {
  const executable = path.join(root, name);
  fs.writeFileSync(executable, source);
  fs.chmodSync(executable, 0o755);
  return executable;
}

function runSetup(root: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync(
    process.execPath,
    [path.join(root, "scripts", "examples.mjs"), "setup"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...env },
    },
  );
}

function mockPnpmBody() {
  return `
const fs = require("node:fs");
fs.appendFileSync(process.env.PNPM_TEST_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
if (process.env.PNPM_TEST_FAILURE) process.exit(Number(process.env.PNPM_TEST_FAILURE));
fs.writeFileSync("dist/index.cjs", "new build\\n");
`;
}

describe("examples setup build launcher", () => {
  it("executes a native pnpm executable directly", () => {
    const { root, entry } = fixture();
    const log = path.join(root, "pnpm.log");
    const pnpm = makePnpm(
      root,
      "pnpm",
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "$PNPM_TEST_LOG"\nprintf 'new build\\n' > dist/index.cjs\n`,
    );

    const result = runSetup(root, {
      npm_execpath: pnpm,
      PNPM_TEST_LOG: log,
    });

    expect(result.status).toBe(0);
    expect(fs.readFileSync(log, "utf8").trim()).toBe("run build");
    expect(fs.readFileSync(entry, "utf8")).toBe("new build\n");
  });

  it("runs a pnpm JavaScript entry point with Node", () => {
    const { root, entry } = fixture();
    const log = path.join(root, "pnpm.log");
    const pnpm = makePnpm(root, "pnpm.cjs", mockPnpmBody());

    const result = runSetup(root, {
      npm_execpath: pnpm,
      PNPM_TEST_LOG: log,
    });

    expect(result.status).toBe(0);
    expect(fs.readFileSync(log, "utf8")).toBe('["run","build"]\n');
    expect(fs.readFileSync(entry, "utf8")).toBe("new build\n");
  });

  it("uses pnpm from PATH when npm_execpath is unavailable", () => {
    const { root, entry } = fixture();
    const bin = path.join(root, "bin");
    const log = path.join(root, "pnpm.log");
    fs.mkdirSync(bin);
    makePnpm(
      bin,
      "pnpm",
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "$PNPM_TEST_LOG"\nprintf 'new build\\n' > dist/index.cjs\n`,
    );

    const result = runSetup(root, {
      npm_execpath: "",
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      PNPM_TEST_LOG: log,
    });

    expect(result.status).toBe(0);
    expect(fs.readFileSync(log, "utf8").trim()).toBe("run build");
    expect(fs.readFileSync(entry, "utf8")).toBe("new build\n");
  });

  it("skips building when dist is up to date", () => {
    const { root, entry } = fixture();
    const log = path.join(root, "pnpm.log");
    const pnpm = makePnpm(root, "pnpm", "#!/bin/sh\nexit 99\n");
    const fresh = new Date(Date.now() + 1000);
    fs.utimesSync(entry, fresh, fresh);

    const result = runSetup(root, {
      npm_execpath: pnpm,
      PNPM_TEST_LOG: log,
    });

    expect(result.status).toBe(0);
    expect(fs.existsSync(log)).toBe(false);
    expect(fs.readFileSync(entry, "utf8")).toBe("old build\n");
  });

  it("propagates a build failure", () => {
    const { root } = fixture();
    const log = path.join(root, "pnpm.log");
    const pnpm = makePnpm(
      root,
      "pnpm",
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "$PNPM_TEST_LOG"\nexit 23\n`,
    );

    const result = runSetup(root, {
      npm_execpath: pnpm,
      PNPM_TEST_LOG: log,
    });

    expect(result.status).toBe(23);
    expect(fs.readFileSync(log, "utf8").trim()).toBe("run build");
  });
});
