import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Readable } from "node:stream";
import {
  extractSingleFile,
  extractTarFiles,
  readStream,
} from "../../../src/container/tar";
import { buildTar } from "../../helpers/fake-started-container";

describe("tar reader", () => {
  it("extracts a single ustar file", () => {
    const files = extractTarFiles(buildTar("state.json", "0xdeadbeef"));
    expect(files).toEqual([
      { name: "state.json", content: Buffer.from("0xdeadbeef") },
    ]);
  });

  it("handles payloads that are exact multiples of the block size and empty files", () => {
    const big = Buffer.alloc(1024, "a");
    expect(extractTarFiles(buildTar("big", big))[0].content).toEqual(big);
    expect(extractTarFiles(buildTar("empty", ""))[0].content).toEqual(
      Buffer.alloc(0),
    );
  });

  it("reads archives produced by the system tar (ustar prefix, pax long names, directories)", () => {
    let tarAvailable = true;
    try {
      execFileSync("tar", ["--version"], { stdio: "ignore" });
    } catch {
      tarAvailable = false;
    }
    if (!tarAvailable) return;

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "anvil-tar-"));
    try {
      const longDir = "d".repeat(120);
      fs.mkdirSync(path.join(tmp, "dir", longDir), { recursive: true });
      fs.writeFileSync(path.join(tmp, "dir", "a.txt"), "alpha");
      fs.writeFileSync(path.join(tmp, "dir", longDir, "b.txt"), "beta");
      const archive = path.join(tmp, "out.tar");
      execFileSync("tar", ["-cf", archive, "-C", tmp, "dir"]);
      const files = extractTarFiles(fs.readFileSync(archive));
      const byName = new Map(
        files.map((file) => [file.name, file.content.toString()]),
      );
      expect(byName.get("dir/a.txt")).toBe("alpha");
      expect(byName.get(`dir/${longDir}/b.txt`)).toBe("beta");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("supports GNU long names and PAX path records", () => {
    const longName = "x".repeat(150);
    const gnuHeader = buildTar("././@LongLink", `${longName}\0`).subarray(
      0,
      1024,
    );
    gnuHeader.write("L", 156, 1);
    const fileEntry = buildTar("truncated-name", "content");
    const files = extractTarFiles(Buffer.concat([gnuHeader, fileEntry]));
    expect(files).toEqual([
      { name: longName, content: Buffer.from("content") },
    ]);

    const record = `path=${longName}\n`;
    const paxRecord = `${record.length + String(record.length + 2).length + 1} ${record}`;
    const paxHeader = buildTar("pax", paxRecord).subarray(0, 1024);
    paxHeader.write("x", 156, 1);
    const paxFiles = extractTarFiles(
      Buffer.concat([paxHeader, buildTar("short", "pax-content")]),
    );
    expect(paxFiles).toEqual([
      { name: longName, content: Buffer.from("pax-content") },
    ]);
  });

  it("ignores malformed pax records gracefully", () => {
    const paxHeader = buildTar("pax", "garbage without length").subarray(
      0,
      1024,
    );
    paxHeader.write("x", 156, 1);
    const files = extractTarFiles(
      Buffer.concat([paxHeader, buildTar("name", "c")]),
    );
    expect(files[0].name).toBe("name");
  });

  it("supports GNU base-256 sizes", () => {
    const archive = buildTar("n", "hello");
    // Encode size 5 in base-256.
    archive.fill(0, 124, 136);
    archive[124] = 0x80;
    archive[135] = 5;
    expect(extractTarFiles(archive)[0].content.toString()).toBe("hello");
    archive[124] = 0xff; // negative -> treated as (value - 256^11) => skipped as invalid size
    expect(() => extractTarFiles(archive)).not.toThrow();
  });

  it("throws on truncated archives", () => {
    const archive = buildTar("n", "hello world").subarray(0, 512 + 4);
    expect(() => extractTarFiles(archive)).toThrow(/Truncated tar archive/);
  });

  it("readStream / extractSingleFile work on streams", async () => {
    const archive = buildTar("s.json", "0x01");
    expect(
      await readStream(
        Readable.from([archive.subarray(0, 10), archive.subarray(10)]),
      ),
    ).toEqual(archive);
    expect(await readStream(Readable.from(["ab", "cd"]))).toEqual(
      Buffer.from("abcd"),
    );
    expect(
      (await extractSingleFile(Readable.from([archive]))).content.toString(),
    ).toBe("0x01");
    await expect(
      extractSingleFile(Readable.from([Buffer.alloc(1024)])),
    ).rejects.toThrow(/does not contain any regular file/);
  });
});
