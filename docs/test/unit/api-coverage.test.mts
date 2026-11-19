/**
 * The docs cover the library's whole public API, read from the build of this
 * checkout: every export is in the reference, every member is documented on
 * its reference page, and every option method, test action, anvil extra,
 * cheats step, client setting and node member is demonstrated by a tested
 * sample. Adding API without docs fails here.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import {
  loadLibrary,
  requireFromLibrary,
} from "../../plugins/reference/library.mts";
import { CONTENT_DIR, REPO_ROOT } from "../../plugins/snippets/project.mts";
import { loadPages } from "../support/site.mts";

type Prototype = Record<string, unknown>;
interface Viem {
  createClient(options: { transport: unknown }): unknown;
  custom(provider: { request: () => Promise<unknown> }): unknown;
  testActions(options: {
    mode: "anvil";
  }): (client: unknown) => Record<string, unknown>;
}

const library = loadLibrary(REPO_ROOT);
const viem = requireFromLibrary(REPO_ROOT, "viem") as Viem;
const client = viem.createClient({
  transport: viem.custom({ request: () => Promise.resolve(null) }),
});
const pages = loadPages();
const reference = (name: string) =>
  fs.readFileSync(path.join(CONTENT_DIR, "reference", `${name}.md`), "utf8");
const allReference = pages
  .filter((page) => page.id.startsWith("reference/"))
  .map((page) => page.text)
  .join("\n");
const samples = pages.flatMap((page) => page.snippets).join("\n");

function prototypeOf(name: string): Prototype {
  return (library[name] as { prototype: Prototype }).prototype;
}

/** Own members of a class prototype, minus non-public ones (which must exist). */
function members(name: string, nonPublic: readonly string[] = []): string[] {
  const own = Object.getOwnPropertyNames(prototypeOf(name)).filter(
    (member) => member !== "constructor",
  );
  assert.deepEqual(
    nonPublic.filter((member) => !own.includes(member)),
    [],
    `stale non-public list for ${name}`,
  );
  return own.filter((member) => !nonPublic.includes(member));
}

/** `name` inside a code span of `text`, e.g. `` `name` `` or `` `x.name(a)` ``. */
function mentioned(text: string, name: string): boolean {
  return new RegExp(`\`[^\`\\n]*\\b${name}\\b[^\`\\n]*\``).test(text);
}

const undocumented = (text: string, names: readonly string[]) =>
  names.filter((name) => !mentioned(text, name));
/** Names not called/accessed (`.name`) by any tested sample on the site. */
const undemonstrated = (names: readonly string[]) =>
  names.filter((name) => !new RegExp(`\\.${name}\\b`).test(samples));

const OPTION_GROUPS = [
  "AccountOptions",
  "EvmOptions",
  "ForkingOptions",
  "LoggingOptions",
  "MiningOptions",
  "NetworkOptions",
  "ServerOptions",
  "StateOptions",
];
const OPTIONS_VIEW_NON_PUBLIC = [
  "setValue",
  "addValue",
  "toggleFlag",
  "unsetFlags",
  "addFileTransfer",
  "hardforkProblems",
];
const STARTED_NON_PUBLIC = [
  "initialize",
  "exportFiles",
  "containerStopping",
  "buildClient",
  "resolveAccount",
  "assertUsable",
  "updateChainId",
  "syncChainId",
  "deriveKeys",
  "parseKeys",
];
/** Container helpers demonstrating a viem test action. */
const HELPERS: Readonly<Record<string, readonly string[]>> = {
  impersonateAccount: ["impersonate", "withImpersonation"],
  stopImpersonatingAccount: ["stopImpersonating"],
};

describe("API coverage: the reference lists", () => {
  it("every runtime export", () => {
    const names = Object.keys(library);
    assert.ok(names.length > 60);
    assert.deepEqual(undocumented(allReference, names), []);
  });

  it("every type-only export", () => {
    const declarations = fs.readFileSync(
      path.join(REPO_ROOT, "dist", "index.d.ts"),
      "utf8",
    );
    const match = /export type \{([^}]+)\};\s*$/.exec(declarations);
    assert.ok(match, "dist/index.d.ts ends with its type exports");
    const names = match[1].split(",").map((name) => name.trim());
    assert.ok(names.length >= 35);
    assert.deepEqual(undocumented(allReference, names), []);
  });

  it("every option method and every flag", () => {
    const text = reference("anvil-options");
    for (const group of OPTION_GROUPS) {
      const own = members(group, group === "StateOptions" ? ["file"] : []);
      assert.deepEqual(undocumented(text, own), [], group);
    }
    assert.deepEqual(
      undocumented(text, members("OptionsView", OPTIONS_VIEW_NON_PUBLIC)),
      [],
    );
    assert.deepEqual(undocumented(text, members("OptionsGroup")), []);
    const flags = (library.ANVIL_FLAG_LIST as readonly { flag: string }[]).map(
      (spec) => spec.flag,
    );
    assert.deepEqual(
      flags.filter((flag) => !text.includes(`\`${flag}\``)),
      [],
    );
  });

  it("every viem test action with its anvil RPC method", () => {
    const text = reference("test-client");
    const actions = Object.keys(viem.testActions({ mode: "anvil" })(client));
    assert.ok(actions.length >= 30);
    assert.deepEqual(
      actions.filter(
        (name) =>
          !new RegExp(`^\\| \`${name}\` \\| \`\\w+\` \\|`, "m").test(text),
      ),
      [],
    );
  });

  it("every anvil extra, cheats step and client setting on its page", () => {
    const extras = Object.keys(
      (library.anvilActions as (c: unknown) => object)(client),
    );
    assert.ok(extras.length > 10);
    assert.deepEqual(undocumented(reference("anvil-actions"), extras), []);
    assert.deepEqual(
      undocumented(
        reference("cheats"),
        members("AnvilCheats", ["add", "execute"]),
      ),
      [],
    );
    assert.deepEqual(
      undocumented(
        reference("test-client-options"),
        members("TestClientOptions"),
      ),
      [],
    );
  });

  it("every member of the containers", () => {
    assert.deepEqual(
      undocumented(
        reference("started-anvil-container"),
        members("StartedAnvilContainer", STARTED_NON_PUBLIC),
      ),
      [],
    );
    assert.deepEqual(
      undocumented(reference("anvil-container"), members("AnvilContainer")),
      [],
    );
  });

  it("every error class and code", () => {
    const text = reference("errors");
    const classes = Object.keys(library).filter((name) =>
      name.endsWith("Error"),
    );
    assert.equal(classes.length, 5);
    assert.deepEqual(undocumented(text, classes), []);
    assert.deepEqual(
      undocumented(text, Object.keys(library.ANVIL_TEST_CLIENT_ERROR_CODES)),
      [],
    );
  });
});

describe("API coverage: tested samples demonstrate", () => {
  it("every option method", () => {
    const names = [
      ...OPTION_GROUPS.flatMap((group) =>
        members(group, group === "StateOptions" ? ["file"] : []),
      ),
      ...members("OptionsView", OPTIONS_VIEW_NON_PUBLIC),
      ...members("OptionsGroup"),
    ];
    assert.deepEqual(undemonstrated(names), []);
  });

  it("every viem test action", () => {
    const actions = Object.keys(viem.testActions({ mode: "anvil" })(client));
    assert.deepEqual(
      actions.filter(
        (name) =>
          undemonstrated([name, ...(HELPERS[name] ?? [])]).length ===
          1 + (HELPERS[name]?.length ?? 0),
      ),
      [],
    );
  });

  it("every anvil extra, cheats step and client setting", () => {
    const extras = Object.keys(
      (library.anvilActions as (c: unknown) => object)(client),
    );
    assert.deepEqual(undemonstrated(extras), []);
    assert.deepEqual(
      undemonstrated(members("AnvilCheats", ["add", "execute", "then"])),
      [],
    );
    assert.deepEqual(undemonstrated(members("TestClientOptions")), []);
  });

  it("every member of the containers", () => {
    // `client` is an alias of `testClient`; `removeStoppedContainer` is a
    // protected hook for custom runtimes; `withWaitStrategy` is rarely needed.
    assert.deepEqual(
      undemonstrated(
        members("StartedAnvilContainer", [
          ...STARTED_NON_PUBLIC,
          "client",
          "removeStoppedContainer",
        ]),
      ),
      [],
    );
    assert.deepEqual(
      undemonstrated(members("AnvilContainer", ["withWaitStrategy"])),
      [],
    );
  });

  it("useAnvil and every setting", () => {
    for (const name of [
      "useAnvil(",
      "setup:",
      "isolation:",
      "timeout:",
      "hooks:",
    ]) {
      assert.ok(samples.includes(name), name);
    }
  });
});
