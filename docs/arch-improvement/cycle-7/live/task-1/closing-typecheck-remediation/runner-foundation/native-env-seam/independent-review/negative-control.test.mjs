import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Negative Control: Native Seam Verification Fail-Fast Proof", () => {
	it("deliberately asserts a false condition to prove runner returns exit code 1 on failure", () => {
		// Deliberately fail: 1 !== 0
		assert.equal(1, 0, "Negative control assertion must fail and trigger exit code 1");
	});
});
