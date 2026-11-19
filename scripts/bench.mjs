#!/usr/bin/env node
/**
 * Benchmarks the library's hot paths — what every user's test file and test
 * pays — against a local anvil binary (no Docker needed).
 *
 *   pnpm bench                                   the current build (dist/)
 *   pnpm bench --baseline <dir>/dist/index.cjs   compare with another build
 *   pnpm bench --rounds 9                        more rounds (default 5), steadier medians
 *
 * Builds run in alternating fresh processes (a Jest test file is a fresh
 * module instance). Each run reports per-operation means — what a suite
 * pays in total, slow tails included; the table shows the median over
 * rounds, which discards rounds disturbed by other load on the machine.
 * Compare several rounds, never a single run.
 */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const require = createRequire(import.meta.url);

/** One benchmark run of the build at `entry`; prints `{ results }` as JSON. */
export async function runOnce(entry, anvilBinary) {
  const net = await import("node:net");
  const lib = require(entry);
  const freePort = () =>
    new Promise((resolve) => {
      const server = net.createServer();
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address();
        server.close(() => resolve(port));
      });
    });

  /** Runs the prepared command as a local process (see `startRuntime()`). */
  class LocalAnvil extends lib.AnvilContainer {
    async startRuntime() {
      const { args } = this.prepare();
      const port = await freePort();
      const rest = args.filter(
        (arg, i) => arg !== "--host" && args[i - 1] !== "--host",
      );
      const child = spawn(
        anvilBinary,
        ["--host", "127.0.0.1", "--port", String(port), ...rest],
        {
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (output += chunk));
      for (;;) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}',
          });
          if (response.ok) break;
        } catch {
          // not listening yet
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      return {
        getHost: () => "127.0.0.1",
        getMappedPort: () => port,
        stop: async () => {
          child.kill("SIGKILL");
          return {};
        },
        getLogSnapshot: () => output,
      };
    }
  }

  const results = {};
  // Mean per operation: what a suite pays in total (tails included).
  const mean = async (name, runs, fn) => {
    const started = performance.now();
    for (let i = 0; i < runs; i++) await fn();
    results[name] = (performance.now() - started) / runs;
  };
  const BOB = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  let started = performance.now();
  const first = await new LocalAnvil()
    .withTestClient((c) => c.withLocalAccount(0))
    .start();
  results["first start in a file, withLocalAccount(0)"] =
    performance.now() - started;
  await first.stop();
  const starts = [];
  for (let i = 0; i < 5; i++) {
    started = performance.now();
    const node = await new LocalAnvil()
      .withTestClient((c) => c.withAccount(0))
      .start();
    starts.push(performance.now() - started);
    await node.stop();
  }
  results["start(), withAccount(0)"] = starts.sort((a, b) => a - b)[2];

  const anvil = await new LocalAnvil()
    .withTestClient((c) => c.withAccount(0))
    .start();
  const client = anvil.testClient;
  await mean("sendTransaction (node signer)", 200, () =>
    client.sendTransaction({ to: BOB, value: 1n }),
  );
  await mean("confirm(sendTransaction)", 200, () =>
    anvil.confirm(client.sendTransaction({ to: BOB, value: 1n })),
  );
  await mean("sendEthTransaction()", 100, () =>
    anvil.sendEthTransaction(anvil.testClient.account.address, BOB, "0.001"),
  );
  const hooks = {
    beforeAll: (fn) => (hooks.before = fn),
    afterAll: (fn) => (hooks.after = fn),
    afterEach: (fn) => (hooks.each = fn),
  };
  lib.useAnvil({ start: async () => anvil }, { hooks });
  await hooks.before();
  await mean("useAnvil per-test restore", 200, () => hooks.each());
  await mean("HTTP watcher sees a new block", 15, async () => {
    let seen = false;
    const unwatch = client.watchBlockNumber({
      onBlockNumber: () => (seen = true),
      emitOnBegin: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await anvil.mine();
    while (!seen) await new Promise((resolve) => setTimeout(resolve, 1));
    unwatch();
  });
  await mean(
    "typical test (3 writes, 2 reads, cheats, restore)",
    60,
    async () => {
      for (let i = 0; i < 3; i++)
        await anvil.confirm(client.sendTransaction({ to: BOB, value: 1n }));
      await client.getBalance({ address: BOB });
      await client.getBlockNumber();
      await anvil.cheats
        .setBalanceEther(BOB, 1)
        .increaseTime({ days: 1 })
        .mine();
      await hooks.each();
    },
  );
  await anvil.stop();
  return results;
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Formats `{ build: { operation: [ms…] } }` as a table of medians. */
export function formatTable(samples, builds) {
  const operations = Object.keys(samples[builds[0]]);
  const width = Math.max(...operations.map((name) => name.length));
  const lines = [
    [
      `Operation`.padEnd(width),
      ...builds.map((b) => b.padStart(12)),
      builds.length === 2 ? "  speed-up" : "",
    ].join(" "),
  ];
  for (const name of operations) {
    const values = builds.map((build) => median(samples[build][name]));
    const cells = values.map((value) => `${value.toFixed(2)} ms`.padStart(12));
    const ratio =
      values.length === 2 ? `  ${(values[0] / values[1]).toFixed(2)}x` : "";
    lines.push([name.padEnd(width), ...cells, ratio].join(" "));
  }
  return lines.join("\n");
}

async function main(argv = process.argv.slice(2)) {
  if (argv[0] === "--once") {
    console.log(JSON.stringify(await runOnce(argv[1], argv[2])));
    return 0;
  }
  const { resolveAnvilBinary } = require("./anvil-binary.cjs");
  const binary = resolveAnvilBinary(process.env, root);
  if (!binary) {
    console.error("✖ no anvil binary: run `pnpm install` or set ANVIL_BINARY");
    return 1;
  }
  const current = path.join(root, "dist", "index.cjs");
  const baseline = option(argv, "--baseline");
  const rounds = Number(option(argv, "--rounds") ?? 5);
  const builds = baseline
    ? { baseline: path.resolve(baseline), current }
    : { current };
  const samples = Object.fromEntries(
    Object.keys(builds).map((name) => [name, {}]),
  );
  console.log(
    `anvil: ${binary.path}\n${rounds} round(s) of ${Object.keys(builds).join(" vs ")}…`,
  );
  for (let round = 0; round < rounds; round++) {
    for (const [name, entry] of Object.entries(builds)) {
      const run = spawnSync(
        process.execPath,
        [fileURLToPath(import.meta.url), "--once", entry, binary.path],
        {
          encoding: "utf8",
        },
      );
      if (run.status !== 0) {
        console.error(run.stderr);
        return run.status ?? 1;
      }
      for (const [operation, ms] of Object.entries(JSON.parse(run.stdout))) {
        (samples[name][operation] ??= []).push(ms);
      }
    }
  }
  console.log(formatTable(samples, Object.keys(builds)));
  return 0;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().then((code) => process.exit(code));
}
