import test from "node:test";
import assert from "node:assert/strict";
import { BuiltinExtensionRegistry } from "../src/builtin-extensions/registry.ts";
import type { BuiltinExtension } from "../src/builtin-extensions/types.ts";
import { BuiltinExtensionError } from "../src/shared/errors.ts";

test("BuiltinExtensionRegistry: registers, gets, and lists built-in extensions", () => {
	const registry = new BuiltinExtensionRegistry();

	const e1: BuiltinExtension = {
		id: "test-ext-1",
		name: "Test Extension 1",
		version: "1.0.0",
		register: () => {},
	};

	registry.register(e1);
	assert.equal(registry.get("test-ext-1"), e1);
	assert.equal(registry.get("non-existent"), undefined);
	assert.deepEqual(registry.list(), [e1]);
});

test("BuiltinExtensionRegistry: throws on duplicate extension id", () => {
	const registry = new BuiltinExtensionRegistry();

	const e1: BuiltinExtension = {
		id: "dup-id",
		name: "Extension 1",
		version: "1.0.0",
		register: () => {},
	};
	const e2: BuiltinExtension = {
		id: "dup-id",
		name: "Extension 2",
		version: "2.0.0",
		register: () => {},
	};

	registry.register(e1);
	assert.throws(
		() => registry.register(e2),
		(err: unknown) => {
			assert.ok(err instanceof BuiltinExtensionError);
			assert.equal((err as BuiltinExtensionError).code, "SUBSYSTEM_ERROR");
			return true;
		},
	);
});

test("BuiltinExtensionRegistry: runs teardownAll in reverse order", async () => {
	const registry = new BuiltinExtensionRegistry();
	const order: string[] = [];

	const e1: BuiltinExtension = {
		id: "e1",
		name: "Extension 1",
		version: "1.0.0",
		register: () => {},
		teardown: () => { order.push("e1"); },
	};
	const e2: BuiltinExtension = {
		id: "e2",
		name: "Extension 2",
		version: "1.0.0",
		register: () => {},
		teardown: () => { order.push("e2"); },
	};

	registry.register(e1);
	registry.register(e2);

	await registry.teardownAll();
	assert.deepEqual(order, ["e2", "e1"]);
});
