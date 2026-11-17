import * as fs from "node:fs";
import * as path from "node:path";
import { createClient, custom } from "viem";
import {
  ANVIL_TEST_CLIENT_ERROR_CODES,
  AnvilCheats,
  anvilActions,
  AnvilContainer,
  StartedAnvilContainer,
  TestClientOptions,
} from "../../../src";
import { VIEM_TEST_ACTIONS } from "../../helpers/viem-actions";

const ROOT = path.resolve(__dirname, "../../..");
const README = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

/** Public methods/accessors declared by a class (not inherited). */
function members(
  prototype: object,
  internal: readonly string[] = [],
): string[] {
  return Object.getOwnPropertyNames(prototype).filter(
    (name) => name !== "constructor" && !internal.includes(name),
  );
}

function undocumented(
  names: readonly string[],
  render: (name: string) => string[],
): string[] {
  return names.filter(
    (name) => !render(name).some((text) => README.includes(text)),
  );
}

const call = (name: string) => [`\`${name}()\``, `\`${name}(`];
const code = (name: string) => [`\`${name}\``, ...call(name)];

describe("README documents the whole test client API", () => {
  it("lists every viem test action with its anvil RPC method", () => {
    expect(
      undocumented(VIEM_TEST_ACTIONS, (name) => [`| \`${name}\` |`]),
    ).toEqual([]);
  });

  it("documents every anvil extra", () => {
    const client = createClient({
      transport: custom({ request: () => Promise.resolve() }),
    });
    const names = Object.keys(anvilActions(client));
    expect(names.length).toBeGreaterThan(10);
    expect(undocumented(names, code)).toEqual([]);
  });

  it("documents every cheats step", () => {
    const names = members(AnvilCheats.prototype, ["add", "execute"]);
    expect(names).toContain("dealErc20");
    expect(undocumented(names, code)).toEqual([]);
  });

  it("documents every TestClientOptions setting", () => {
    const names = members(TestClientOptions.prototype);
    expect(undocumented(names, call)).toEqual([]);
  });

  it("documents every StartedAnvilContainer and AnvilContainer member", () => {
    const started = members(StartedAnvilContainer.prototype, [
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
    ]);
    expect(undocumented(started, code)).toEqual([]);
    const container = members(AnvilContainer.prototype, ["withWaitStrategy"]);
    expect(undocumented(container, code)).toEqual([]);
  });

  it("documents every AnvilTestClientError code", () => {
    const codes = Object.keys(ANVIL_TEST_CLIENT_ERROR_CODES);
    expect(codes).toHaveLength(8);
    expect(undocumented(codes, (name) => [`| \`${name}\` |`])).toEqual([]);
  });
});
