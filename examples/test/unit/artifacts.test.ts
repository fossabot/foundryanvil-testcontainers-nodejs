/**
 * The examples run purely on contract artifacts: creation bytecode (`.bin`)
 * and ABI (`.json`) in artifacts/<Name>/. There are no Solidity sources and
 * no compiler in this project.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { type AbiFunction, toFunctionSelector } from "viem";
import {
  ARTIFACTS,
  ARTIFACTS_DIR,
  exampleToken,
  loadArtifact,
  timeLockVault,
} from "../../src";

const REPOSITORY = path.resolve(__dirname, "../../..");

function namesOf(
  abi: readonly { type: string; name?: string }[],
  type: string,
) {
  return abi.filter((item) => item.type === type).map((item) => item.name);
}

describe("contract artifacts", () => {
  it("has a .json ABI and a .bin bytecode for every artifact directory", () => {
    const directories = fs
      .readdirSync(ARTIFACTS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(directories).toEqual(ARTIFACTS.map((a) => a.name).sort());
    for (const name of directories) {
      expect(fs.readdirSync(path.join(ARTIFACTS_DIR, name)).sort()).toEqual([
        `${name}.bin`,
        `${name}.json`,
      ]);
    }
  });

  it("loads as viem ABIs and 0x-prefixed creation bytecode", () => {
    for (const artifact of ARTIFACTS) {
      expect(Array.isArray(artifact.abi)).toBe(true);
      expect(artifact.bytecode).toMatch(/^0x([0-9a-f]{2})+$/);
    }
    expect(namesOf(exampleToken.abi, "function")).toEqual(
      expect.arrayContaining(["mint", "transfer", "approve", "transferFrom"]),
    );
    expect(namesOf(timeLockVault.abi, "error").sort()).toEqual([
      "NothingToWithdraw",
      "StillLocked",
    ]);
  });

  it("pairs each ABI with its bytecode (every function selector is dispatched)", () => {
    for (const artifact of ARTIFACTS) {
      const missing = artifact.abi
        .filter((item): item is AbiFunction => item.type === "function")
        .map((item) => toFunctionSelector(item))
        .filter((selector) => !artifact.bytecode.includes(selector.slice(2)));
      expect({ contract: artifact.name, missing }).toEqual({
        contract: artifact.name,
        missing: [],
      });
    }
  });

  it("reports missing artifacts clearly", () => {
    expect(() => loadArtifact("Missing")).toThrow(
      /ABI file not found at .*artifacts\/Missing\/Missing\.json/,
    );
  });

  it("the repository contains no Solidity sources", () => {
    const skip = new Set([
      "node_modules",
      ".git",
      "dist",
      "coverage",
      ".npm-link",
    ]);
    const found: string[] = [];
    const walk = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (skip.has(entry.name)) continue;
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".sol"))
          found.push(path.relative(REPOSITORY, full));
      }
    };
    walk(REPOSITORY);
    expect(found).toEqual([]);
  });
});
