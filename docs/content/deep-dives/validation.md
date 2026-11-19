---
title: Validation model
description: What is checked when — from setters to startup — and which error you get.
---

| When | What | Error |
|---|---|---|
| setter call | value types, ranges and formats (ports, hex, mnemonics, URLs, headers, paths) | `AnvilConfigurationError` (`flag`) |
| setter call | conflicts with flags already set | `AnvilConfigurationError` (`flag`, `relatedFlags`) |
| `withExtraArgs()` | known flags must use the fluent API | `AnvilConfigurationError` |
| `validate()` / `build()` / `prepare()` / `start()` | dependencies between flags, hardfork family | `AnvilConfigurationError` (one listing every problem) |
| `prepare()` / `start()` | host files exist and are files | `AnvilConfigurationError` |
| test client setter | setting values | `AnvilTestClientConfigurationError` (`setting`) |
| `prepare()` / `start()` / `createTestClient()` | test client vs. anvil flags | `AnvilTestClientConfigurationError` (`setting`, `flag`, `relatedFlags`) |
| `start()` | anvil exits, never answers, Docker fails | `AnvilStartupError` (`command`, `logs`) |

Everything up to `prepare()` runs without Docker
([unit-test it](../tasks/test-suites/catch-misconfiguration.md)).

## Where the rules come from

The [flag registry](../reference/flag-rules.md) mirrors `anvil --help`. The
end-to-end suite runs every flag and every pair through anvil's own parser,
expecting the same verdict, and boots every flag and hardfork. A few rules are
stricter than anvil where it ignores a flag. Newer flags: `withExtraArgs()`.

Related: [Errors](../reference/errors.md).
