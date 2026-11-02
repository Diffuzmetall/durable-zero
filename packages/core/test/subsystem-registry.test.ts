import test from "node:test";
import assert from "node:assert/strict";
import { SubsystemRegistry } from "../src/subsystems/registry.ts";
import type { EngineSubsystem } from "../src/subsystems/types.ts";
import { EngineSubsystemError } from "../src/shared/errors.ts";

test("SubsystemRegistry: registers, gets, and lists subsystems", () => {
	const registry = new SubsystemRegistry();

	const s1: EngineSubsystem = {
		id: "test-subsystem-1",
		name: "Test Subsystem 1",
		version: "1.0.0",
		register: () => {},
	};

	registry.register(s1);
	assert.equal(registry.get("test-subsystem-1"), s1);
	assert.equal(registry.get("non-existent"), undefined);
	assert.deepEqual(registry.list(), [s1]);
});

test("SubsystemRegistry: throws on duplicate subsystem id", () => {
	const registry = new SubsystemRegistry();

	const s1: EngineSubsystem = {
		id: "dup-id",
		name: "Subsystem 1",
		version: "1.0.0",
		register: () => {},
	};
	const s2: EngineSubsystem = {
		id: "dup-id",
		name: "Subsystem 2",
		version: "2.0.0",
		register: () => {},
	};

	registry.register(s1);
	assert.throws(
		() => registry.register(s2),
		(err: unknown) => {
			assert.ok(err instanceof EngineSubsystemError);
			assert.equal((err as EngineSubsystemError).code, "SUBSYSTEM_ERROR");
			return true;
		},
	);
});

test("SubsystemRegistry: runs teardownAll in reverse order", async () => {
	const registry = new SubsystemRegistry();
	const order: string[] = [];

	const s1: EngineSubsystem = {
		id: "s1",
		name: "Subsystem 1",
		version: "1.0.0",
		register: () => {},
		teardown: () => { order.push("s1"); },
	};
	const s2: EngineSubsystem = {
		id: "s2",
		name: "Subsystem 2",
		version: "1.0.0",
		register: () => {},
		teardown: () => { order.push("s2"); },
	};

	registry.register(s1);
	registry.register(s2);

	await registry.teardownAll();
	assert.deepEqual(order, ["s2", "s1"]);
});
