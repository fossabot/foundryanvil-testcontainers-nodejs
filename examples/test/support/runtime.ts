/**
 * Where the examples' e2e tests run anvil: in Docker (default, what CI must
 * use) or as a local binary (`npm run test:e2e -- --no-docker`, local testing
 * only). The mode is set by scripts/e2e.mjs.
 */
import {
  AnvilContainer,
  AnvilOptions,
  type StartedAnvilContainer,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import { Network } from "testcontainers";
import type { Account } from "viem";
import { LocalAnvilContainer } from "./local-anvil";

export type E2EMode = "docker" | "local";

export const E2E_MODE: E2EMode =
  process.env.EXAMPLES_E2E_MODE === "local" ? "local" : "docker";

/**
 * `new AnvilContainer(options)` — or, with `--no-docker`, the same container
 * backed by a local anvil process. Everything else in the examples is plain
 * library API.
 */
export function anvilContainer(
  options: AnvilOptions = new AnvilOptions(),
): AnvilContainer {
  return E2E_MODE === "local"
    ? new LocalAnvilContainer(options)
    : new AnvilContainer(options);
}

/**
 * Lets nodes reach each other (e.g. a fork and its upstream): in Docker a
 * shared network where nodes are addressed by alias, with `--no-docker` the
 * loopback interface.
 */
export interface NodeNetwork {
  /** Joins the network under `aliases` (no-op locally). */
  attach<A extends Account | undefined>(
    container: AnvilContainer<A>,
    ...aliases: string[]
  ): AnvilContainer<A>;
  /** JSON-RPC URL of a started node as seen by the other nodes. */
  urlOf(node: Pick<StartedAnvilContainer, "rpcUrl">, alias: string): string;
  stop(): Promise<void>;
}

export async function startNetwork(): Promise<NodeNetwork> {
  if (E2E_MODE === "local") {
    return {
      attach: (container) => container,
      urlOf: (node) => node.rpcUrl,
      stop: () => Promise.resolve(),
    };
  }
  const network = await new Network().start();
  return {
    attach: (container, ...aliases) => {
      container.withNetwork(network);
      if (aliases.length > 0) container.withNetworkAliases(...aliases);
      return container;
    },
    urlOf: (_node, alias) => `http://${alias}:8545`,
    stop: async () => {
      await network.stop();
    },
  };
}
