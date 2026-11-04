import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Negative Control: Verification Harness Fail-Fast Behavior", () => {
	it("deliberately asserts a false condition to prove runner returns exit code 1 on failure", () => {
		// Deliberately fail: -32603 !== -32602
		assert.equal(-32603, -32602, "Negative control assertion must fail and trigger exit code 1");
	});
});
