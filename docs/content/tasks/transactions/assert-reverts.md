---
title: Assert reverts and custom errors
description: Assert decoded custom errors, panics and reverted receipts.
---

Simulate and match the decoded error; for mined transactions, check the receipt.

## Custom errors with arguments

Simulate and match the decoded error:

```ts snippet="examples/test/e2e/custom-errors.e2e.test.ts#custom-error"
await expectRevert(
  anvil.testClientFor(alice).simulateContract({
    address: token,
    abi: exampleToken.abi,
    functionName: "transfer",
    args: [bob, 1n],
  }),
  "InsufficientBalance",
  [alice, 0n, 1n],
);
```

The core of the `expectRevert()` helper:

```ts snippet="examples/src/reverts.ts#decode-revert"
/** Finds the decoded revert in an error chain (`undefined` if it is not a revert). */
export function decodeRevert(error: unknown): DecodedRevert | undefined {
  for (
    let current = error as RevertLike | undefined;
    current && typeof current === "object";
    current = current.cause as RevertLike | undefined
  ) {
    if (current.name === "ContractFunctionRevertedError") {
      return {
        errorName: current.data?.errorName ?? "unknown",
        args: current.data?.args ?? [],
        reason: current.reason,
      };
    }
  }
  return undefined;
}
```

Match by `name`: two copies of viem (e.g. `npm link`) break `instanceof`.

## Writes: who signs decides when it fails

```ts snippet="examples/test/e2e/custom-errors.e2e.test.ts#write-reverts"
// Locally signed: viem estimates gas first, so the revert surfaces
// immediately, decoded, and nothing is sent.
const local = anvil.testClientFor(privateKeyToAccount(mallory.privateKey!));
const revert = await expectRevert(
  local.writeContract({
    address: token,
    abi: exampleToken.abi,
    functionName: "mint",
    args: [mallory.address, parseEther("1000000")],
  }),
  "NotOwner",
);
expect(revert.args).toEqual([mallory.address]);

// Signed by anvil (dev/impersonated account): sent as-is, mined, reverted.
const hash = await anvil.testClientFor(mallory.address).writeContract({
  address: token,
  abi: exampleToken.abi,
  functionName: "mint",
  args: [mallory.address, parseEther("1000000")],
});
await expect(anvil.confirm(hash)).rejects.toBeInstanceOf(
  AnvilTransactionRevertedError,
);
```

## Reverted transactions that were mined

```ts snippet="examples/test/e2e/custom-errors.e2e.test.ts#mined-revert"
const hash = await anvil.testClientFor(alice).writeContract({
  address: token,
  abi: exampleToken.abi,
  functionName: "transfer",
  args: [bob, 1n],
}); // signed by anvil: mined even though it reverts

const error = await anvil.confirm(hash).catch((e: unknown) => e);
expect(error).toBeInstanceOf(AnvilTransactionRevertedError);
expect(
  (error as AnvilTransactionRevertedError).receipt.gasUsed,
).toBeGreaterThan(0n);

// Or get the receipt without throwing:
const receipt = await anvil.confirm(hash, { throwOnRevert: false });
expect(receipt.status).toBe("reverted");
```

`AnvilTransactionRevertedError` carries `hash`, `receipt` and, when recoverable, `reason`.

## Panics

```ts snippet="examples/test/e2e/custom-errors.e2e.test.ts#panic"
const panic = await expectRevert(
  anvil.testClient.simulateContract({
    address: token,
    abi: exampleToken.abi,
    functionName: "mint",
    args: [alice, 1n], // totalSupply would overflow uint256
  }),
  "Panic",
  [0x11n], // 0x11: arithmetic underflow or overflow
);
expect(panic.reason).toMatch(/overflow/);
```

## Raw revert data

```ts snippet="examples/test/e2e/custom-errors.e2e.test.ts#raw-revert"
const error = (await anvil.testClient
  .call({
    account: alice,
    to: token,
    data: encodeFunctionData({
      abi: exampleToken.abi,
      functionName: "transfer",
      args: [bob, 1n],
    }),
  })
  .catch((e: unknown) => e)) as BaseError;

// The raw revert bytes sit on one error of the chain.
const data = (
  error.walk((e) => typeof (e as { data?: unknown }).data === "string") as {
    data?: Hex;
  } | null
)?.data;
const decoded = decodeErrorResult({
  abi: exampleToken.abi,
  data: data!,
});
expect(decoded.errorName).toBe("InsufficientBalance");
expect(decoded.args).toEqual([alice, 0n, 1n]);
```

## Concepts

- [Signing: anvil-signed vs. locally signed](../../concepts/signing.md)
- [Trace a failed transaction](../debugging/trace-transactions.md)
- Reference: [Errors](../../reference/errors.md)
