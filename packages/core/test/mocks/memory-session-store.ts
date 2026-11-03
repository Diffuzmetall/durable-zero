import type { ISessionStore, TaskRecord } from "../../src/session/store.ts";

export class MemorySessionStore implements ISessionStore {
	public sessionDir = "/memory/session";
	public isLocked = false;
	private documents = new Map<string, Map<string, unknown>>();
	private tasks: TaskRecord[] = [];
	private taskWatchers = new Set<(tasks: TaskRecord[]) => void>();

	async acquireLock(): Promise<void> {
		if (this.isLocked) throw new Error("Lock already held");
		this.isLocked = true;
	}

	async releaseLock(): Promise<void> {
		this.isLocked = false;
	}

	async saveDocument(collection: string, docId: string, data: unknown): Promise<void> {
		if (!this.documents.has(collection)) {
			this.documents.set(collection, new Map());
		}
		this.documents.get(collection)!.set(docId, structuredClone(data));
	}

	async readDocument(collection: string, docId: string): Promise<unknown | undefined> {
		const col = this.documents.get(collection);
		if (!col) return undefined;
		const val = col.get(docId);
		return val !== undefined ? structuredClone(val) : undefined;
	}

	async forkSession(_checkpointId: string | number, _newSessionDir: string): Promise<void> {
		// In-memory fork creates isolated clone
	}

	watchTasks(onUpdate: (tasks: TaskRecord[]) => void): { close(): void } {
		this.taskWatchers.add(onUpdate);
		onUpdate([...this.tasks]);
		return {
			close: () => {
				this.taskWatchers.delete(onUpdate);
			},
		};
	}

	async close(): Promise<void> {
		this.isLocked = false;
		this.taskWatchers.clear();
	}
}
