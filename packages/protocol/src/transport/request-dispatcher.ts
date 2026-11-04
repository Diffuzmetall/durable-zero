import {
  jsonRpcNotificationSchema,
  jsonRpcRequestSchema,
  jsonRpcResponseSchema,
} from "../jsonrpc/schema.ts";
import { JsonRpcMethodNotFoundError } from "../jsonrpc/errors.ts";
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
    let raw: Record<string, unknown>;
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        this.send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } });
        return;
      }
      raw = parsed as Record<string, unknown>;
    } catch {
      this.send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }

    if (!("method" in raw)) {
      const id = "id" in raw && (typeof raw.id === "string" || typeof raw.id === "number") ? raw.id : null;
      if (id !== null && this.pendingOutbound.has(id)) {
        const pending = this.pendingOutbound.get(id)!;
        clearTimeout(pending.timer);
        this.pendingOutbound.delete(id);
        const resVal = jsonRpcResponseSchema.safeParse(raw);
        if (resVal.success) {
          if (resVal.data.error) pending.reject(new Error(resVal.data.error.message));
          else pending.resolve(resVal.data.result);
        } else {
          pending.reject(new Error(`Malformed JSON-RPC response from client: ${resVal.error.message}`));
        }
        return;
      }
      if ("result" in raw || "error" in raw) return;
    }

    if (!("id" in raw)) {
      const notifVal = jsonRpcNotificationSchema.safeParse(raw);
      if (notifVal.success) {
        try {
          await this.handler(notifVal.data.method, notifVal.data.params ?? {});
        } catch {
          // Notifications MUST NOT be responded to, even on failure
        }
        return;
      }
    }

    const validated = jsonRpcRequestSchema.safeParse(raw);
    if (!validated.success) {
      const reqId = "id" in raw && (typeof raw.id === "string" || typeof raw.id === "number") ? raw.id : null;
      this.send({ jsonrpc: "2.0", id: reqId, error: { code: -32600, message: "Invalid Request" } });
      return;
    }

    const { id, method, params } = validated.data;
    try {
      const result = await this.handler(method, params ?? {});
      this.send({ jsonrpc: "2.0", id, result: result === undefined ? null : result });
    } catch (err) {
      const isNotFound = err instanceof JsonRpcMethodNotFoundError ||
        (err instanceof Error && err.name === "JsonRpcMethodNotFoundError");
      this.send({
        jsonrpc: "2.0",
        id,
        error: isNotFound
          ? { code: -32601, message: (err as Error).message }
          : { code: -32603, message: err instanceof Error ? err.message : String(err) },
      });
    }
  }
}
