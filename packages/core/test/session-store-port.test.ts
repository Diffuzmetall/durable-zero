import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ISessionStore } from "../src/session/store.ts";
import { MemorySessionStore } from "./mocks/memory-session-store.ts";

describe("ISessionStore Domain Port (AP-010, AP-012)", () => {
	it("provides in-memory session persistence without disk or native binaries", async () => {
		const store: ISessionStore = new MemorySessionStore();
		await store.acquireLock();
		assert.equal(store.isLocked, true);

		await store.saveDocument("settings", "active", { theme: "sovereign" });
		const doc = await store.readDocument("settings", "active");
		assert.deepEqual(doc, { theme: "sovereign" });

		await store.releaseLock();
		assert.equal(store.isLocked, false);
	});
});
