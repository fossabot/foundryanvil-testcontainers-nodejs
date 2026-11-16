import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { DEFAULT_ANVIL_IMAGE } from "../../../src";
import {
  bundledAnvil,
  platformPackageName,
  resolveAnvilBinary,
} from "../../../scripts/anvil-binary.cjs";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
) as {
  devDependencies: Record<string, string>;
};
const imageVersion = DEFAULT_ANVIL_IMAGE.split(":").pop()!.replace(/^v/, "");

describe("local anvil binary (pnpm test:e2e --no-docker)", () => {
  it("pins @foundry-rs/anvil to exactly the default Docker image's version", () => {
    // Local mode must behave like Docker mode: bump both together.
    expect(manifest.devDependencies["@foundry-rs/anvil"]).toBe(imageVersion);
  });

  it("maps the current platform to a prebuilt package", () => {
    const name = platformPackageName();
    if (
      ["linux", "darwin", "win32"].includes(process.platform) &&
      ["x64", "arm64"].includes(process.arch)
    ) {
      expect(name).toMatch(
        /^@foundry-rs\/anvil-(linux|darwin|win32)-(amd64|arm64)$/,
      );
    } else {
      expect(name).toBeUndefined();
    }
  });

  const bundled = bundledAnvil(ROOT);
  (bundled ? it : it.skip)(
    "resolves the bundled binary out of the box, at the image's version",
    () => {
      const resolved = resolveAnvilBinary({ PATH: "" }, ROOT);
      expect(resolved).toEqual(bundled);
      expect(resolved!.source).toBe(
        `bundled @foundry-rs/anvil ${imageVersion}`,
      );
      const version = spawnSync(resolved!.path, ["--version"], {
        encoding: "utf8",
      }).stdout;
      expect(version).toContain(imageVersion);
    },
  );

  it("prefers ANVIL_BINARY and reports a missing override", () => {
    const self = process.execPath;
    expect(resolveAnvilBinary({ ANVIL_BINARY: self }, ROOT)).toEqual({
      path: self,
      source: "ANVIL_BINARY",
    });
    expect(
      resolveAnvilBinary({ ANVIL_BINARY: "/definitely/not/here" }, ROOT),
    ).toBeUndefined();
  });
});
