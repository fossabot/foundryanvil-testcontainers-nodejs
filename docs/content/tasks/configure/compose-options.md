---
title: Compose and inspect options
description: Share presets, swap flags, pass new anvil flags through, and inspect the command line.
---

`AnvilOptions` can be copied, combined and inspected before anything starts.

## Presets and copies

```ts snippet="examples/test/unit/options.test.ts#compose"
const richAccounts = (options: AnvilOptions) =>
  options.account.withAccounts(3).withBalance(1_000_000);
const fastBlocks = (options: AnvilOptions) =>
  options.mining.withBlockTime(1);

const base = new AnvilOptions().apply(richAccounts); // run presets
const ci = base.clone().apply(fastBlocks); // independent copy
const onDemand = ci.clone().unset("--block-time").mining.withNoMining(); // swap a conflicting flag

expect(base.toCommand()).toBe(
  "anvil --host 0.0.0.0 --accounts 3 --balance 1000000",
);
expect(ci.has("--block-time")).toBe(true);
expect(onDemand.root().toArgs()).toContain("--no-mining");
```

## Reset a group

```ts snippet="examples/test/unit/options.test.ts#group-reset"
const options = new AnvilOptions().mining
  .withBlockTime(2)
  .withMixedMining()
  .evm.withChainId(10);

options.mining.reset(); // removes every mining flag, nothing else
expect(options.toCommand()).toBe("anvil --host 0.0.0.0 --chain-id 10");

// withAutoMining() removes just the mining mode flags.
const auto = new AnvilOptions().mining.withNoMining().withAutoMining();
expect(auto.has("--no-mining")).toBe(false);
```

## Flags newer than the library

```ts snippet="examples/test/unit/options.test.ts#extra-args"
const options = new AnvilOptions().withExtraArgs("--some-new-flag", "1");
expect(options.toCommand()).toBe("anvil --host 0.0.0.0 --some-new-flag 1");

// Known flags must use the fluent API, so validation cannot be bypassed.
expect(() => new AnvilOptions().withExtraArgs("--accounts", "1")).toThrow(
  /known anvil flag/,
);
```

## Inspect

```ts snippet="examples/test/unit/options.test.ts#inspect"
const options = new AnvilOptions().account
  .withAccounts(2)
  .evm.withChainId(8453);

expect(options.has("--chain-id")).toBe(true);
expect(options.get("--accounts")).toBe("2");
expect(options.flags()).toEqual({
  "--accounts": "2",
  "--chain-id": "8453",
}); // --host is managed by the container: rendered, not configurable
expect(options.toArgs()).toEqual([
  "--host",
  "0.0.0.0",
  "--accounts",
  "2",
  "--chain-id",
  "8453",
]);
expect(options.entryPoint[0]).toBe("anvil");
expect(options.toJSON().command).toEqual(options.entryPoint);
```

A container shows its options and the prepared command without Docker:

```ts snippet="examples/test/unit/configuration.test.ts#container-getters"
const options = new AnvilOptions().mining.withBlockTime(2);
const container = new AnvilContainer(options).withTestClient((client) =>
  client.withAccount(0),
);

expect(container.anvilOptions).toBe(options);
expect(container.testClientOptions.build().account?.kind).toBe("index");
expect(container.prepare().command.join(" ")).toBe(
  "anvil --host 0.0.0.0 --block-time 2",
);
```

## Validate

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

## The flag registry

```ts snippet="examples/test/unit/options.test.ts#registry"
const spec = getFlagSpec("--fork-url");
expect(spec.aliases).toEqual(["-f", "--rpc-url"]);
expect(spec.methods).toEqual(["fork.withForkUrl()"]);

expect(isAnvilFlag("--state-interval")).toBe(true);
expect(getFlagSpec("--state-interval").requiresAnyOf).toEqual([
  "--dump-state",
  "--state",
]);
expect(groupFlags("mining")).toContain("--no-mining");
expect(ANVIL_FLAGS.size).toBe(ANVIL_FLAG_LIST.length);
```

## Concepts

- [Validation model](../../concepts/validation.md)
- Reference: [`AnvilOptions`](../../reference/anvil-options.md), [Flag rules](../../reference/flag-rules.md)
