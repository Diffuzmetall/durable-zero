import test from "node:test";
import assert from "node:assert/strict";
import {
	CodemodeExtension,
	createCodemodeBuiltinExtension,
} from "../src/index.ts";
import type { BuiltinExtensionContext } from "@durable-zero/adapter-pi-durable";

function createMockContext(): { ctx: BuiltinExtensionContext; installed: any[] } {
	const installed: any[] = [];
	const mockRegistry = {
		install: (ext: any) => installed.push(ext),
	};
	const ctx: BuiltinExtensionContext = {
		cwd: process.cwd(),
		registry: mockRegistry as any,
		dynamicNamespaces: {
			getNamespaces: () => [],
		} as any,
	};
	return { ctx, installed };
}

test("CodemodeExtension encapsulates sandbox per instance and does not share module singleton", async () => {
	const ext1 = createCodemodeBuiltinExtension();
	const ext2 = createCodemodeBuiltinExtension();

	assert.notEqual(ext1, ext2, "Factories must produce distinct extension instances");

	const mock1 = createMockContext();
	const mock2 = createMockContext();

	ext1.register(mock1.ctx);
	ext2.register(mock2.ctx);

	assert.ok(ext1.sandbox, "ext1 must have initialized its sandbox");
	assert.ok(ext2.sandbox, "ext2 must have initialized its sandbox");
	assert.notEqual(ext1.sandbox, ext2.sandbox, "Parallel instances must NOT share the same sandbox instance");

	let ext1Closed = false;
	let ext2Closed = false;

	const sb1 = ext1.sandbox as any;
	const origClose1 = sb1.close;
	sb1.close = async () => {
		ext1Closed = true;
		if (typeof origClose1 === "function") await origClose1.call(sb1);
	};

	const sb2 = ext2.sandbox as any;
	const origClose2 = sb2.close;
	sb2.close = async () => {
		ext2Closed = true;
		if (typeof origClose2 === "function") await origClose2.call(sb2);
	};

	// Teardown ext1 only
	await ext1.teardown?.();

	assert.equal(ext1Closed, true, "ext1 sandbox should be closed");
	assert.equal(ext2Closed, false, "ext2 sandbox must NOT be closed when ext1 tears down");
	assert.equal(ext1.sandbox, undefined, "ext1 sandbox reference must be cleared");
	assert.ok(ext2.sandbox, "ext2 sandbox must remain intact");

	// Teardown ext2
	await ext2.teardown?.();
	assert.equal(ext2Closed, true, "ext2 sandbox should now be closed");
	assert.equal(ext2.sandbox, undefined, "ext2 sandbox reference must be cleared");
});

test("CodemodeExtension tracks sandboxes per context when registered with multiple contexts", async () => {
	const ext = createCodemodeBuiltinExtension();
	const mockA = createMockContext();
	const mockB = createMockContext();

	ext.register(mockA.ctx);
	const sbA = ext.getSandboxFor(mockA.ctx);
	assert.ok(sbA, "Context A must have associated sandbox");

	ext.register(mockB.ctx);
	const sbB = ext.getSandboxFor(mockB.ctx);
	assert.ok(sbB, "Context B must have associated sandbox");
	assert.notEqual(sbA, sbB, "Context A and Context B must have distinct sandboxes");

	await ext.teardown?.();
	assert.equal(ext.sandbox, undefined);
});
