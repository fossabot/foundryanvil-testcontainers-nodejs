---
title: Catch misconfiguration in unit tests
description: Test anvil and test-client configuration without Docker.
---

Setters validate immediately and reject conflicting flags:

```ts snippet="examples/test/unit/configuration.test.ts#conflicts"
expect(() =>
  new AnvilOptions().mining.withNoMining().mining.withBlockTime(1),
).toThrow(AnvilConfigurationError);
```

`prepare()` checks the test client against the anvil options, without
starting anything:

```ts snippet="examples/test/unit/configuration.test.ts#pre-start"
const container = new AnvilContainer(
  new AnvilOptions().account.withAccounts(2),
).withTestClient((client) => client.withAccount(5));

expect(() => container.prepare()).toThrow(
  AnvilTestClientConfigurationError,
);
expect(() => container.prepare()).toThrow(
  /dev account 5 does not exist: anvil is configured with 2 account\(s\)/,
);
```

Dependencies that need the whole configuration (e.g. fork options without a
fork URL) are reported by `validate()`, `problems()` and `build()`:

```ts snippet="examples/test/unit/options.test.ts#validate"
// Setters reject conflicts at once; dependencies need the whole picture.
const incomplete = new AnvilOptions().fork.withRetries(3); // no fork URL yet
expect(() => incomplete.validate()).toThrow(AnvilConfigurationError);

const [problem] = incomplete.problems(); // the same, without throwing
expect(problem.flag).toBe("--retries");
expect(problem.relatedFlags).toEqual(["--fork-url"]);

const configuration = incomplete.fork
  .withForkUrl("https://rpc.example", 19_000_000)
  .build(); // validate() + freeze
expect(configuration.forking).toBe(true);
expect(configuration.command).toContain("--fork-block-number");
expect(Object.isFrozen(configuration)).toBe(true);
```

## Concepts

- [Validation model](../../concepts/validation.md)
- Reference: [Flag rules](../../reference/flag-rules.md), [Errors](../../reference/errors.md)
