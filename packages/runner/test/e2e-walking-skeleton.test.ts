import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const cliBin = path.resolve(root, "packages/cli/bin/durable-zero.js");
const extensionFixture = path.resolve(
	root,
	"packages/runner/test/fixtures/scripted-provider-extension.ts",
);

interface JsonRpcMessage {
	jsonrpc: "2.0";
	id?: string | number;
	method?: string;
	params?: any;
	result?: any;
	error?: any;
}

class JsonRpcProcessClient {
	public readonly process: ChildProcessWithoutNullStreams;
	private pending = new Map<
		string | number,
		{ resolve: (res: any) => void; reject: (err: Error) => void }
	>();
	public readonly notifications: JsonRpcMessage[] = [];
	private notificationWaiters: Array<{
		predicate: (msg: JsonRpcMessage) => boolean;
		resolve: (msg: JsonRpcMessage) => void;
	}> = [];
	private rl: readline.Interface;

	constructor(process: ChildProcessWithoutNullStreams) {
		this.process = process;
		this.rl = readline.createInterface({ input: process.stdout });

		this.rl.on("line", (line) => {
			const trimmed = line.trim();
			if (!trimmed || !trimmed.startsWith("{")) return;
			try {
				const parsed = JSON.parse(trimmed) as JsonRpcMessage;
				if (parsed.id !== undefined && (parsed.result !== undefined || parsed.error !== undefined)) {
					const waiter = this.pending.get(parsed.id);
					if (waiter) {
						this.pending.delete(parsed.id);
						if (parsed.error) {
							waiter.reject(new Error(JSON.stringify(parsed.error)));
						} else {
							waiter.resolve(parsed.result);
						}
					}
				} else if (parsed.method) {
					this.notifications.push(parsed);
					for (let i = 0; i < this.notificationWaiters.length; i++) {
						const waiter = this.notificationWaiters[i];
						if (waiter.predicate(parsed)) {
							this.notificationWaiters.splice(i, 1);
							waiter.resolve(parsed);
							break;
						}
					}
				}
			} catch {
				// Non-json stdout ignored
			}
		});
	}

	public async request(id: number | string, method: string, params: Record<string, unknown> = {}): Promise<any> {
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			const req: JsonRpcMessage = { jsonrpc: "2.0", id, method, params };
			this.process.stdin.write(JSON.stringify(req) + "\n");
		});
	}

	public waitForNotification(
		predicate: (msg: JsonRpcMessage) => boolean,
		timeoutMs = 15000,
	): Promise<JsonRpcMessage> {
		const existing = this.notifications.find(predicate);
		if (existing) return Promise.resolve(existing);

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				const idx = this.notificationWaiters.findIndex((w) => w.resolve === resolve);
				if (idx !== -1) this.notificationWaiters.splice(idx, 1);
				reject(new Error(`Timed out after ${timeoutMs}ms waiting for notification matching predicate`));
			}, timeoutMs);

			this.notificationWaiters.push({
				predicate,
				resolve: (msg) => {
					clearTimeout(timer);
					resolve(msg);
				},
			});
		});
	}

	public async stop(): Promise<number | null> {
		this.rl.close();
		return new Promise((resolve) => {
			if (this.process.exitCode !== null) {
				resolve(this.process.exitCode);
				return;
			}
			this.process.once("exit", (code) => resolve(code));
			this.process.kill("SIGTERM");
		});
	}
}

function spawnClient(sessionDir: string, tmpDir: string): JsonRpcProcessClient {
	const child = spawn(
		process.execPath,
		[
			cliBin,
			"serve",
			"--session",
			sessionDir,
			"--extension",
			extensionFixture,
			"--provider",
			"scripted-e2e",
			"--model",
			"echo",
		],
		{
			cwd: root,
			env: {
				...process.env,
				HOME: path.join(tmpDir, "home"),
				XDG_CONFIG_HOME: path.join(tmpDir, "config"),
				PI_AGENT_DIR: path.join(tmpDir, "agent"),
			},
			stdio: ["pipe", "pipe", "pipe"],
		},
	);

	child.stderr.on("data", (chunk) => {
		// Pass stderr to debug if needed
	});

	return new JsonRpcProcessClient(child);
}

test(
	"Slice 0 Walking Skeleton: End-to-end CLI JSON-RPC prompt streaming, persistence, and restart",
	{ timeout: 60000 },
	async (t) => {
		const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "dz-e2e-ws-"));
		const sessionDir = path.join(tmpBase, "session");
		await fs.mkdir(path.join(tmpBase, "home"), { recursive: true });
		await fs.mkdir(path.join(tmpBase, "config"), { recursive: true });
		await fs.mkdir(path.join(tmpBase, "agent"), { recursive: true });
		await fs.mkdir(sessionDir, { recursive: true });

		t.after(async () => {
			await fs.rm(tmpBase, { recursive: true, force: true }).catch(() => {});
		});

		// 1. First run: Start process
		const client1 = spawnClient(sessionDir, tmpBase);

		// 2. Send prompt: Echo: hello world
		const admission = await client1.request(1, "session/prompt", {
			content: "Echo: hello world",
		});

		assert.equal(admission.status, "accepted");
		assert.equal(admission.conversationId, "1");
		const observedRequestId = admission.id;
		assert.ok(typeof observedRequestId === "string" && observedRequestId.length > 0);

		// 3. Receive streaming text delta
		const textDeltaEvent = await client1.waitForNotification((msg) => {
			if (msg.method !== "session/event") return false;
			const evt = msg.params?.event ?? msg.params;
			if (evt?.type === "message_update") {
				const ame = evt.assistantMessageEvent;
				return ame?.type === "text_delta" && ame?.delta?.includes("Echo: hello world");
			}
			return false;
		});
		assert.ok(textDeltaEvent);

		// 4. Receive terminal turn_complete event with matching requestId
		const turnCompleteEvent = await client1.waitForNotification((msg) => {
			if (msg.method !== "session/event") return false;
			const evt = msg.params?.event ?? msg.params;
			return evt?.type === "turn_complete" && evt?.requestId === observedRequestId;
		});
		assert.ok(turnCompleteEvent);
		const turnPayload = (turnCompleteEvent.params?.event ?? turnCompleteEvent.params) as {
			status: string;
			requestId: string;
		};
		assert.equal(turnPayload.status, "completed");
		assert.equal(turnPayload.requestId, observedRequestId);

		// 5. Query session/getTranscript
		const transcript1 = await client1.request(2, "session/getTranscript", {});
		assert.ok(Array.isArray(transcript1.entries));
		const userEntry = transcript1.entries.find((e: any) => e.role === "user");
		const assistantEntry = transcript1.entries.find((e: any) => e.role === "assistant");
		assert.ok(userEntry, "User entry missing in transcript");
		assert.ok(assistantEntry, "Assistant entry missing in transcript");
		assert.equal(userEntry.text, "Echo: hello world");
		assert.equal(assistantEntry.text, "Echo: hello world");
		const userEntryId = userEntry.id;
		const assistantEntryId = assistantEntry.id;
		assert.ok(userEntryId);
		assert.ok(assistantEntryId);

		// 6. Stop process cleanly via SIGTERM
		const exitCode1 = await client1.stop();
		assert.equal(exitCode1, 0, "Process must exit cleanly with code 0 on SIGTERM");

		// 7. Second run: Restart process with SAME sessionDir
		const client2 = spawnClient(sessionDir, tmpBase);

		// 8. Query session/getState
		const state2 = await client2.request(3, "session/getState", {});
		assert.ok(state2.sessionId);
		assert.ok(state2.entryCount >= 2, `Expected entryCount >= 2 after restart, got ${state2.entryCount}`);

		// 9. Query session/getTranscript and verify matching IDs and text
		const transcript2 = await client2.request(4, "session/getTranscript", {});
		assert.ok(Array.isArray(transcript2.entries));
		const restoredUser = transcript2.entries.find((e: any) => e.id === userEntryId);
		const restoredAssistant = transcript2.entries.find((e: any) => e.id === assistantEntryId);
		assert.ok(restoredUser, "User entry ID must match exactly after restart");
		assert.ok(restoredAssistant, "Assistant entry ID must match exactly after restart");
		assert.equal(restoredUser.text, "Echo: hello world");
		assert.equal(restoredAssistant.text, "Echo: hello world");

		// 10. Send second prompt: Second turn
		const admission2 = await client2.request(5, "session/prompt", {
			content: "Second turn",
		});
		assert.equal(admission2.status, "accepted");
		const observedReq2 = admission2.id;

		await client2.waitForNotification((msg) => {
			const evt = msg.params?.event ?? msg.params;
			return evt?.type === "turn_complete" && evt?.requestId === observedReq2;
		});

		const stateAfterSecondPrompt = await client2.request(6, "session/getState", {});
		assert.ok(
			stateAfterSecondPrompt.entryCount >= 4,
			`Expected entryCount >= 4 after second turn, got ${stateAfterSecondPrompt.entryCount}`,
		);

		await client2.stop();
	},
);
