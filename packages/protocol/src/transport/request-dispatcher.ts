import { jsonRpcRequestSchema, jsonRpcResponseSchema } from "../jsonrpc/schema.ts";
import type { JsonRpcWireMessage } from "../jsonrpc/types.ts";

export interface PendingOutbound {
  resolve: (res: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export type SendWireMessage = (message: JsonRpcWireMessage) => void;
export type MethodHandler = (method: string, params: Record<string, unknown>) => Promise<unknown>;

export class RequestDispatcher {
  private readonly handler: MethodHandler;
  private readonly send: SendWireMessage;
  private readonly pendingOutbound: Map<string | number, PendingOutbound>;

  constructor(
    handler: MethodHandler,
    send: SendWireMessage,
    pendingOutbound: Map<string | number, PendingOutbound>,
  ) {
    this.handler = handler;
    this.send = send;
    this.pendingOutbound = pendingOutbound;
  }

  public async processLine(line: string): Promise<void> {
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
        const reqId = parsed && typeof parsed === "object" && "id" in parsed &&
          (typeof parsed.id === "string" || typeof parsed.id === "number") ? parsed.id : null;
        this.send({ jsonrpc: "2.0", id: reqId, error: { code: -32600, message: "Invalid Request" } });
        return;
      }
      const { id, method, params } = validated.data;
      try {
        const result = await this.handler(method, params ?? {});
        this.send({ jsonrpc: "2.0", id, result });
      } catch (err) {
        this.send({
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
        });
      }
    } catch {
      this.send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
  }
}
