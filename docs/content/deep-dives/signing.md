---
title: "Signing: anvil-signed vs. locally signed"
description: Who signs a transaction changes when reverts surface, which chain id is used, and which keys are needed.
---

| | Signed by anvil | Signed locally |
|---|---|---|
| How | `eth_sendTransaction` from an unlocked address | `eth_sendRawTransaction` with a key in the client |
| Accounts | dev accounts, impersonated addresses, `autoImpersonate()` | `withLocalAccount()`, `testClientFor(privateKeyToAccount(key))` |
| Reverting writes | sent as-is, **mined**, receipt `status: "reverted"` | viem estimates gas first: the decoded revert is thrown, **nothing is sent** |
| After `setChainId()` | fail: anvil's signer keeps the startup chain id | work |
| Keys needed | no | yes: from the mnemonic, the banner, or your own |

To assert a revert *reason*, simulate or sign locally; to test what happens
*on chain*, send anvil-signed and check the receipt (`confirm()`).

## Where local keys come from

- Default mnemonic: built in. `withMnemonic()`: derived once.
- Random or seeded mnemonic: read from anvil's banner, so not with
  `logs.quiet()` (`withLocalAccount(index)` is then rejected before start).

## `withAccount(address, { impersonate: true })`

anvil signs only for dev accounts and impersonated addresses: a non-dev
default address needs `{ impersonate: true }` or `account.autoImpersonate()`,
or `prepare()` rejects it.

Related: [Sign locally](../tasks/accounts/sign-locally.md),
[Assert reverts](../tasks/transactions/assert-reverts.md).
