/**
 * Process liveness checking and lockfile ownership tracking / eviction.
 */
import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
// @ts-ignore proper-lockfile has untyped default export in some tsconfig settings
import lockfile from "proper-lockfile";
import { DurableStorageError } from "@durable-zero/core";

export interface SessionOwnerInfo {
	pid: number;
	id: string;
	cwd: string;
	startedAt: number;
}

export function isProcessAlive(pid: number): boolean {
	if (!pid || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (err: unknown) {
		return (err as NodeJS.ErrnoException).code === "EPERM";
	}
}

export function isVerifiedRunnerProcess(owner: SessionOwnerInfo): boolean {
	if (!isProcessAlive(owner.pid)) return false;
	try {
		const output = execFileSync("ps", ["-p", String(owner.pid), "-o", "command="], {
			encoding: "utf8",
			timeout: 1000,
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return output.includes("node") || output.includes("runner") || output.includes("durable") || output.includes("bb");
	} catch {
		return false;
	}
}

function logUnexpectedErr(err: unknown, allowedCode: string, context: string): void {
	if ((err as NodeJS.ErrnoException)?.code !== allowedCode) {
		console.warn(`[SessionStorage] ${context}: ${err instanceof Error ? err.message : String(err)}`);
	}
}

export async function writeOwnerFile(directory: string, owner: SessionOwnerInfo): Promise<void> {
	await writeFile(join(directory, "session.owner.json"), JSON.stringify(owner, null, 2), "utf8");
}

export async function readOwnerFile(directory: string): Promise<SessionOwnerInfo | null> {
	try {
		const content = await readFile(join(directory, "session.owner.json"), "utf8");
		return JSON.parse(content) as SessionOwnerInfo;
	} catch (err) {
		logUnexpectedErr(err, "ENOENT", `Corrupted or unreadable session.owner.json in ${directory}`);
		return null;
	}
}

export async function removeOwnerFile(directory: string): Promise<void> {
	await rm(join(directory, "session.owner.json"), { force: true }).catch((err: unknown) =>
		logUnexpectedErr(err, "ENOENT", `Failed to remove owner file in ${directory}`),
	);
}

export async function forceUnlock(directory: string): Promise<void> {
	await lockfile.unlock(directory, { realpath: false }).catch((err: unknown) =>
		logUnexpectedErr(err, "ENOENT", `unlock warning for ${directory}`),
	);
	await rm(`${directory}.lock`, { recursive: true, force: true }).catch((err: unknown) =>
		logUnexpectedErr(err, "ENOENT", `lockfile cleanup warning for ${directory}`),
	);
}

export async function acquireSessionLock(directory: string, cwd: string, id: string): Promise<() => Promise<void>> {
	const lockOpts = { realpath: false, retries: { retries: 2, minTimeout: 100, maxTimeout: 200 } };
	let rawRelease: () => Promise<void>;
	try {
		rawRelease = await lockfile.lock(directory, lockOpts);
	} catch (initialErr) {
		let owner = await readOwnerFile(directory);
		if (!owner) {
			await new Promise((r) => setTimeout(r, 100));
			owner = await readOwnerFile(directory);
		}
		if (!owner) throw new Error(`Session is already open in another process: ${directory}`, { cause: initialErr });

		const isAlive = isProcessAlive(owner.pid);
		const isRunner = isAlive && isVerifiedRunnerProcess(owner);
		if (!isAlive || !isRunner) {
			await forceUnlock(directory);
			await removeOwnerFile(directory);
			try {
				rawRelease = await lockfile.lock(directory, lockOpts);
			} catch (retryErr) {
				throw new DurableStorageError(`Session is already open in another process (PID: ${owner.pid}): ${directory}`, retryErr);
			}
		} else {
			throw new DurableStorageError(`Session is already open in another live process (PID: ${owner.pid}): ${directory}`, initialErr);
		}
	}

	await writeOwnerFile(directory, { pid: process.pid, id, cwd, startedAt: Date.now() });
	let released = false;
	return async () => {
		if (released) return;
		released = true;
		try {
			await removeOwnerFile(directory);
		} finally {
			await rawRelease();
		}
	};
}
