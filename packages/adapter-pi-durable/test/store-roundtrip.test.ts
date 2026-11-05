import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PiDurableSessionStore } from "../src/store.ts";

describe("PiDurableSessionStore Roundtrip and Persistence", () => {
	it("saves, reads, reopens from disk, and rejects invalid non-JSON types", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "dz-store-test-"));
		try {
			const store1 = new PiDurableSessionStore({ sessionDir: tempDir });
			await store1.acquireLock();

			// 1. Save and read structured object
			const complexObj = {
				name: "test-doc",
				count: 42,
				nested: { active: true, tags: ["a", "b"] },
			};
			await store1.saveDocument("my-col", "doc-1", complexObj);
			const read1 = await store1.readDocument("my-col", "doc-1");
			assert.deepEqual(read1, complexObj);

			// 2. Save and read primitive value (_value wrapping)
			await store1.saveDocument("my-col", "doc-prim", "hello string");
			const readPrim = await store1.readDocument("my-col", "doc-prim");
			assert.equal(readPrim, "hello string");

			// 3. Save and read array
			await store1.saveDocument("my-col", "doc-arr", [1, 2, 3]);
			const readArr = await store1.readDocument("my-col", "doc-arr");
			assert.deepEqual(readArr, [1, 2, 3]);

			// 4. Reject invalid non-JSON data types explicitly
			await assert.rejects(
				async () => store1.saveDocument("my-col", "doc-bad", () => {}),
				{ name: "TypeError", message: /Unsupported data type/ },
			);
			await assert.rejects(
				async () => store1.saveDocument("my-col", "doc-nan", Number.NaN),
				{ name: "TypeError", message: /Non-finite number/ },
			);
			await assert.rejects(
				async () => store1.saveDocument("my-col", "doc-sym", Symbol("bad")),
				{ name: "TypeError", message: /Unsupported data type/ },
			);

			await store1.releaseLock();
			await store1.close();

			// 5. Reopen session store from existing SQLite disk path
			const store2 = new PiDurableSessionStore({ sessionDir: tempDir });
			await store2.acquireLock();
			const reloadedObj = await store2.readDocument("my-col", "doc-1");
			assert.deepEqual(reloadedObj, complexObj);
			const reloadedPrim = await store2.readDocument("my-col", "doc-prim");
			assert.equal(reloadedPrim, "hello string");
			await store2.releaseLock();
			await store2.close();
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});
});
