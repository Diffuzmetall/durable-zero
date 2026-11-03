import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";

export interface ForkSessionDatabaseOptions {
	sourceDir: string;
	targetDir: string;
	checkpointId?: string | number;
}

export function forkSessionDatabase(options: ForkSessionDatabaseOptions): void {
	let sourceDir = resolve(options.sourceDir);
	if (sourceDir.endsWith(".sqlite")) {
		sourceDir = resolve(sourceDir, "..");
	}

	const sourceDb = join(sourceDir, "session.sqlite");
	if (!existsSync(sourceDir) || !existsSync(sourceDb)) {
		throw new Error(`Cannot fork: source session database not found for "${options.sourceDir}"`);
	}

	let targetDir = resolve(options.targetDir);
	if (targetDir.endsWith(".sqlite")) {
		targetDir = resolve(targetDir, "..");
	}

	mkdirSync(targetDir, { recursive: true });
	const targetDb = join(targetDir, "session.sqlite");

	for (const suffix of ["", "-wal", "-shm"]) {
		const targetFile = `${targetDb}${suffix}`;
		if (existsSync(targetFile)) rmSync(targetFile, { force: true });
	}

	const sourceConn = new DatabaseSync(sourceDb);
	try {
		try {
			sourceConn.exec("PRAGMA wal_checkpoint(TRUNCATE);");
		} catch {
			// Ignore checkpoint errors if database is read-only
		}
		const escapedTarget = targetDb.replace(/'/g, "''");
		sourceConn.exec(`VACUUM INTO '${escapedTarget}';`);
	} finally {
		sourceConn.close();
	}

	const db = new DatabaseSync(targetDb);
	try {
		db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
		if (options.checkpointId !== undefined) {
			const entryId = Number(options.checkpointId);
			if (Number.isFinite(entryId) && entryId > 0) {
				const hasEntries = db.prepare("SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?").get("table", "entries");
				if (hasEntries) {
					db.prepare("DELETE FROM entries WHERE id > ?").run(entryId);
				}
				const hasTasks = db.prepare("SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?").get("table", "tasks");
				if (hasTasks) {
					db.prepare("DELETE FROM tasks WHERE id > ?").run(entryId);
				}
			}
		}
	} finally {
		db.close();
	}

	const targetLockDir = `${targetDir}.lock`;
	if (existsSync(targetLockDir)) {
		rmSync(targetLockDir, { recursive: true, force: true });
	}
	if (existsSync(targetDir)) {
		const entries = readdirSync(targetDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name.endsWith(".lock") || entry.name === ".lock" || entry.name === "session.owner.json") {
				rmSync(join(targetDir, entry.name), { recursive: true, force: true });
			}
		}
	}
}
