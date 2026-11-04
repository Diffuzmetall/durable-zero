export interface HostToolCallContent {
  type: "text";
  text: string;
}

export interface HostToolCallResult {
  content: Array<HostToolCallContent>;
  isError?: boolean;
}

export interface HostInteractionPayload {
  title?: string;
  message?: string;
  data?: unknown;
}

export interface IHostBridge {
  forwardToolCall(
    toolName: string,
    args: unknown,
  ): Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
  requestInteraction(
    kind: string,
    payload: {
      title?: string;
      message?: string;
      data?: unknown;
    },
  ): Promise<unknown>;
}
