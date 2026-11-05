import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Negative Control: Verification Harness Fail-Fast Behavior (Remediation B)", () => {
	it("deliberately asserts a false condition to prove runner returns exit code 1 on failure", () => {
		// Deliberately fail: 0 !== 29
		assert.equal(29, 0, "Negative control assertion must fail and trigger exit code 1");
	});
});
