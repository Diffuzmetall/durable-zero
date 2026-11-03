import type { JsonRpcWireMessage } from "../jsonrpc/types.ts";

export interface ITransportStrategy {
  start(): Promise<void> | void;
  send(message: JsonRpcWireMessage): Promise<void> | void;
  request(method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
  sendNotification(method: string, params: Record<string, unknown>): void;
  close(): Promise<void> | void;
}
