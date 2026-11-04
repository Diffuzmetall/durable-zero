import type { IHostBridge } from "../../../core/src/tools/host-bridge.ts";
import {
  hostToolCallParamsSchema,
  hostToolResultSchema,
  hostInteractionParamsSchema,
  jsonValueSchema,
} from "../../../protocol/src/methods/host.ts";

export interface HostRequester {
  request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<unknown>;
}

export interface HostBridgeOptions {
  requester: HostRequester;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class HostBridge implements IHostBridge {
  private readonly requester: HostRequester;
  private readonly timeoutMs: number;

  constructor(options: HostBridgeOptions) {
    if (!options || typeof options !== "object") {
      throw new TypeError("HostBridge options must be an object");
    }
    if (!options.requester || typeof options.requester.request !== "function") {
      throw new TypeError("requester with a request method is required");
    }
    if (options.timeoutMs !== undefined) {
      if (
        typeof options.timeoutMs !== "number" ||
        !Number.isFinite(options.timeoutMs) ||
        options.timeoutMs <= 0
      ) {
        throw new TypeError(
          `timeoutMs must be a finite positive number, received: ${options.timeoutMs}`,
        );
      }
      this.timeoutMs = options.timeoutMs;
    } else {
      this.timeoutMs = DEFAULT_TIMEOUT_MS;
    }
    this.requester = options.requester;
  }

  public async forwardToolCall(
    toolName: string,
    args: unknown,
  ): Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }> {
    const validatedParams = hostToolCallParamsSchema.parse({
      toolName,
      arguments: args ?? {},
    });

    const rawResult = await this.requester.request(
      "host/toolCall",
      validatedParams as Record<string, unknown>,
      this.timeoutMs,
    );

    return hostToolResultSchema.parse(rawResult);
  }

  public async requestInteraction(
    kind: string,
    payload: { title?: string; message?: string; data?: unknown },
  ): Promise<unknown> {
    const rawPayload = (payload ?? {}) as {
      title?: string;
      message?: string;
      data?: unknown;
    };

    // Explicit kind parameter is authoritative; construct only declared payload fields
    // to prevent extra payload properties (e.g. payload.kind) from overriding kind.
    const validatedParams = hostInteractionParamsSchema.parse({
      kind,
      ...(rawPayload.title !== undefined ? { title: rawPayload.title } : {}),
      ...(rawPayload.message !== undefined ? { message: rawPayload.message } : {}),
      ...(rawPayload.data !== undefined ? { data: rawPayload.data } : {}),
    });

    const rawResult = await this.requester.request(
      "host/interaction",
      validatedParams as Record<string, unknown>,
      this.timeoutMs,
    );

    return jsonValueSchema.parse(rawResult);
  }
}
