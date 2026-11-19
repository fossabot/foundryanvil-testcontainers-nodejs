---
title: Errors
description: Error classes, their fields, and AnvilTestClientError codes.
---

| Error | When | Fields |
|---|---|---|
| `AnvilConfigurationError` | invalid value, conflict, unmet dependency, missing host file | `flag`, `relatedFlags` |
| `AnvilTestClientConfigurationError` | invalid test client setting, or one that contradicts the anvil options (before start); extends `AnvilConfigurationError` | `setting`, `flag`, `relatedFlags` |
| `AnvilStartupError` | anvil exited / not ready / Docker failure / default account not resolvable | `command`, `logs`, `cause` |
| `AnvilTestClientError` | runtime misuse or failure | `code`, `cause` |
| `AnvilTransactionRevertedError` | `confirm()` / `confirmTransaction()` of a reverted transaction; extends `AnvilTestClientError` | `code`, `hash`, `receipt`, `reason` |

## `AnvilTestClientError` codes

Generated from `ANVIL_TEST_CLIENT_ERROR_CODES` (type
`AnvilTestClientErrorCode`):

<!-- generated:error-codes -->
| `code` | Meaning |
|---|---|
| `CONTAINER_STOPPED` | the node was stopped; the client can no longer be used |
| `SNAPSHOT_NOT_FOUND` | evm_revert target does not exist (already reverted, or cleared by reset / loadState) |
| `NOT_STARTED` | useAnvil() handle used before beforeAll started the node |
| `TEST_HOOKS_UNAVAILABLE` | useAnvil() found no beforeAll / afterAll hooks |
| `ACCOUNT_UNAVAILABLE` | the configured default account could not be resolved on the node |
| `TRANSACTION_REVERTED` | a transaction was mined but reverted |
| `CHEAT_FAILED` | a step of an AnvilCheats chain failed |
| `CHEATS_ALREADY_RUN` | an AnvilCheats chain was extended after it had run |
<!-- /generated -->

```ts snippet="examples/test/e2e/lifecycle.e2e.test.ts#after-stop"
const anvil = await new AnvilContainer().start();
const client = anvil.testClient;
await anvil.stop();

expect(anvil.isStopped).toBe(true);
const error = await client.getBlockNumber().catch((e: unknown) => e);
expect(error).toBeInstanceOf(AnvilTestClientError);
expect((error as AnvilTestClientError).code).toBe("CONTAINER_STOPPED");
```

viem's own errors (reverts, RPC errors) are thrown as they are: match them
by `name`, not `instanceof`
([why](../tasks/transactions/assert-reverts.md)).
