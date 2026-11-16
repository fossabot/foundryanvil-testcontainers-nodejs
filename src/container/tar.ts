/**
 * @internal Minimal tar reader (ustar + pax/GNU long names + base-256 sizes)
 * for the archives returned by Docker's `getArchive`.
 */

const BLOCK = 512;

/** A regular file from a tar archive. */
export interface TarFile {
  readonly name: string;
  readonly content: Buffer;
}

function readString(block: Buffer, offset: number, length: number): string {
  const slice = block.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? length : end).toString("utf8");
}

function readNumber(block: Buffer, offset: number, length: number): number {
  const first = block[offset];
  if (first === 0x80 || first === 0xff) {
    // GNU base-256
    let value = 0;
    for (let i = 1; i < length; i++) value = value * 256 + block[offset + i];
    return first === 0xff ? value - 256 ** (length - 1) : value;
  }
  return parseInt(readString(block, offset, length).trim() || "0", 8);
}

function paxPath(content: Buffer): string | undefined {
  let offset = 0;
  while (offset < content.length) {
    const space = content.indexOf(0x20, offset);
    const length = parseInt(content.subarray(offset, space).toString(), 10);
    if (space === -1 || !(length > 0)) break;
    const record = content.subarray(space + 1, offset + length - 1).toString();
    if (record.startsWith("path=")) return record.slice(5);
    offset += length;
  }
  return undefined;
}

/** Regular files of an in-memory tar archive; throws if truncated. */
export function extractTarFiles(archive: Buffer): TarFile[] {
  const files: TarFile[] = [];
  let offset = 0;
  let nextName: string | undefined;
  while (offset + BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const size = readNumber(header, 124, 12);
    const type = String.fromCharCode(header[156] || 0x30);
    const prefix = readString(header, 257, 6).startsWith("ustar")
      ? readString(header, 345, 155)
      : "";
    const base = readString(header, 0, 100);
    const name = nextName ?? (prefix ? `${prefix}/${base}` : base);
    nextName = undefined;
    const start = offset + BLOCK;
    if (start + size > archive.length) {
      throw new Error(
        `Truncated tar archive: entry "${name}" exceeds archive size`,
      );
    }
    const content = archive.subarray(start, start + size);
    if (type === "0" || type === "\0" || type === "7")
      files.push({ name, content: Buffer.from(content) });
    else if (type === "L") nextName = readString(content, 0, content.length);
    else if (type === "x") nextName = paxPath(content);
    offset = start + Math.ceil(size / BLOCK) * BLOCK;
  }
  return files;
}

/** Reads a stream into memory. */
export async function readStream(
  stream: NodeJS.ReadableStream,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

/** First regular file of a tar stream; throws if there is none. */
export async function extractSingleFile(
  stream: NodeJS.ReadableStream,
): Promise<TarFile> {
  const [file] = extractTarFiles(await readStream(stream));
  if (!file)
    throw new Error("The tar archive does not contain any regular file");
  return file;
}
