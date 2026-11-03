import { Readable, Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { jsonRpcRequestSchema, jsonRpcResponseSchema } from "../jsonrpc/schema.ts";
import type { ITransportStrategy } from "./interface.ts";
import type { JsonRpcWireMessage } from "../jsonrpc/types.ts";

export interface StdioJsonRpcServerOptions {
  stdin?: Readable;
  stdout?: Writable;
  handler: (method: string, params: Record<string, unknown>) => Promise<unknown>;
}

interface PendingOutbound {
  resolve: (res: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class StdioJsonRpcServer implements ITransportStrategy {
  private stdin: Readable;
  private stdout: Writable;
  private handler: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  private decoder = new StringDecoder("utf8");
  private buffer = "";
  private nextRequestId = 0;
  private pendingOutbound = new Map<string | number, PendingOutbound>();
  private onDataHandler = (chunk: Buffer) => {
    void this.handleChunk(chunk);
  };

  constructor(options: StdioJsonRpcServerOptions) {
    this.stdin = options.stdin ?? process.stdin;
    this.stdout = options.stdout ?? process.stdout;
    this.handler = options.handler;
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
      await this.processLine(line);
    }
  }

  private async processLine(line: string): Promise<void> {
    try {
      const parsed = JSON.parse(line);

      // Check if this is a response to an outbound request
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "id" in parsed &&
        ("result" in parsed || "error" in parsed) &&
        !("method" in parsed)
      ) {
        const responseVal = jsonRpcResponseSchema.safeParse(parsed);
        if (responseVal.success) {
          const { id, result, error } = responseVal.data;
          if (id !== null && this.pendingOutbound.has(id)) {
            const pending = this.pendingOutbound.get(id)!;
            clearTimeout(pending.timer);
            this.pendingOutbound.delete(id);
            if (error) pending.reject(new Error(error.message));
            else pending.resolve(result);
            return;
          }
        } else if (parsed.id !== null && this.pendingOutbound.has(parsed.id)) {
          // Fail-fast: client responded to our request with invalid JSON-RPC payload
          const pending = this.pendingOutbound.get(parsed.id)!;
          clearTimeout(pending.timer);
          this.pendingOutbound.delete(parsed.id);
          pending.reject(
            new Error(`Malformed JSON-RPC response from client: ${responseVal.error.message}`),
          );
          return;
        }
      }

      // Handle inbound request
      const validated = jsonRpcRequestSchema.safeParse(parsed);
      if (!validated.success) {
        const requestId =
          parsed &&
          typeof parsed === "object" &&
          "id" in parsed &&
          (typeof parsed.id === "string" || typeof parsed.id === "number")
            ? parsed.id
            : null;
        this.sendError(requestId, -32600, "Invalid Request");
        return;
      }
      const { id, method, params } = validated.data;
      try {
        const result = await this.handler(method, params ?? {});
        this.sendResult(id, result);
      } catch (err) {
        this.sendError(id, -32603, err instanceof Error ? err.message : String(err));
      }
    } catch {
      this.sendError(null, -32700, "Parse error");
    }
  }

  private sendResult(id: string | number, result: unknown): void {
    this.send({ jsonrpc: "2.0", id, result });
  }

  private sendError(id: string | number | null, code: number, message: string): void {
    this.send({ jsonrpc: "2.0", id, error: { code, message } });
  }
}
