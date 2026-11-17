/**
 * The examples demonstrate the whole test client API: every viem test
 * action, every anvil extra, every cheats step, every TestClientOptions
 * setting and every StartedAnvilContainer member is called somewhere in the
 * example code. The viem list is read from the installed viem, so an upgrade
 * that adds test actions fails here until they are demonstrated.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  AnvilCheats,
  anvilActions,
  StartedAnvilContainer,
  TestClientOptions,
} from "@hellaweb3/foundryanvil-testcontainers-nodejs";
import { createClient, custom, testActions } from "viem";

const EXAMPLES = path.resolve(__dirname, "../..");

function sources(directory: string): string {
  return fs
    .readdirSync(path.join(EXAMPLES, directory), { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".ts"))
    .map((file) =>
      fs.readFileSync(path.join(EXAMPLES, directory, file), "utf8"),
    )
    .join("\n");
}

const EXAMPLE_CODE = [
  sources("test/e2e"),
  sources("test/unit"),
  sources("src"),
].join("\n");
const called = (name: string) => new RegExp(`\\.${name}\\b`).test(EXAMPLE_CODE);
const undemonstrated = (names: readonly string[]) =>
  names.filter((name) => !called(name));

const client = createClient({
  transport: custom({ request: () => Promise.resolve(null) }),
});

/** Helpers of the container that implement a viem test action. */
const HELPERS: Record<string, readonly string[]> = {
  impersonateAccount: ["impersonate", "withImpersonation"],
  stopImpersonatingAccount: ["stopImpersonating"],
  snapshot: ["checkpoint"],
  loadState: ["loadStateFromFile"],
};

function members(prototype: object, internal: readonly string[]): string[] {
  return Object.getOwnPropertyNames(prototype).filter(
    (name) => name !== "constructor" && !internal.includes(name),
  );
}

describe("the examples demonstrate", () => {
  it("every viem test action", () => {
    const actions = Object.keys(testActions({ mode: "anvil" })(client));
    expect(actions.length).toBeGreaterThanOrEqual(30);
    expect(
      actions.filter((name) => ![name, ...(HELPERS[name] ?? [])].some(called)),
    ).toEqual([]);
  });

  it("every anvil extra", () => {
    expect(undemonstrated(Object.keys(anvilActions(client)))).toEqual([]);
  });

  it("every cheats step", () => {
    const steps = members(AnvilCheats.prototype, [
      "add",
      "execute",
      "then",
      "catch",
      "finally",
      "run",
      "plan",
    ]);
    expect(undemonstrated(steps)).toEqual([]);
  });

  it("every TestClientOptions setting", () => {
    expect(undemonstrated(members(TestClientOptions.prototype, []))).toEqual(
      [],
    );
  });

  it("every StartedAnvilContainer member", () => {
    const internal = [
      "initialize",
      "exportFiles",
      "removeStoppedContainer",
      "containerStopping",
      "buildClient",
      "resolveAccount",
      "assertUsable",
      "updateChainId",
      "syncChainId",
      "deriveKeys",
      "parseKeys",
      "client", // alias of testClient
    ];
    expect(
      undemonstrated(members(StartedAnvilContainer.prototype, internal)),
    ).toEqual([]);
  });
});
