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
 * The pre-configured viem test client of a started node: every viem test
 * action (`mode: "anvil"`), public action and wallet action, plus
 * {@link AnvilActions}. Bound to the node's actual chain id.
 *
 * `TAccount` is the default account type: with one configured
 * (`TestClientOptions.withAccount()`), actions need no `account` argument.
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

function guardTransport(
  transport: Transport,
  assertUsable: (() => void) | undefined,
): Transport {
  if (!assertUsable) return transport;
  return (parameters: Parameters<Transport>[0]) => {
    const created = transport(parameters);
    const { request } = created;
    return {
      ...created,
      request: async (args, options) => {
        assertUsable();
        return request(args, options);
      },
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

/**
 * @internal Client tuned for a local node: no response caching (viem caches
 * e.g. the block number for 4 s by default) and fast polling.
 */
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
      context.assertUsable,
    ),
    cacheTime: configuration.cacheTime,
    pollingInterval: configuration.pollingInterval,
  })
    .extend(publicActions)
    .extend(walletActions)
    .extend(
      createAnvilActions(context.hooks),
    ) as unknown as AnvilTestClient<TAccount>;
}
