import {
  type Account,
  type Chain,
  createTestClient,
  defineChain,
  http,
  type PublicActions,
  publicActions,
  type TestClient,
  type Transport,
  type WalletActions,
  walletActions,
  webSocket,
  numberToHex,
} from "viem";
import {
  type AnvilActionHooks,
  type AnvilActions,
  createAnvilActions,
} from "./anvil-actions";
import {
  TestClientOptions,
  type TestClientChainOverrides,
  type TestClientConfiguration,
} from "./test-client-options";

/**
 * viem test client (`mode: "anvil"`) with public, wallet and {@link AnvilActions},
 * bound to the node's chain. With a default account (`TAccount`), actions need no `account`.
 */
export type AnvilTestClient<TAccount extends Account | undefined = undefined> =
  TestClient<"anvil", Transport, Chain, TAccount> &
    PublicActions<Transport, Chain, TAccount> &
    WalletActions<Chain, TAccount> &
    AnvilActions;

/** @internal Everything needed to build a test client for a node. */
export interface AnvilTestClientContext {
  readonly chain: Chain;
  readonly rpcUrl: string;
  readonly configuration: TestClientConfiguration;
  readonly account?: Account;
  /** Throws when the node can no longer be used (e.g. after `stop()`). */
  readonly assertUsable?: () => void;
  readonly hooks?: AnvilActionHooks;
}

/** @internal Default test client configuration. */
export const DEFAULT_TEST_CLIENT_CONFIGURATION: TestClientConfiguration =
  new TestClientOptions().build();

/** @internal `http://…` → `ws://…`. */
export function toWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, "ws");
}

/** @internal The viem `Chain` of a node (id and URLs from the node). */
export function createAnvilChain(
  chainId: number,
  rpcUrl: string,
  overrides: TestClientChainOverrides = {},
): Chain {
  return defineChain({
    name: `Anvil (${chainId})`,
    nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
    ...overrides,
    id: chainId,
    rpcUrls: { default: { http: [rpcUrl], webSocket: [toWsUrl(rpcUrl)] } },
  });
}

/**
 * Rejects requests after stop, answers `eth_chainId` from `chain` (viem asks
 * before every node-signed send), and reports chain id changes to the hooks.
 */
function guardTransport(
  transport: Transport,
  chain: Chain,
  assertUsable: (() => void) | undefined,
  hooks: AnvilActionHooks = {},
): Transport {
  return (parameters: Parameters<Transport>[0]) => {
    const created = transport(parameters);
    const { request } = created;
    return {
      ...created,
      request: (async (args, options) => {
        assertUsable?.();
        if (args.method === "eth_chainId") return numberToHex(chain.id);
        const result: unknown = await request(args, options);
        if (args.method === "anvil_setChainId") {
          const [chainId] = (args.params ?? []) as unknown[];
          hooks.onChainIdChanged?.(
            typeof chainId === "string"
              ? Number(BigInt(chainId))
              : Number(chainId),
          );
        } else if (args.method === "anvil_reset") {
          await hooks.onReset?.();
        }
        return result;
      }) as typeof request,
    };
  };
}

/** @internal Creates the transport selected by the configuration. */
export function createAnvilTransport(
  rpcUrl: string,
  configuration: TestClientConfiguration,
): Transport {
  const { timeout, retryCount, retryDelay } = configuration;
  if (configuration.transport === "webSocket") {
    return webSocket(toWsUrl(rpcUrl), { timeout, retryCount, retryDelay });
  }
  return http(rpcUrl, {
    batch: configuration.batch === false ? false : { ...configuration.batch },
    timeout,
    retryCount,
    retryDelay,
  });
}

/** @internal Client tuned for a local node: no response cache, fast polling, local chain id. */
export function createAnvilTestClient<
  TAccount extends Account | undefined = undefined,
>(context: AnvilTestClientContext): AnvilTestClient<TAccount> {
  const { chain, rpcUrl, configuration, account } = context;
  return createTestClient({
    chain,
    mode: "anvil",
    account,
    transport: guardTransport(
      createAnvilTransport(rpcUrl, configuration),
      chain,
      context.assertUsable,
      context.hooks,
    ),
    cacheTime: configuration.cacheTime,
    pollingInterval: configuration.pollingInterval,
  })
    .extend(publicActions)
    .extend(walletActions)
    .extend(createAnvilActions()) as unknown as AnvilTestClient<TAccount>;
}
