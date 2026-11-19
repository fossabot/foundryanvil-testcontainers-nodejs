/**
 * Quick start: the sample of the library README and the docs' quick start,
 * as a complete test file.
 */
// #region quick-start
import {
  AnvilContainer,
  AnvilOptions,
  Hardfork,
  useAnvil,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import { parseEther } from "viem";

const options = new AnvilOptions().account
  .withAccounts(5)
  .withBalance(1_000) // ETH per dev account
  .evm.withChainId(1337)
  .withHardfork(Hardfork.Cancun)
  .logs.quiet();

// Starts in beforeAll, stops in afterAll, restores the state after every test.
const anvil = useAnvil(
  new AnvilContainer(options).withTestClient((client) => client.withAccount(0)),
);

it("sends Ether", async () => {
  const [, bob] = await anvil.addresses();
  // No `account` needed: dev account 0 is the typed default signer.
  const receipt = await anvil.confirm(
    anvil.testClient.sendTransaction({ to: bob, value: parseEther("1") }),
  );
  expect(receipt.status).toBe("success");
  expect(await anvil.testClient.getChainId()).toBe(1337);
});

it("manipulates the chain fluently", async () => {
  const whale = "0x1111111111111111111111111111111111111111";
  await anvil.cheats
    .setBalanceEther(whale, 1_000)
    .impersonate(whale)
    .increaseTime({ days: 7 })
    .mine();
  expect(await anvil.getBalance(whale)).toBe(parseEther("1000"));
});
// #endregion quick-start
