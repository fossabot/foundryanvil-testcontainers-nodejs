---
title: Exports
description: Functions, classes, enums, constants and types exported by the package.
---

```text
import { … } from "@hellaweb3/foundryanvil-testcontainers-nodejs";
```

## Classes

`AnvilOptions`, the option groups `AccountOptions`, `EvmOptions`,
`ForkingOptions`, `LoggingOptions`, `MiningOptions`, `NetworkOptions`,
`ServerOptions`, `StateOptions` (bases `OptionsView`, `OptionsGroup`),
[`AnvilContainer`](anvil-container.md),
[`StartedAnvilContainer`](started-anvil-container.md),
[`AnvilReadyWaitStrategy`](anvil-container.md),
[`TestClientOptions`](test-client-options.md), [`AnvilCheats`](cheats.md),
and the [errors](errors.md).

## Functions

| Function | Description |
|---|---|
| `useAnvil(container, settings?)` | [test lifecycle hooks](use-anvil.md) |
| `anvilActions` | decorator adding the [anvil extras](anvil-actions.md) to any viem client |
| `loadContractAbi(location, dir?)` | ABI from a plain array or a Foundry/Hardhat artifact |
| `loadContractBytecode(location, dir?)` | bytecode from a hex `.bin` or an artifact's `bytecode` |
| `containerPath(path)` / `isContainerPath(value)` | mark / detect a path inside the container (not copied) |
| `durationToSeconds(duration)` / `timestampToSeconds(timestamp)` | the time conversions used by the helpers |
| `getFlagSpec(flag)` / `isAnvilFlag(value)` / `groupFlags(group)` | flag registry lookups |

## Enums

<!-- generated:enum:Hardfork -->
| `Hardfork` member | Value |
|---|---|
| `Hardfork.Frontier` | `"frontier"` |
| `Hardfork.Homestead` | `"homestead"` |
| `Hardfork.Dao` | `"dao"` |
| `Hardfork.Tangerine` | `"tangerine"` |
| `Hardfork.SpuriousDragon` | `"spuriousdragon"` |
| `Hardfork.Byzantium` | `"byzantium"` |
| `Hardfork.Constantinople` | `"constantinople"` |
| `Hardfork.Petersburg` | `"petersburg"` |
| `Hardfork.Istanbul` | `"istanbul"` |
| `Hardfork.MuirGlacier` | `"muirglacier"` |
| `Hardfork.Berlin` | `"berlin"` |
| `Hardfork.London` | `"london"` |
| `Hardfork.ArrowGlacier` | `"arrowglacier"` |
| `Hardfork.GrayGlacier` | `"grayglacier"` |
| `Hardfork.Paris` | `"paris"` |
| `Hardfork.Shanghai` | `"shanghai"` |
| `Hardfork.Cancun` | `"cancun"` |
| `Hardfork.Prague` | `"prague"` |
| `Hardfork.Osaka` | `"osaka"` |
| `Hardfork.Latest` | `"latest"` |
<!-- /generated -->

<!-- generated:enum:OpHardfork -->
| `OpHardfork` member | Value |
|---|---|
| `OpHardfork.Bedrock` | `"bedrock"` |
| `OpHardfork.Regolith` | `"regolith"` |
| `OpHardfork.Canyon` | `"canyon"` |
| `OpHardfork.Ecotone` | `"ecotone"` |
| `OpHardfork.Fjord` | `"fjord"` |
| `OpHardfork.Granite` | `"granite"` |
| `OpHardfork.Holocene` | `"holocene"` |
| `OpHardfork.Isthmus` | `"isthmus"` |
| `OpHardfork.Interop` | `"interop"` |
| `OpHardfork.Jovian` | `"jovian"` |
<!-- /generated -->

<!-- generated:enum:Order -->
| `Order` member | Value |
|---|---|
| `Order.Fees` | `"fees"` |
| `Order.Fifo` | `"fifo"` |
<!-- /generated -->

<!-- generated:enum:Color -->
| `Color` member | Value |
|---|---|
| `Color.Auto` | `"auto"` |
| `Color.Always` | `"always"` |
| `Color.Never` | `"never"` |
<!-- /generated -->

<!-- generated:enum:LogVerbosity -->
| `LogVerbosity` member | Value |
|---|---|
| `LogVerbosity.One` | `1` |
| `LogVerbosity.Two` | `2` |
| `LogVerbosity.Three` | `3` |
| `LogVerbosity.Four` | `4` |
| `LogVerbosity.Five` | `5` |
<!-- /generated -->

## Constants

Generated from the package's exports:

<!-- generated:constants -->
| Constant | Value |
|---|---|
| `ANVIL_EXECUTABLE` | `"anvil"` |
| `ANVIL_HOST` | `"0.0.0.0"` |
| `ANVIL_POLLING_INTERVAL_MS` | `25` |
| `DEFAULT_ACCOUNT_COUNT` | `10` |
| `DEFAULT_ANVIL_IMAGE` | `"ghcr.io/foundry-rs/foundry:v1.6.0-rc1"` |
| `DEFAULT_ANVIL_PORT` | `8545` |
| `DEFAULT_ARTIFACTS_DIR` | `"test/artifacts"` |
| `DEFAULT_CHAIN_ID` | `31337` |
| `DEFAULT_DERIVATION_PATH` | `"m/44'/60'/0'/0/"` |
| `DEFAULT_GRACEFUL_STOP_TIMEOUT_MS` | `30000` |
| `DEFAULT_MNEMONIC` | `"test test test test test test test test test test test junk"` |
| `DEFAULT_POLLING_INTERVAL_MS` | `25` |
| `DEFAULT_REQUEST_TIMEOUT_MS` | `10000` |
| `DEFAULT_RETRY_COUNT` | `3` |
| `DEFAULT_RETRY_DELAY_MS` | `150` |
| `DEFAULT_USE_ANVIL_TIMEOUT_MS` | `120000` |
| `MNEMONIC_WORD_COUNTS` | `[12,15,18,21,24]` |
| `MULTICALL3_ADDRESS` | `"0xcA11bde05977b3631167028862bE2a173976CA11"` |
<!-- /generated -->

Also: `ANVIL_FLAGS` / `ANVIL_FLAG_LIST` (every `FlagSpec`), the group flag
lists `ACCOUNT_FLAGS`, `EVM_FLAGS`, `FORK_FLAGS`, `LOGGING_FLAGS`,
`MINING_FLAGS`, `NETWORK_FLAGS`, `SERVER_FLAGS`, `STATE_FLAGS`,
`CONTAINER_FILE_PATHS` and `ANVIL_TEST_CLIENT_ERROR_CODES` ([Errors](errors.md)).

## Types

| Type | Description |
|---|---|
| `AnvilTestClient<TAccount>` | the [test client](test-client.md) |
| `AnvilActions`, `AnvilResetParameters`, `ConfirmTransactionParameters`, `ReorgTransaction`, `AnvilNodeInfo`, `AnvilMetadata` | [anvil extras](anvil-actions.md) |
| `TestClientConfiguration`, `TestClientTransport`, `TestClientBatchOptions`, `TestClientChainOverrides`, `TestClientAccountSpec`, `TestClientAccountInput` | [test client settings](test-client-options.md) |
| `UseAnvilSettings`, `AnvilTestHooks`, `AnvilStartable` | [`useAnvil()`](use-anvil.md) |
| `AnvilCheckpoint` | `{ id, restore() }` from `checkpoint()` |
| `AnvilConfiguration`, `AnvilFlag`, `FlagSpec`, `FlagCategory`, `FlagValueKind`, `FlagValue`, `FileImport`, `FileExport`, `OptionsGroupName`, `StoreHandle`, `VerbosityLevel`, `Integerish` | [options and flags](anvil-options.md) |
| `AnvilAccount` | `{ index, address, privateKey? }` from `accounts()` |
| `Duration`, `Timestamp` | seconds or `{ weeks, days, hours, minutes, seconds }`; seconds or a `Date` |
| `AnvilTestClientErrorCode` | [error codes](errors.md) |
| `Address`, `HexString`, `TransactionHash`, `ContainerPath`, `FilePath` | hex strings and file paths |
