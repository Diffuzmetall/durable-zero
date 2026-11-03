/**
 * Session directory management and SQLite path resolution.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { acquireSessionLock, isProcessAlive, isVerifiedRunnerProcess, type SessionOwnerInfo } from "./session-lock-eviction.ts";

export { acquireSessionLock, isProcessAlive, isVerifiedRunnerProcess, type SessionOwnerInfo };

export function getAgentDir(): string {
	const custom = process.env.PI_CODING_AGENT_DIR;
	if (custom) return resolve(custom);
	return join(homedir(), ".pi", "agent");
}

export interface SessionLocation {
	id: string;
	directory: string;
	database: string;
	cwd: string;
	created: boolean;
	release(): Promise<void>;
}

export async function selectSession(
	cwdInput: string,
	continueSession: boolean,
	targetSession?: string,
): Promise<SessionLocation> {
	const cwd = await realpath(resolve(cwdInput));
	const root = join(getAgentDir(), "experimental", "durable-sessions", createHash("sha256").update(cwd).digest("hex").slice(0, 24));
	await mkdir(root, { recursive: true });

	let directory: string;
	let created = false;
	if (targetSession) {
		const clean = targetSession.endsWith(".sqlite") ? resolve(targetSession, "..") : targetSession;
		directory = (clean.includes("/") || clean.includes("\\")) ? resolve(clean) : join(root, clean);
		try {
			await mkdir(directory, { recursive: true });
			const entries = await readdir(directory);
			if (!entries.includes("session.sqlite")) {
				created = true;
			}
		} catch (err: unknown) {
			if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
				console.warn(`[SessionStorage] Directory inspection failed in ${directory}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	} else if (continueSession) {
		const entries = await readdir(root, { withFileTypes: true });
		const newest = entries
			.filter((entry) => entry.isDirectory() && /^\d{13}-[0-9a-f-]{36}$/u.test(entry.name))
			.map((entry) => entry.name)
			.sort()
			.at(-1);
		if (!newest) throw new Error(`No durable session exists for ${cwd}`);
		directory = join(root, newest);
	} else {
		directory = join(root, `${String(Date.now()).padStart(13, "0")}-${randomUUID()}`);
		await mkdir(directory);
		created = true;
	}

	const id = basename(directory);
	const release = await acquireSessionLock(directory, cwd, id);
	return { id, directory, database: join(directory, "session.sqlite"), cwd, created, release };
}

export function safeCloneRecord<T>(record: T): T {
	if (record === null || typeof record !== "object") {
		return record;
	}
	if (Array.isArray(record)) {
		return [...record] as unknown as T;
	}
	return { ...record };
}
