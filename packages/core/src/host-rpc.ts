export interface PendingToolCall {
	resolve: (res: { content: Array<{ type: "text"; text: string }>; isError: boolean }) => void;
	timer: NodeJS.Timeout;
}

export interface PendingInteraction {
	resolve: (res: unknown) => void;
	timer: NodeJS.Timeout;
}

export type ExtensionUIDialogRequester = (
	kind: "select" | "confirm" | "input" | "editor" | "notify" | string,
	payload: { title?: string; message?: string; data?: unknown },
) => Promise<unknown>;

export class HostRpcManager {
	private pendingToolCalls = new Map<string, PendingToolCall>();
	private pendingInteractions = new Map<string | number, PendingInteraction>();
	private nextCallSeq = 0;
	private nextInteractionSeq = 0;
	private output: (data: unknown) => void;

	constructor(output: (data: unknown) => void) {
		this.output = output;
	}

	public forwardToolCall = (
		toolName: string,
		args: unknown,
	): Promise<{ content: Array<{ type: "text"; text: string }>; isError: boolean }> => {
		const callId = `call_${Date.now()}_${++this.nextCallSeq}`;
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.pendingToolCalls.delete(callId);
				resolve({ content: [{ type: "text", text: `Tool call ${toolName} timed out` }], isError: true });
			}, 120_000);
			this.pendingToolCalls.set(callId, { resolve, timer });
			this.output({ type: "host_tool_call", callId, toolName, arguments: args ?? {} });
		});
	};

	public requestInteraction: ExtensionUIDialogRequester = (
		kind,
		payload,
	): Promise<unknown> => {
		const id = `interact_${Date.now()}_${++this.nextInteractionSeq}`;
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.pendingInteractions.delete(id);
				resolve(null);
			}, 180_000);
			this.pendingInteractions.set(id, { resolve, timer });
			this.output({
				type: "host_interaction_request",
				id,
				interactionKind: kind,
				dialogKind: kind,
				title: payload.title,
				message: payload.message,
				data: payload.data,
			});
		});
	};

	public handleHostToolResult(cmd: { callId?: string; result?: unknown; isError?: boolean }): boolean {
		const callId = String(cmd.callId ?? "");
		const pending = this.pendingToolCalls.get(callId);
		if (!pending) return false;

		clearTimeout(pending.timer);
		this.pendingToolCalls.delete(callId);

		let content: Array<{ type: "text"; text: string }>;
		if (Array.isArray(cmd.result)) {
			content = cmd.result as Array<{ type: "text"; text: string }>;
		} else if (
			cmd.result &&
			typeof cmd.result === "object" &&
			"content" in cmd.result &&
			Array.isArray((cmd.result as { content: unknown }).content)
		) {
			content = (cmd.result as { content: Array<{ type: "text"; text: string }> }).content;
		} else {
			content = [{ type: "text", text: typeof cmd.result === "string" ? cmd.result : JSON.stringify(cmd.result ?? "") }];
		}

		pending.resolve({ content, isError: Boolean(cmd.isError) });
		return true;
	}

	public handleHostInteractionResponse(cmd: { id?: string | number; result?: unknown }): boolean {
		const id = (cmd.id ?? "");
		const pending = this.pendingInteractions.get(id);
		if (!pending) return false;

		clearTimeout(pending.timer);
		this.pendingInteractions.delete(id);
		pending.resolve(cmd.result ?? null);
		return true;
	}
}
