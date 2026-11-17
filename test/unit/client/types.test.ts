/**
 * Type-level tests: enforced by `pnpm typecheck` (the bodies never run).
 */
import type { Account } from "viem";
import {
  AnvilContainer,
  AnvilTestClient,
  StartedAnvilContainer,
  TestClientOptions,
  useAnvil,
} from "../../../src";

const TO = "0x2222222222222222222222222222222222222222";

function expectType<T>(value: T): T {
  return value;
}

describe("test client typing", () => {
  it("requires an `account` argument exactly when no default account is configured", () => {
    const typed = (
      plain: StartedAnvilContainer,
      withAccount: StartedAnvilContainer<Account>,
    ) => {
      // @ts-expect-error no default account: `account` is required
      void plain.testClient.sendTransaction({ to: TO, value: 1n });
      void plain.testClient.sendTransaction({ account: TO, to: TO, value: 1n });
      void withAccount.testClient.sendTransaction({ to: TO, value: 1n });
      expectType<Account>(withAccount.testClient.account);
      expectType<undefined>(plain.testClient.account);
    };
    expect(typed).toBeInstanceOf(Function);
  });

  it("carries the account type from the options to the started node", () => {
    const typed = async () => {
      const withAccount = new AnvilContainer().withTestClient((c) =>
        c.withAccount(0),
      );
      expectType<AnvilContainer<Account>>(withAccount);
      expectType<StartedAnvilContainer<Account>>(await withAccount.start());

      const local = new AnvilContainer().withTestClient(
        new TestClientOptions().withLocalAccount(1).withPollingInterval(5),
      );
      expectType<AnvilTestClient<Account>>((await local.start()).testClient);

      const removed = new AnvilContainer().withTestClient((c) =>
        c.withAccount(0).withoutAccount(),
      );
      // @ts-expect-error the account was removed again
      expectType<AnvilContainer<Account>>(removed);

      const handle = useAnvil(withAccount);
      void handle.testClient.sendTransaction({ to: TO, value: 1n });
      void handle.cheats
        .mine()
        .step((client) => client.sendTransaction({ to: TO }));
      void handle.testClientFor(TO).sendTransaction({ to: TO });
    };
    expect(typed).toBeInstanceOf(Function);
  });

  it("keeps the default AnvilContainer / StartedAnvilContainer without an account", () => {
    const typed = async () => {
      const started = await new AnvilContainer().start();
      expectType<StartedAnvilContainer>(started);
      // @ts-expect-error no default account
      expectType<StartedAnvilContainer<Account>>(started);
    };
    expect(typed).toBeInstanceOf(Function);
  });
});
