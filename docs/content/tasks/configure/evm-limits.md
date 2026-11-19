---
title: Configure EVM limits
description: Contract size, memory, block gas limit, the CREATE2 deployer and mempool balance checks.
---

Set EVM limits with `.evm` options; some can change at runtime.

## Contract size (EIP-170)

```ts snippet="examples/test/e2e/node-configuration.e2e.test.ts#code-size"
const strict = useAnvil(
  new AnvilContainer().withTestClient((client) => client.withAccount(0)),
);
const raised = useAnvil(
  new AnvilContainer(
    new AnvilOptions().evm.withCodeSizeLimit(32_768),
  ).withTestClient((client) => client.withAccount(0)),
);

it("rejects contracts over 24,576 bytes by default", async () => {
  const hash = await strict.testClient.deployContract({
    abi: oversizedContract.abi,
    bytecode: oversizedContract.bytecode, // deploys 24,577 bytes
  });
  await expect(strict.confirm(hash)).rejects.toBeInstanceOf(
    AnvilTransactionRevertedError,
  );
});

it("deploys them with a raised limit (e.g. unoptimised debug builds)", async () => {
  const { contractAddress } = await raised.confirm(
    raised.testClient.deployContract({
      abi: oversizedContract.abi,
      bytecode: oversizedContract.bytecode,
    }),
  );
  const code = await raised.testClient.getCode({
    address: contractAddress!,
  });
  expect((code!.length - 2) / 2).toBe(24_577);
});
```

```ts snippet="examples/test/e2e/node-configuration.e2e.test.ts#no-code-size-limit"
const unlimited = useAnvil(
  new AnvilContainer(
    new AnvilOptions().evm.disableCodeSizeLimit(),
  ).withTestClient((client) => client.withAccount(0)),
);

it("deploys contracts of any size without a limit", async () => {
  const receipt = await unlimited.confirm(
    unlimited.testClient.deployContract({
      abi: oversizedContract.abi,
      bytecode: oversizedContract.bytecode,
    }),
  );
  expect(receipt.status).toBe("success");
});
```

## Memory

```ts snippet="examples/test/unit/options.test.ts#memory-limit"
const options = new AnvilOptions().evm.withMemoryLimit(1n << 30n); // bytes
expect(options.toCommand()).toBe(
  "anvil --host 0.0.0.0 --memory-limit 1073741824",
);
```

## Block gas limit

```ts snippet="examples/test/e2e/node-configuration.e2e.test.ts#block-gas-limit"
const limited = useAnvil(new AnvilContainer());
const unlimited = useAnvil(
  new AnvilContainer(new AnvilOptions().evm.disableBlockGasLimit()),
);

it("rejects transactions above the block gas limit by default", async () => {
  const [alice, bob] = await limited.addresses();
  await expect(
    limited.testClient.sendTransaction({
      account: alice,
      to: bob,
      gas: 100_000_000n,
    }),
  ).rejects.toThrow(/gas/);
});

it("accepts them without a block gas limit (gas-heavy tests, fuzzing)", async () => {
  const [alice, bob] = await unlimited.addresses();
  const receipt = await unlimited.confirm(
    unlimited.testClient.sendTransaction({
      account: alice,
      to: bob,
      gas: 100_000_000n,
    }),
  );
  expect(receipt.status).toBe("success");
});
```

`evm.withGasLimit(gas)` sets it at start, `cheats.setBlockGasLimit()` at
runtime ([Control block contents](../time-and-blocks/build-blocks.md)).

## The default CREATE2 deployer

```ts snippet="examples/test/e2e/node-configuration.e2e.test.ts#create2"
const node = useAnvil(
  new AnvilContainer().withTestClient((client) => client.withAccount(0)),
);
const bare = useAnvil(
  new AnvilContainer(
    new AnvilOptions().evm.disableDefaultCreate2Deployer(),
  ),
);

it("deploys to a precomputed address through the CREATE2 deployer", async () => {
  const salt = `0x${"00".repeat(31)}2a` as const;
  const predicted = getContractAddress({
    opcode: "CREATE2",
    from: CREATE2_DEPLOYER,
    salt,
    bytecode: fixedPriceOracle.bytecode,
  });
  // The deployer's calldata is simply salt ‖ creation code.
  await node.confirm(
    node.testClient.sendTransaction({
      to: CREATE2_DEPLOYER,
      data: concat([salt, fixedPriceOracle.bytecode]),
    }),
  );
  expect(
    await node.testClient.getCode({ address: predicted }),
  ).toBeDefined();
});

it("can start without the deployer (e.g. to deploy your own)", async () => {
  expect(
    await bare.testClient.getCode({ address: CREATE2_DEPLOYER }),
  ).toBeUndefined();
});
```

## Mempool balance checks

```ts snippet="examples/test/e2e/node-configuration.e2e.test.ts#pool-balance-checks"
// Accept transactions whose sender cannot pay (yet): fund it before mining.
const node = useAnvil(
  new AnvilContainer(
    new AnvilOptions().mining.withNoMining().evm.disablePoolBalanceChecks(),
  ),
);

it("queues a transaction from an unfunded sender", async () => {
  const user = privateKeyToAccount(generatePrivateKey()).address;
  const [alice] = await node.addresses();
  const hash = await node.testClient.sendUnsignedTransaction({
    from: user,
    to: alice,
    value: parseEther("1"),
  });
  expect((await node.testClient.getTxpoolStatus()).pending).toBe(1);

  await node.cheats.setBalanceEther(user, 2).mine();
  const receipt = await node.testClient.getTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
});
```

## Deep dive

- Reference: [`.evm` options](../../reference/anvil-options.md#evm)
