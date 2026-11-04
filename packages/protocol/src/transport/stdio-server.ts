import { Readable, Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import type { ITransportStrategy } from "./interface.ts";
import type { JsonRpcWireMessage } from "../jsonrpc/types.ts";
import { RequestDispatcher, type PendingOutbound } from "./request-dispatcher.ts";

export interface StdioJsonRpcServerOptions {
  stdin?: Readable;
  stdout?: Writable;
  handler: (method: string, params: Record<string, unknown>) => Promise<unknown>;
}

export class StdioJsonRpcServer implements ITransportStrategy {
  private stdin: Readable;
  private stdout: Writable;
  private decoder = new StringDecoder("utf8");
  private buffer = "";
  private nextRequestId = 0;
  private pendingOutbound = new Map<string | number, PendingOutbound>();
  private dispatcher: RequestDispatcher;
  private onDataHandler = (chunk: Buffer) => {
    void this.handleChunk(chunk);
  };

  constructor(options: StdioJsonRpcServerOptions) {
    this.stdin = options.stdin ?? process.stdin;
    this.stdout = options.stdout ?? process.stdout;
    this.dispatcher = new RequestDispatcher(
      options.handler,
      (msg) => this.send(msg),
      this.pendingOutbound,
    );
  }

  public start(): void {
    this.stdin.on("data", this.onDataHandler);
  }

  public stop(): void {
    this.stdin.off("data", this.onDataHandler);
    for (const pending of this.pendingOutbound.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Server stopped"));
    }
    this.pendingOutbound.clear();
  }

  public close(): void {
    this.stop();
  }

  public send(message: JsonRpcWireMessage): void {
    this.stdout.write(JSON.stringify(message) + "\n");
  }

  public sendNotification(method: string, params: Record<string, unknown>): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  public request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = 120_000,
  ): Promise<unknown> {
    const id = `req_${Date.now()}_${++this.nextRequestId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingOutbound.delete(id);
        reject(new Error(`Request ${method} (id: ${id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingOutbound.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  private async handleChunk(chunk: Buffer): Promise<void> {
    this.buffer += this.decoder.write(chunk);
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      await this.dispatcher.processLine(line);
    }
  }
}
