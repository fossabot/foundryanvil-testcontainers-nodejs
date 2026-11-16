/**
 * Builds a minimal ustar archive containing a single file – what Docker's
 * `getArchive` returns for a file path.
 */
export function buildTar(name: string, content: Buffer | string): Buffer {
  const data = typeof content === "string" ? Buffer.from(content) : content;
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8);
  header.write("0000000\0", 108, 8);
  header.write("0000000\0", 116, 8);
  header.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124, 12);
  header.write(
    `${Math.floor(Date.now() / 1000)
      .toString(8)
      .padStart(11, "0")}\0`,
    136,
    12,
  );
  header.write("        ", 148, 8);
  header.write("0", 156, 1);
  header.write("ustar\0", 257, 6);
  header.write("00", 263, 2);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  const padding = Buffer.alloc((512 - (data.length % 512)) % 512);
  return Buffer.concat([header, data, padding, Buffer.alloc(1024)]);
}
