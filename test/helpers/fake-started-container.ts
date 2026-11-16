import { Readable } from "node:stream";
import {
  CommitOptions,
  ExecOptions,
  ExecResult,
  RestartOptions,
  StartedTestContainer,
  StopOptions,
  StoppedTestContainer,
} from "testcontainers";

type Labels = ReturnType<StartedTestContainer["getLabels"]>;
type FileToCopy = Parameters<
  StartedTestContainer["copyFilesToContainer"]
>[0][number];
type DirectoryToCopy = Parameters<
  StartedTestContainer["copyDirectoriesToContainer"]
>[0][number];
type ContentToCopy = Parameters<
  StartedTestContainer["copyContentToContainer"]
>[0][number];

/**
 * In-memory stand-in for a `StartedTestContainer` so `StartedAnvilContainer`
 * can be unit-tested without Docker.
 */
export class FakeStartedTestContainer implements StartedTestContainer {
  public logOutput = "";
  public archives = new Map<string, Buffer>();
  public stopCalls: Array<Partial<StopOptions> | undefined> = [];
  public readonly stopped: StoppedTestContainer;

  constructor(
    private readonly host: string,
    private readonly mappedPorts: Record<number, number>,
    private readonly id = "fake-container-id",
  ) {
    this.stopped = {
      getId: () => this.id,
      copyArchiveFromContainer: (path: string) =>
        this.copyArchiveFromContainer(path),
    };
  }

  stop(options?: Partial<StopOptions>): Promise<StoppedTestContainer> {
    this.stopCalls.push(options);
    return Promise.resolve(this.stopped);
  }
  restart(_options?: Partial<RestartOptions>): Promise<void> {
    return Promise.resolve();
  }
  commit(_options: CommitOptions): Promise<string> {
    return Promise.resolve("image-id");
  }
  getHost(): string {
    return this.host;
  }
  getHostname(): string {
    return "fake";
  }
  getFirstMappedPort(): number {
    return Object.values(this.mappedPorts)[0];
  }
  getMappedPort(port: number | `${number}/${"tcp" | "udp"}`): number {
    const key = typeof port === "number" ? port : Number(port.split("/")[0]);
    const mapped = this.mappedPorts[key];
    if (mapped === undefined) throw new Error(`No port binding for ${port}`);
    return mapped;
  }
  getName(): string {
    return "fake";
  }
  getLabels(): Labels {
    return {};
  }
  getId(): string {
    return this.id;
  }
  getNetworkNames(): string[] {
    return [];
  }
  getNetworkId(_networkName: string): string {
    return "";
  }
  getIpAddress(_networkName: string): string {
    return "127.0.0.1";
  }
  copyArchiveFromContainer(path: string): Promise<NodeJS.ReadableStream> {
    const archive = this.archives.get(path);
    if (!archive)
      return Promise.reject(new Error(`(HTTP code 404) no such file: ${path}`));
    return Promise.resolve(Readable.from([archive]));
  }
  copyArchiveToContainer(_tar: Readable, _target?: string): Promise<void> {
    return Promise.resolve();
  }
  copyDirectoriesToContainer(
    _directoriesToCopy: DirectoryToCopy[],
  ): Promise<void> {
    return Promise.resolve();
  }
  copyFilesToContainer(_filesToCopy: FileToCopy[]): Promise<void> {
    return Promise.resolve();
  }
  copyContentToContainer(_contentsToCopy: ContentToCopy[]): Promise<void> {
    return Promise.resolve();
  }
  exec(
    _command: string | string[],
    _opts?: Partial<ExecOptions>,
  ): Promise<ExecResult> {
    return Promise.resolve({ output: "", stdout: "", stderr: "", exitCode: 0 });
  }
  logs(_opts?: { since?: number; tail?: number }): Promise<Readable> {
    return Promise.resolve(Readable.from([this.logOutput]));
  }
  [Symbol.asyncDispose](): Promise<void> {
    return this.stop().then(() => undefined);
  }
}

export { buildTar } from "./tar";
