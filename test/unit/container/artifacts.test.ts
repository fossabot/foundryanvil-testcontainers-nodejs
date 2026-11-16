import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DEFAULT_ARTIFACTS_DIR,
  loadContractAbi,
  loadContractBytecode,
} from "../../../src";

describe("artifact loaders", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "anvil-artifacts-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("loads the bundled test artifacts relative to <cwd>/test/artifacts by default", () => {
    expect(DEFAULT_ARTIFACTS_DIR).toBe(path.join("test", "artifacts"));
    const abi = loadContractAbi("WrappedEther/WrappedEther.json");
    expect(Array.isArray(abi)).toBe(true);
    expect(
      abi.some((item) => item.type === "function" && item.name === "deposit"),
    ).toBe(true);
    const bytecode = loadContractBytecode("WrappedEther/WrappedEther.bin");
    expect(bytecode.startsWith("0x")).toBe(true);
    expect(bytecode.length).toBeGreaterThan(100);
  });

  it("supports absolute paths and custom base directories", () => {
    const file = path.join(tmp, "abi.json");
    fs.writeFileSync(file, "[]");
    expect(loadContractAbi(file)).toEqual([]);
    expect(loadContractAbi("abi.json", tmp)).toEqual([]);
  });

  it("unwraps Hardhat/Foundry style artifacts", () => {
    fs.writeFileSync(
      path.join(tmp, "Artifact.json"),
      JSON.stringify({ abi: [{ type: "fallback" }], bytecode: "0x6001" }),
    );
    expect(loadContractAbi("Artifact.json", tmp)).toEqual([
      { type: "fallback" },
    ]);
    expect(loadContractBytecode("Artifact.json", tmp)).toBe("0x6001");

    fs.writeFileSync(
      path.join(tmp, "Foundry.json"),
      JSON.stringify({ abi: [], bytecode: { object: "6002" } }),
    );
    expect(loadContractBytecode("Foundry.json", tmp)).toBe("0x6002");
  });

  it("adds the 0x prefix to raw .bin files", () => {
    fs.writeFileSync(path.join(tmp, "c.bin"), "6003\n");
    expect(loadContractBytecode("c.bin", tmp)).toBe("0x6003");
  });

  it("reports helpful errors", () => {
    expect(() => loadContractAbi("missing.json", tmp)).toThrow(
      /ABI file not found at/,
    );
    expect(() => loadContractBytecode("missing.bin", tmp)).toThrow(
      /Bytecode file not found at/,
    );
    expect(() => loadContractAbi("", tmp)).toThrow(
      /artifact location is required/,
    );

    fs.mkdirSync(path.join(tmp, "dir"));
    expect(() => loadContractAbi("dir", tmp)).toThrow(/is a directory/);
    expect(() => loadContractBytecode("dir", tmp)).toThrow(/is a directory/);

    fs.writeFileSync(path.join(tmp, "bad.json"), "{not json");
    expect(() => loadContractAbi("bad.json", tmp)).toThrow(/not valid JSON/);
    expect(() => loadContractBytecode("bad.json", tmp)).toThrow(
      /not valid JSON/,
    );

    fs.writeFileSync(path.join(tmp, "shape.json"), JSON.stringify({ foo: 1 }));
    expect(() => loadContractAbi("shape.json", tmp)).toThrow(
      /must contain an ABI array/,
    );
    expect(() => loadContractBytecode("shape.json", tmp)).toThrow(
      /valid hex bytecode/,
    );

    fs.writeFileSync(path.join(tmp, "odd.bin"), "0xabc");
    expect(() => loadContractBytecode("odd.bin", tmp)).toThrow(
      /valid hex bytecode/,
    );
  });

  it("rethrows unexpected filesystem errors", () => {
    if (process.platform === "win32" || process.getuid?.() === 0) return;
    const file = path.join(tmp, "secret.json");
    fs.writeFileSync(file, "[]", { mode: 0o000 });
    expect(() => loadContractAbi(file)).toThrow(/permission denied/);
  });
});
