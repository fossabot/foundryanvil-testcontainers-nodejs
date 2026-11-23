---
title: Load contract artifacts
description: Load ABIs and bytecode from Foundry, Hardhat or plain files and deploy them.
---

`loadContractAbi()` / `loadContractBytecode()` read plain ABI / `.bin` files or
Foundry/Hardhat artifacts:

```ts snippet="examples/src/artifacts.ts#load-artifact"
/** Loads `artifacts/<name>/<name>.json` and `.bin`. */
export function loadArtifact(name: string): ContractArtifact {
  return {
    name,
    abi: loadContractAbi(`${name}/${name}.json`, ARTIFACTS_DIR),
    bytecode: loadContractBytecode(`${name}/${name}.bin`, ARTIFACTS_DIR),
  };
}
```

Relative paths resolve against `<cwd>/test/artifacts` or `withArtifactsDir()`:

```ts snippet="examples/test/e2e/fixtures-and-isolation.e2e.test.ts#container-artifacts"
const abi = anvil.contractAbi("ExampleToken/ExampleToken.json");
const bytecode = anvil.contractBytecode("ExampleToken/ExampleToken.bin");
const [deployer] = await anvil.addresses();

const receipt = await anvil.deployContract(abi, bytecode, deployer, [
  "Second",
  "TWO",
]);
expect(
  await anvil.testClient.readContract({
    address: receipt.contractAddress!,
    abi,
    functionName: "symbol",
  }),
).toBe("TWO");
```

A deploy helper returning a checksummed address:

```ts snippet="examples/src/deploy.ts#deploy-helper"
/**
 * Deploys an artifact and returns the new contract's checksummed address
 * (receipts carry it lowercase; contract reads return checksummed addresses).
 */
export async function deployContract(
  client: SignerClient,
  artifact: ContractArtifact,
  args: readonly unknown[] = [],
): Promise<Address> {
  const hash = await client.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args,
  });
  const { contractAddress } = await client.confirmTransaction({ hash });
  if (!contractAddress) throw new Error(`${hash} created no contract`);
  return getAddress(contractAddress);
}
```

JSON ABIs are typed `Abi`, so reads return `unknown`: narrow them in helpers, or
use `parseAbiItem` ([Query logs](../events/query-logs.md)).

## Concepts

- Reference: [`loadContractAbi` / `loadContractBytecode`](../../reference/exports.md#functions)
