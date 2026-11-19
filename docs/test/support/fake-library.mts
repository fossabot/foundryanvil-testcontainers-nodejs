/** A tiny stand-in for the built library, for generator tests. */
import type { FlagSpec, Library } from "../../plugins/reference/library.mts";

function spec(flag: string, overrides: Partial<FlagSpec>): FlagSpec {
  return {
    flag,
    aliases: [],
    category: "General",
    kind: "value",
    description: `Sets ${flag}.`,
    methods: [],
    conflicts: [],
    requires: [],
    requiresAnyOf: [],
    managed: false,
    ...overrides,
  };
}

export const FAKE_FLAGS: readonly FlagSpec[] = [
  spec("--host", { managed: true, description: "The hosts | to listen on." }),
  spec("--block-time", {
    aliases: ["-b"],
    methods: ["mining.withBlockTime()", "mining.withMixedMining()"],
    conflicts: ["--no-mining"],
  }),
  spec("--no-mining", {
    methods: ["mining.withNoMining()"],
    conflicts: ["--block-time"],
  }),
  spec("--state-interval", {
    methods: ["state.withStateInterval()"],
    requiresAnyOf: ["--dump-state", "--state"],
    stricterThanAnvil: "anvil ignores it.",
  }),
  spec("--retries", {
    methods: ["fork.withRetries()"],
    requires: ["--fork-url"],
  }),
  spec("--auto-impersonate", {
    kind: "boolean",
    methods: ["account.autoImpersonate()", "evm.autoImpersonate()"],
  }),
];

export function fakeLibrary(extra: Record<string, unknown> = {}): Library {
  return {
    ANVIL_FLAG_LIST: FAKE_FLAGS,
    ANVIL_TEST_CLIENT_ERROR_CODES: {
      CONTAINER_STOPPED: "the node | was stopped",
    },
    groupFlags: (group: string) =>
      FAKE_FLAGS.filter((flag) =>
        flag.methods.some((method) => method.startsWith(`${group}.`)),
      ).map((flag) => flag.flag),
    Order: { Fees: "fees", Fifo: "fifo" },
    LogVerbosity: { One: 1, Two: 2, 1: "One", 2: "Two" },
    DEFAULT_PORT: 8545,
    NAME: "anvil",
    WORDS: Object.freeze([12, 24]),
    MINING_FLAGS: Object.freeze(["--no-mining"]),
    FLAGS_MAP: new Map(),
    lowercase: 1,
    ...extra,
  };
}
