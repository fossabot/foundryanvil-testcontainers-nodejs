/**
 * Where the examples' e2e tests run anvil: in Docker (default, what CI must
 * use) or as a local binary (`npm run test:e2e -- --no-docker`, local testing
 * only). The mode is set by scripts/e2e.mjs; in local mode every
 * `new AnvilContainer(…)` runs anvil as a local process (see
 * setup-runtime.ts), so the examples use the library exactly as documented.
 */
import type {
  AnvilContainer,
  StartedAnvilContainer,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import { Network } from "testcontainers";
import type { Account } from "viem";

export type E2EMode = "docker" | "local";

/** The runtime selected by scripts/e2e.mjs (Docker unless `--no-docker`). */
export function e2eMode(env: NodeJS.ProcessEnv = process.env): E2EMode {
  return env.EXAMPLES_E2E_MODE === "local" ? "local" : "docker";
}

export const E2E_MODE: E2EMode = e2eMode();

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
