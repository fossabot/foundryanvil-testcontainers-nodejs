import { readContainerLogSnapshot } from "../../../src/container/container-logs";

function frame(streamType: 1 | 2, text: string): Buffer {
  const payload = Buffer.from(text);
  const header = Buffer.alloc(8);
  header[0] = streamType;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

function dockerContainer(output: Buffer, tty = false) {
  return {
    inspect: jest.fn().mockResolvedValue({ Config: { Tty: tty } }),
    logs: jest.fn().mockResolvedValue(output),
  };
}

function readSnapshot(
  container: ReturnType<typeof dockerContainer>,
  tail?: number,
): Promise<string> {
  return readContainerLogSnapshot(container as never, tail);
}

describe("readContainerLogSnapshot", () => {
  it("requests all logs without following and decodes mixed UTF-8 streams", async () => {
    const container = dockerContainer(
      Buffer.concat([frame(1, "stdout ✓\n"), frame(2, "stderr ✗\n")]),
    );

    await expect(readSnapshot(container)).resolves.toBe("stdout ✓\nstderr ✗\n");
    expect(container.logs).toHaveBeenCalledWith({
      follow: false,
      stdout: true,
      stderr: true,
    });
  });

  it("requests only the requested tail", async () => {
    const container = dockerContainer(frame(1, "last line\n"));

    await readSnapshot(container, 2);

    expect(container.logs).toHaveBeenCalledWith({
      follow: false,
      stdout: true,
      stderr: true,
      tail: 2,
    });
  });

  it("keeps TTY logs unframed and handles an empty snapshot", async () => {
    const tty = dockerContainer(Buffer.from("raw tty output"), true);
    const empty = dockerContainer(Buffer.alloc(0));

    await expect(readSnapshot(tty)).resolves.toBe("raw tty output");
    await expect(readSnapshot(empty)).resolves.toBe("");
  });

  it("propagates unavailable-log errors", async () => {
    const container = dockerContainer(Buffer.alloc(0));
    container.logs.mockRejectedValue(new Error("logs unavailable"));

    await expect(readSnapshot(container)).rejects.toThrow("logs unavailable");
  });
});
