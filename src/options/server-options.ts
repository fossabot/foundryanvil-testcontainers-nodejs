import { groupFlags } from "../flags/registry";
import {
  OptionsGroup,
  registerOptionsGroup,
  StoreHandle,
} from "./options-view";
import { integerArg, Integerish, portArg, stringArg } from "./validators";

/** Flags of {@link ServerOptions}. */
export const SERVER_FLAGS = groupFlags("server");

/**
 * RPC server (`.server`). The listen address is managed (`0.0.0.0`); the
 * configured port is exposed and mapped to a random host port.
 */
export class ServerOptions extends OptionsGroup {
  protected readonly groupName = "server";

  /** @internal */
  constructor(store: StoreHandle) {
    super(store);
  }

  /** Port inside the container (`--port`, default 8545). */
  public withPort(port: Integerish): this {
    return this.setValue("--port", String(portArg("--port", port)));
  }

  /** IPC server at a container path, default `/tmp/anvil.ipc` (`--ipc`). */
  public withIpc(path?: string): this {
    return this.setValue(
      "--ipc",
      path === undefined ? null : stringArg("--ipc", path, "IPC path"),
    );
  }

  /** Worker threads; 0 = logical cores (`--threads`). */
  public withThreads(threads: Integerish): this {
    return this.setValue("--threads", integerArg("--threads", threads));
  }

  /** CORS allow-origin (`--allow-origin`, default `*`). Conflicts with `noCors`. */
  public withAllowOrigin(origin: string): this {
    return this.setValue(
      "--allow-origin",
      stringArg("--allow-origin", origin, "origin"),
    );
  }

  /** Disable CORS (`--no-cors`). Conflicts with `withAllowOrigin`. */
  public noCors(enabled = true): this {
    return this.toggleFlag("--no-cors", enabled);
  }

  /** Disable the 2 MB request body limit (`--no-request-size-limit`). */
  public noRequestSizeLimit(enabled = true): this {
    return this.toggleFlag("--no-request-size-limit", enabled);
  }

  /** Container directory for persisted states (`--cache-path`). */
  public withCachePath(path: string): this {
    return this.setValue(
      "--cache-path",
      stringArg("--cache-path", path, "cache path"),
    );
  }
}

registerOptionsGroup("server", (store) => new ServerOptions(store));
