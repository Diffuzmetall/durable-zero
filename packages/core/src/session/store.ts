export interface TaskRecord {
	id: string | number;
	conversationId: string | number;
	status: "pending" | "running" | "completed" | "aborted" | "failed";
	outcome?: unknown;
}

export interface ISessionStore {
	readonly sessionDir: string;
	readonly isLocked: boolean;
	acquireLock(): Promise<void>;
	releaseLock(): Promise<void>;
	saveDocument(collection: string, docId: string, data: unknown): Promise<void>;
	readDocument(collection: string, docId: string): Promise<unknown | undefined>;
	forkSession(checkpointId: string | number, newSessionDir: string): Promise<void>;
	watchTasks?(onUpdate: (tasks: TaskRecord[]) => void): { close(): void };
	close(): Promise<void>;
}
