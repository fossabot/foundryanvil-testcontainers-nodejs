import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

/**
 * Navigation is organised by what you are trying to do. Reference tables
 * and background ("deep dives") live in their own sidebars so task pages
 * stay short.
 */
const sidebars: SidebarsConfig = {
  tasks: [
    "intro",
    {
      type: "category",
      label: "Get started",
      collapsed: false,
      items: [
        "get-started/install",
        "get-started/quick-start",
        "get-started/run-without-docker",
        "get-started/run-in-ci",
      ],
    },
    {
      type: "category",
      label: "Set up test suites",
      items: [
        "tasks/test-suites/share-a-node",
        "tasks/test-suites/isolate-tests",
        "tasks/test-suites/reset-the-chain",
        "tasks/test-suites/manage-the-lifecycle",
        "tasks/test-suites/load-contract-artifacts",
        "tasks/test-suites/catch-misconfiguration",
      ],
    },
    {
      type: "category",
      label: "Accounts and signing",
      items: [
        "tasks/accounts/use-dev-accounts",
        "tasks/accounts/act-as-multiple-users",
        "tasks/accounts/impersonate-accounts",
        "tasks/accounts/fund-accounts",
        "tasks/accounts/sign-locally",
      ],
    },
    {
      type: "category",
      label: "Transactions and contracts",
      items: [
        "tasks/transactions/send-transactions",
        "tasks/transactions/assert-reverts",
        "tasks/transactions/simulate-calls",
        "tasks/transactions/estimate-gas-and-fees",
        "tasks/transactions/read-contracts",
      ],
    },
    {
      type: "category",
      label: "Time and blocks",
      items: [
        "tasks/time-and-blocks/travel-in-time",
        "tasks/time-and-blocks/control-mining",
        "tasks/time-and-blocks/build-blocks",
        "tasks/time-and-blocks/reorgs-and-rollbacks",
      ],
    },
    {
      type: "category",
      label: "State and mocks",
      items: [
        "tasks/state/mock-contracts",
        "tasks/state/script-state-changes",
        "tasks/state/save-and-load-state",
        "tasks/state/custom-genesis",
        "tasks/state/limit-history",
      ],
    },
    {
      type: "category",
      label: "Forking",
      items: ["tasks/forking/fork-a-chain", "tasks/forking/reset-a-fork"],
    },
    {
      type: "category",
      label: "Events",
      items: ["tasks/events/watch-events", "tasks/events/query-logs"],
    },
    {
      type: "category",
      label: "Configure the node",
      items: [
        "tasks/configure/chain",
        "tasks/configure/evm-limits",
        "tasks/configure/rpc-server",
        "tasks/configure/logging",
        "tasks/configure/test-client",
        "tasks/configure/compose-options",
      ],
    },
    {
      type: "category",
      label: "Debug",
      items: [
        "tasks/debugging/trace-transactions",
        "tasks/debugging/inspect-the-node",
        "tasks/debugging/call-any-rpc-method",
      ],
    },
  ],
  reference: [
    "reference/index",
    "reference/anvil-options",
    "reference/flag-rules",
    "reference/anvil-container",
    "reference/started-anvil-container",
    "reference/test-client",
    "reference/anvil-actions",
    "reference/cheats",
    "reference/test-client-options",
    "reference/use-anvil",
    "reference/errors",
    "reference/exports",
  ],
  deepDives: [
    "deep-dives/index",
    "deep-dives/architecture",
    "deep-dives/isolation",
    "deep-dives/signing",
    "deep-dives/validation",
    "deep-dives/startup-and-files",
    "deep-dives/runtimes",
    "deep-dives/performance",
    "deep-dives/anvil-behaviours",
    "deep-dives/tested-docs",
  ],
};

export default sidebars;
