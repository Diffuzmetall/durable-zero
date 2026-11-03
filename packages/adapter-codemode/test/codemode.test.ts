import test from "node:test";
import assert from "node:assert/strict";
import {
	CodemodeExtension,
	createCodemodeBuiltinExtension,
} from "../src/codemode.ts";

function createMockContext(): { ctx: any; installed: any[] } {
	const installed: any[] = [];
	const mockRegistry = {
		install: (ext: any) => installed.push(ext),
	};
	const ctx = {
		cwd: process.cwd(),
		registry: mockRegistry,
		dynamicNamespaces: {
			getNamespaces: () => [],
		},
	};
	return { ctx, installed };
}

test("CodemodeExtension encapsulates native QuickJS sandbox per instance", async () => {
	const ext1 = createCodemodeBuiltinExtension();
	const ext2 = createCodemodeBuiltinExtension();

	assert.notEqual(ext1, ext2, "Instances must be distinct");

	const mock1 = createMockContext();
	const mock2 = createMockContext();

	ext1.register(mock1.ctx);
	ext2.register(mock2.ctx);

	assert.ok(ext1.sandbox, "ext1 must initialize sandbox");
	assert.ok(ext2.sandbox, "ext2 must initialize sandbox");
	assert.notEqual(ext1.sandbox, ext2.sandbox, "Sandboxes must not be shared between extensions");
	assert.equal(mock1.installed.length, 1, "ext1 must install extension into registry");
	assert.equal(mock2.installed.length, 1, "ext2 must install extension into registry");

	await ext1.teardown?.();
	assert.equal(ext1.sandbox, undefined, "ext1 sandbox reference must be cleared after teardown");
	assert.ok(ext2.sandbox, "ext2 sandbox must remain alive when ext1 tears down");

	await ext2.teardown?.();
	assert.equal(ext2.sandbox, undefined, "ext2 sandbox reference must be cleared after teardown");
});

test("CodemodeExtension tracks separate sandboxes per context", async () => {
	const ext = new CodemodeExtension();
	const mockA = createMockContext();
	const mockB = createMockContext();

	ext.register(mockA.ctx);
	const sbA = ext.getSandboxFor(mockA.ctx);
	assert.ok(sbA, "Context A must have associated sandbox");

	ext.register(mockB.ctx);
	const sbB = ext.getSandboxFor(mockB.ctx);
	assert.ok(sbB, "Context B must have associated sandbox");
	assert.notEqual(sbA, sbB, "Contexts must have separate sandboxes");

	await ext.teardown?.();
	assert.equal(ext.sandbox, undefined);
});
