import * as http from "node:http";
import { AddressInfo } from "node:net";
import * as zlib from "node:zlib";

export interface RpcCall {
  method: string;
  params: unknown[];
}

type Handler = (params: unknown[], call: RpcCall) => unknown;

const HASH = `0x${"11".repeat(32)}`;

/** JSON document behind {@link STATE_DUMP}. */
export const STATE_JSON = '{"block":{"number":"0x1"},"accounts":{}}';

/** What `anvil_dumpState` returns for {@link STATE_JSON}: gzip bytes as hex. */
export const STATE_DUMP = `0x${zlib.gzipSync(Buffer.from(STATE_JSON)).toString("hex")}`;

/**
 * A minimal JSON-RPC server that imitates the subset of anvil used by
 * `StartedAnvilContainer`, records every call and lets tests override
 * individual methods.
 */
export class MockRpcServer {
  public readonly calls: RpcCall[] = [];
  public automine = true;
  public chainId = 31337;
  public balances = new Map<string, bigint>();
  public accounts: `0x${string}`[] = [
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  ];
  public overrides = new Map<string, Handler>();
  public failNext = new Map<string, { code: number; message: string }>();
  private server?: http.Server;
  private blockNumber = 0;

  public get url(): string {
    const address = this.server?.address() as AddressInfo | null;
    if (!address) throw new Error("server not started");
    return `http://127.0.0.1:${address.port}`;
  }

  public get port(): number {
    return (this.server?.address() as AddressInfo).port;
  }

  public async start(): Promise<this> {
    this.server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        let payload: { id?: number; method: string; params?: unknown[] };
        try {
          payload = JSON.parse(body) as typeof payload;
        } catch {
          res.writeHead(400).end("bad json");
          return;
        }
        const requests: Array<typeof payload> = Array.isArray(payload)
          ? (payload as Array<typeof payload>)
          : [payload];
        const responses = requests.map((request) => this.handle(request));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify(Array.isArray(payload) ? responses : responses[0]),
        );
      });
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, "127.0.0.1", resolve),
    );
    return this;
  }

  public async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  public callsFor(method: string): RpcCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  private handle(request: { id?: number; method: string; params?: unknown[] }) {
    const call: RpcCall = {
      method: request.method,
      params: request.params ?? [],
    };
    this.calls.push(call);
    const failure = this.failNext.get(request.method);
    if (failure) {
      this.failNext.delete(request.method);
      return { jsonrpc: "2.0", id: request.id, error: failure };
    }
    const override = this.overrides.get(request.method);
    try {
      const result = override
        ? override(call.params, call)
        : this.defaultHandler(request.method, call.params);
      return { jsonrpc: "2.0", id: request.id, result };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32601, message: (error as Error).message },
      };
    }
  }

  private defaultHandler(method: string, params: unknown[]): unknown {
    switch (method) {
      case "eth_chainId":
        return `0x${this.chainId.toString(16)}`;
      case "eth_accounts":
        return this.accounts;
      case "eth_blockNumber":
        return `0x${this.blockNumber.toString(16)}`;
      case "eth_getBalance": {
        const address = String(params[0]).toLowerCase();
        return `0x${(this.balances.get(address) ?? 10n ** 22n).toString(16)}`;
      }
      case "anvil_setBalance": {
        this.balances.set(
          String(params[0]).toLowerCase(),
          BigInt(String(params[1])),
        );
        return null;
      }
      case "anvil_impersonateAccount":
      case "anvil_stopImpersonatingAccount":
      case "anvil_autoImpersonateAccount":
      case "evm_setAutomine":
      case "evm_setIntervalMining":
      case "evm_setNextBlockTimestamp":
      case "anvil_setMinGasPrice":
      case "anvil_setNextBlockBaseFeePerGas":
      case "evm_setBlockGasLimit":
      case "anvil_loadState":
      case "anvil_setLoggingEnabled":
        return null;
      case "evm_increaseTime":
        return "0x0";
      case "anvil_getAutomine":
        return this.automine;
      case "anvil_mine":
      case "evm_mine":
        this.blockNumber += Number(params[0] ?? 1) || 1;
        return null;
      case "eth_sendTransaction":
        if (this.automine) this.blockNumber += 1;
        return HASH;
      case "eth_getTransactionReceipt":
        return {
          transactionHash: HASH,
          transactionIndex: "0x0",
          blockHash: `0x${"22".repeat(32)}`,
          blockNumber: `0x${this.blockNumber.toString(16)}`,
          from: this.accounts[0].toLowerCase(),
          to: this.accounts[1].toLowerCase(),
          cumulativeGasUsed: "0x5208",
          gasUsed: "0x5208",
          contractAddress: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
          logs: [],
          logsBloom: `0x${"00".repeat(256)}`,
          status: "0x1",
          effectiveGasPrice: "0x1",
          type: "0x2",
        };
      case "evm_snapshot":
        return "0x1";
      case "evm_revert":
        return true;
      case "anvil_dumpState":
        return STATE_DUMP;
      case "anvil_nodeInfo":
        return {
          currentBlockNumber: "0x0",
          hardFork: "prague",
          environment: {},
          forkConfig: {},
        };
      case "anvil_metadata":
        return {
          clientVersion: "anvil/v1.6.0",
          chainId: this.chainId,
          snapshots: {},
        };
      default:
        throw new Error(`Method not found: ${method}`);
    }
  }
}
