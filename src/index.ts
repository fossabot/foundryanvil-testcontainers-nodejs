/**
 * Foundry Anvil in Testcontainers: {@link AnvilOptions}, {@link AnvilContainer},
 * {@link StartedAnvilContainer} with a viem {@link AnvilTestClient}, and {@link useAnvil}.
 * Docs: https://hella-web3.github.io/foundryanvil-testcontainers-nodejs/
 * @packageDocumentation
 */
export { AnvilOptions } from "./options/anvil-options";
export {
  OptionsView,
  OptionsGroup,
  ANVIL_EXECUTABLE,
  DEFAULT_ACCOUNT_COUNT,
  DEFAULT_ANVIL_PORT,
  DEFAULT_CHAIN_ID,
  DEFAULT_DERIVATION_PATH,
  DEFAULT_MNEMONIC,
} from "./options/options-view";
export type {
  AnvilConfiguration,
  OptionsGroupName,
  StoreHandle,
} from "./options/options-view";
export { AccountOptions, ACCOUNT_FLAGS } from "./options/account-options";
export { EvmOptions, EVM_FLAGS } from "./options/evm-options";
export { ForkingOptions, FORK_FLAGS } from "./options/forking-options";
export { LoggingOptions, LOGGING_FLAGS } from "./options/logging-options";
export type { VerbosityLevel } from "./options/logging-options";
export { MiningOptions, MINING_FLAGS } from "./options/mining-options";
export { NetworkOptions, NETWORK_FLAGS } from "./options/network-options";
export { ServerOptions, SERVER_FLAGS } from "./options/server-options";
export {
  StateOptions,
  STATE_FLAGS,
  CONTAINER_FILE_PATHS,
} from "./options/state-options";
export type { Integerish } from "./options/validators";
export { MNEMONIC_WORD_COUNTS } from "./options/validators";

export {
  ANVIL_FLAGS,
  ANVIL_FLAG_LIST,
  getFlagSpec,
  groupFlags,
  isAnvilFlag,
} from "./flags/registry";
export type {
  AnvilFlag,
  FlagCategory,
  FlagSpec,
  FlagValueKind,
} from "./flags/registry";
export { ANVIL_HOST } from "./flags/flag-store";
export type { FileExport, FileImport, FlagValue } from "./flags/flag-store";

export {
  AnvilContainer,
  DEFAULT_ANVIL_IMAGE,
} from "./container/anvil-container";
export {
  StartedAnvilContainer,
  DEFAULT_GRACEFUL_STOP_TIMEOUT_MS,
  ANVIL_POLLING_INTERVAL_MS,
} from "./container/started-anvil-container";
export type {
  AnvilCheckpoint,
  TestClientAccountInput,
} from "./container/started-anvil-container";
export { AnvilReadyWaitStrategy } from "./container/wait-strategy";
export {
  loadContractAbi,
  loadContractBytecode,
  DEFAULT_ARTIFACTS_DIR,
} from "./container/artifacts";

export {
  TestClientOptions,
  DEFAULT_POLLING_INTERVAL_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_DELAY_MS,
  MULTICALL3_ADDRESS,
} from "./client/test-client-options";
export type {
  TestClientAccountSpec,
  TestClientBatchOptions,
  TestClientChainOverrides,
  TestClientConfiguration,
  TestClientTransport,
} from "./client/test-client-options";
export type { AnvilTestClient } from "./client/test-client";
export { anvilActions } from "./client/anvil-actions";
export type {
  AnvilActions,
  AnvilResetParameters,
  ConfirmTransactionParameters,
} from "./client/anvil-actions";
export { AnvilCheats } from "./client/cheats";
export { useAnvil, DEFAULT_USE_ANVIL_TIMEOUT_MS } from "./client/use-anvil";
export type {
  AnvilStartable,
  AnvilTestHooks,
  UseAnvilSettings,
} from "./client/use-anvil";
export { durationToSeconds, timestampToSeconds } from "./client/units";
export type { Duration, Timestamp } from "./client/units";
export type {
  AnvilMetadata,
  AnvilNodeInfo,
  ReorgTransaction,
} from "./client/types";

export {
  AnvilConfigurationError,
  AnvilStartupError,
  AnvilTestClientConfigurationError,
  AnvilTestClientError,
  AnvilTransactionRevertedError,
  ANVIL_TEST_CLIENT_ERROR_CODES,
} from "./errors";
export type { AnvilTestClientErrorCode } from "./errors";

export {
  Color,
  Hardfork,
  LogVerbosity,
  OpHardfork,
  Order,
  containerPath,
  isContainerPath,
} from "./types";
export type {
  Address,
  AnvilAccount,
  ContainerPath,
  FilePath,
  HexString,
  TransactionHash,
} from "./types";
