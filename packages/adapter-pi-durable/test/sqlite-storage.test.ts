import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PiDurableSessionStore } from "../src/index.ts";

describe("@durable-zero/adapter-pi-durable (SQLite Storage Integration)", () => {
	it("acquires lock, persists documents in SQLite, and releases lock safely", async () => {
		const dir = mkdtempSync(join(tmpdir(), "dz-sqlite-test-"));
		const store = new PiDurableSessionStore({ sessionDir: dir });

		try {
			await store.acquireLock();
			assert.equal(store.isLocked, true);

			await store.saveDocument("test_col", "doc1", { foo: "bar" });
			const read = await store.readDocument("test_col", "doc1");
			assert.deepEqual(read, { foo: "bar" });

			await store.releaseLock();
			assert.equal(store.isLocked, false);
		} finally {
			await store.close();
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
