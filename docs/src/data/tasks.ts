/** Entry points of the landing page: one per frequent task. */
export interface TaskLink {
  readonly title: string;
  readonly description: string;
  /** Site path, without the base URL. */
  readonly to: string;
}

export const TASKS: readonly TaskLink[] = [
  {
    title: "Start a node per test file",
    description:
      "useAnvil: start, deploy fixtures once, reset after every test.",
    to: "/docs/tasks/test-suites/share-a-node",
  },
  {
    title: "Fast-forward time",
    description: "Jump days ahead, hit exact timestamps, simulate block times.",
    to: "/docs/tasks/time-and-blocks/travel-in-time",
  },
  {
    title: "Act as a whale",
    description: "Impersonate any address and fund it with Ether and ERC-20s.",
    to: "/docs/tasks/accounts/impersonate-accounts",
  },
  {
    title: "Assert custom errors",
    description: "Decoded reverts from simulations, estimations and receipts.",
    to: "/docs/tasks/transactions/assert-reverts",
  },
  {
    title: "Fork mainnet",
    description: "Pin a block, change anything locally, reset back.",
    to: "/docs/tasks/forking/fork-a-chain",
  },
  {
    title: "Mock a dependency",
    description: "Etch code and write storage at any address.",
    to: "/docs/tasks/state/mock-contracts",
  },
  {
    title: "Control block building",
    description: "Several transactions per block, fee ordering, the mempool.",
    to: "/docs/tasks/time-and-blocks/build-blocks",
  },
  {
    title: "Watch events",
    description: "WebSocket subscriptions, filters and typed logs.",
    to: "/docs/tasks/events/watch-events",
  },
  {
    title: "Configure the chain",
    description: "Chain id, hardfork, gas, base fee, OP Stack, Celo.",
    to: "/docs/tasks/configure/chain",
  },
  {
    title: "Trace a failed transaction",
    description: "Call traces, opcode traces and anvil's logs.",
    to: "/docs/tasks/debugging/trace-transactions",
  },
  {
    title: "Save and load chain state",
    description: "Build a fixture once, boot other nodes from the file.",
    to: "/docs/tasks/state/save-and-load-state",
  },
  {
    title: "Run without Docker",
    description: "Plug in a local anvil binary for fast local loops.",
    to: "/docs/get-started/run-without-docker",
  },
];
