import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { forkSessionDatabase } from "@durable-zero/adapter-pi-durable";

test("forkSessionDatabase: forks database, prunes entries and tasks above checkpointId, and cleans locks", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "pi-session-fork-test-"));

	try {
		const sourceDir = join(tempDir, "source-session");
		const targetDir = join(tempDir, "target-session");
		mkdirSync(sourceDir, { recursive: true });

		const sourceDbPath = join(sourceDir, "session.sqlite");
		const db = new DatabaseSync(sourceDbPath);
		db.exec("PRAGMA journal_mode = WAL;");
		db.exec("CREATE TABLE entries (id INTEGER PRIMARY KEY, conversation_id INTEGER, record TEXT);");
		db.exec("CREATE TABLE tasks (id INTEGER PRIMARY KEY, status TEXT);");

		for (let i = 1; i <= 10; i++) {
			db.exec(`INSERT INTO entries VALUES (${i}, 1, '{"text":"entry ${i}"}');`);
			db.exec(`INSERT INTO tasks VALUES (${i}, 'completed');`);
		}

		// Simulate lock file and shm in source
		const lockFile = join(sourceDir, "session.owner.json");
		writeFileSync(lockFile, JSON.stringify({ pid: process.pid, id: "source", cwd: "/tmp", startedAt: Date.now() }));
		db.close();

		// Pre-create target dir with a stale lock to ensure cleanup
		mkdirSync(targetDir, { recursive: true });
		mkdirSync(`${targetDir}.lock`, { recursive: true });
		writeFileSync(join(targetDir, "session.owner.json"), "stale");
		writeFileSync(join(targetDir, "stale.lock"), "stale");

		forkSessionDatabase({
			sourceDir,
			targetDir,
			checkpointId: 5,
		});

		const targetDbPath = join(targetDir, "session.sqlite");
		assert.ok(existsSync(targetDbPath), "Target session database must exist");

		// Verify target records pruned above checkpointId = 5
		const targetDb = new DatabaseSync(targetDbPath, { readOnly: true });
		try {
			const entries = targetDb.prepare("SELECT id FROM entries ORDER BY id ASC").all() as Array<{ id: number }>;
			assert.deepEqual(entries.map((e) => e.id), [1, 2, 3, 4, 5]);

			const tasks = targetDb.prepare("SELECT id FROM tasks ORDER BY id ASC").all() as Array<{ id: number }>;
			assert.deepEqual(tasks.map((t) => t.id), [1, 2, 3, 4, 5]);
		} finally {
			targetDb.close();
		}

		// Verify locks and owner files removed from targetDir
		assert.equal(existsSync(`${targetDir}.lock`), false, "Target lock directory must be removed");
		assert.equal(existsSync(join(targetDir, "session.owner.json")), false, "Target owner file must be removed");
		assert.equal(existsSync(join(targetDir, "stale.lock")), false, "Target internal lock files must be removed");

		// Verify source remains intact with all 10 entries
		const verifySourceDb = new DatabaseSync(sourceDbPath, { readOnly: true });
		try {
			const sourceEntries = verifySourceDb.prepare("SELECT id FROM entries ORDER BY id ASC").all() as Array<{ id: number }>;
			assert.equal(sourceEntries.length, 10);
		} finally {
			verifySourceDb.close();
		}
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
