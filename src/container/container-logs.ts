import {
  ContainerRuntimeClient,
  getContainerRuntimeClient,
} from "testcontainers";

/** @internal Optional finite log snapshot for non-Docker container adapters. */
export interface ContainerLogSnapshotProvider {
  getLogSnapshot(tail?: number): string | Promise<string>;
}

/** @internal Reads a finite Docker log snapshot rather than following logs. */
type DockerLogContainer = ReturnType<
  ContainerRuntimeClient["container"]["getById"]
>;

export async function readContainerLogSnapshot(
  container: DockerLogContainer,
  tail?: number,
): Promise<string> {
  const inspection = await container.inspect();
  const options = {
    follow: false,
    stdout: true,
    stderr: true,
    ...(tail === undefined ? {} : { tail }),
  } as const;
  const output = await container.logs(options);
  return inspection.Config?.Tty
    ? output.toString("utf8")
    : decodeMultiplexedLogs(output);
}

/** @internal Uses an adapter snapshot when available, otherwise reads Docker logs. */
export async function readStartedContainerLogSnapshot(
  container: { getId(): string } & Partial<ContainerLogSnapshotProvider>,
  tail?: number,
): Promise<string> {
  if (typeof container.getLogSnapshot === "function") {
    return container.getLogSnapshot(tail);
  }
  const client = await getContainerRuntimeClient();
  return readContainerLogSnapshot(
    client.container.getById(container.getId()),
    tail,
  );
}

function decodeMultiplexedLogs(output: Buffer): string {
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset < output.length) {
    if (output.length - offset < 8) return output.toString("utf8");
    const streamType = output[offset];
    if (
      streamType > 2 ||
      output[offset + 1] !== 0 ||
      output[offset + 2] !== 0 ||
      output[offset + 3] !== 0
    ) {
      return output.toString("utf8");
    }
    const length = output.readUInt32BE(offset + 4);
    const end = offset + 8 + length;
    if (end > output.length) return output.toString("utf8");
    chunks.push(output.subarray(offset + 8, end));
    offset = end;
  }
  return Buffer.concat(chunks).toString("utf8");
}
