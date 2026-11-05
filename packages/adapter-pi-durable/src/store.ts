import { basename, join, resolve } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { JsonValue } from "@earendil-works/chord";
import {
	createSession,
	defineDocFamily,
	type JsonObject,
	type Session,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import type { ISessionStore, TaskRecord } from "@durable-zero/core";
import { acquireSessionLock } from "./session-lock-eviction.ts";
import { forkSessionDatabase } from "./session-fork.ts";

export interface PiDurableSessionStoreOptions {
	sessionDir: string;
	cwd?: string;
}

function toJsonValue(val: unknown, depth = 0): JsonValue {
	if (depth > 128) throw new TypeError("JSON structure depth limit exceeded");
	if (val === null || typeof val === "string" || typeof val === "boolean") return val;
	if (typeof val === "number") {
		if (!Number.isFinite(val)) throw new TypeError(`Non-finite number cannot be serialized to JsonValue: ${val}`);
		return val;
	}
	if (Array.isArray(val)) {
		return val.map((item) => toJsonValue(item, depth + 1));
	}
	if (typeof val === "object") {
		const result: JsonObject = {};
		for (const [k, v] of Object.entries(val)) {
			if (v !== undefined) {
				result[k] = toJsonValue(v, depth + 1);
			}
		}
		return result;
	}
	throw new TypeError(`Unsupported data type cannot be serialized to JsonValue: ${typeof val}`);
}

const genericDocFamily = defineDocFamily<JsonObject, null>({
	family: true,
	checkpointWhen: () => false,
	kind: "dz.document",
	version: 1,
	scope: "session",
	initial: () => ({}),
});

export class PiDurableSessionStore implements ISessionStore {
	readonly sessionDir: string;
	private readonly cwd: string;
	private releaseLockFn: (() => Promise<void>) | null = null;
	private sessionInstance: Session | null = null;

	constructor(options: PiDurableSessionStoreOptions) {
		this.sessionDir = resolve(options.sessionDir);
		this.cwd = options.cwd ? resolve(options.cwd) : process.cwd();
	}

	get isLocked(): boolean {
		return this.releaseLockFn !== null;
	}

	private async getSession(): Promise<Session> {
		if (!this.sessionInstance) {
			const dbPath = join(this.sessionDir, "session.sqlite");
			const storage = await openNodeSqliteStorage(dbPath);
			this.sessionInstance = createSession(storage);
		}
		return this.sessionInstance;
	}

	async acquireLock(): Promise<void> {
		if (this.isLocked) throw new Error(`Lock already held for session: ${this.sessionDir}`);
		const id = basename(this.sessionDir);
		this.releaseLockFn = await acquireSessionLock(this.sessionDir, this.cwd, id);
	}

	async releaseLock(): Promise<void> {
		if (this.releaseLockFn) {
			const release = this.releaseLockFn;
			this.releaseLockFn = null;
			await release();
		}
	}

	async saveDocument(collection: string, docId: string, data: unknown): Promise<void> {
		const jsonVal = toJsonValue(data);
		const session = await this.getSession();
		await session.commit(async (tx) => {
			const doc = await tx.doc(genericDocFamily, `${collection}:${docId}`, null);
			for (const key of Object.keys(doc)) {
				delete (doc as Record<string, unknown>)[key];
			}
			if (jsonVal !== null && typeof jsonVal === "object" && !Array.isArray(jsonVal)) {
				Object.assign(doc, jsonVal);
			} else {
				doc._value = jsonVal;
			}
		}, BACKGROUND_CONTEXT);
	}

	async readDocument(collection: string, docId: string): Promise<unknown | undefined> {
		const session = await this.getSession();
		const snap = await session.snapshot(genericDocFamily, `${collection}:${docId}`, BACKGROUND_CONTEXT);
		if (!snap || Object.keys(snap).length === 0) return undefined;
		if ("_value" in snap && Object.keys(snap).length === 1) {
			return snap._value;
		}
		return structuredClone(snap);
	}

	async forkSession(checkpointId: string | number, newSessionDir: string): Promise<void> {
		await forkSessionDatabase({
			sourceDir: this.sessionDir,
			targetDir: newSessionDir,
			...(checkpointId !== undefined ? { checkpointId } : {}),
		});
	}

	watchTasks(onUpdate: (tasks: TaskRecord[]) => void): { close(): void } {
		onUpdate([]);
		return { close: () => {} };
	}

	async close(): Promise<void> {
		if (this.sessionInstance) {
			const session = this.sessionInstance;
			this.sessionInstance = null;
			await session.close(BACKGROUND_CONTEXT);
		}
		await this.releaseLock();
	}
}
