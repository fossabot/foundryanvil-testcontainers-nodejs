---
title: Read contracts efficiently
description: Contract instances, multicall without Multicall3, batching, and your own clients.
---

Read through viem; bundle many reads into one call or one HTTP request.

## Contract instances

```ts snippet="examples/test/e2e/multi-actor-flows.e2e.test.ts#contract-instance"
const tokenAsAlice = getContract({
  address: token,
  abi: exampleToken.abi,
  client: anvil.testClientFor(alice),
});

const gas = await tokenAsAlice.estimateGas.transfer([bob, 1n]);
const hash = await tokenAsAlice.write.transfer([bob, 1n]);
const receipt = await anvil.confirm(hash);

expect(receipt.gasUsed).toBeLessThanOrEqual(gas);
expect(await tokenAsAlice.read.balanceOf([bob])).toBe(1n);
```

## Many values in one call

No Multicall3 on a fresh chain? `deployless` runs it from bytecode:

```ts snippet="examples/test/e2e/multi-actor-flows.e2e.test.ts#multicall"
// No Multicall3 on this chain: `deployless` runs it from bytecode in eth_call.
const [name, supply, aliceBalance, broken] =
  await anvil.testClient.multicall({
    deployless: true,
    allowFailure: true,
    contracts: [
      { address: token, abi: exampleToken.abi, functionName: "name" },
      {
        address: token,
        abi: exampleToken.abi,
        functionName: "totalSupply",
      },
      {
        address: token,
        abi: exampleToken.abi,
        functionName: "balanceOf",
        args: [alice],
      },
      { address: bob, abi: exampleToken.abi, functionName: "totalSupply" }, // not a contract
    ],
  });
expect(name).toEqual({ status: "success", result: "Example Token" });
expect(supply.result).toBe(parseEther("50"));
expect(aliceBalance.result).toBe(parseEther("50"));
expect(broken.status).toBe("failure"); // reported, not thrown
```

On forks of chains that have Multicall3, register it instead:
`withTestClient((client) => client.withMulticall3())`.

## Batch concurrent requests

```ts snippet="examples/test/e2e/multi-actor-flows.e2e.test.ts#batching"
const batched = await anvil.createTestClient(
  (client) => client.withBatch({ wait: 5 }), // collect requests for 5 ms per HTTP call
);
const balances = await Promise.all(
  addresses.map((address) => balanceOf(batched, token, address)),
);
```

## Your own clients

```ts snippet="examples/test/e2e/multi-actor-flows.e2e.test.ts#own-client"
// e.g. the client your application code already creates:
const appClient = createPublicClient({
  chain: anvil.chain, // id, name and URLs of this node
  transport: http(anvil.rpcUrl),
}).extend(anvilActions); // add the anvil extras to any viem client

await appClient.addBalance({ address: alice, value: parseEther("1") });
const balance = await appClient.readContract({
  address: token,
  abi: exampleToken.abi,
  functionName: "balanceOf",
  args: [alice],
});
expect(balance).toBe(parseEther("50"));
```

## Deep dive

- [Configure the test client](../configure/test-client.md)
- [Architecture: node, test client, cheats](../../deep-dives/architecture.md)
