# Milestone Report — Test-Only Model Provider Fixture Isolation

**Date:** 2026-11-05  
**Worker:** `thr_4yhrgipwed` (Runner Foundation & Test Fixture Lease)  
**Parent:** `@thread:thr_9yjb93iwmn`  
**Status:** REMEDIATION COMPLETE & VERIFIED (EXIT 0, 6/6 PASS IN 514ms) — TEST-ONLY SCOPE (NO PROD EDITS)  
**Deliverables Directory:** `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/model-provider-fixture/`

---

## 1. Executive Summary & Root Cause

### Defect
In `packages/adapter-pi-ai/test/model-provider.test.ts`, tests directly called `await ModelRuntime.create()` and assumed host user API keys/models existed in `~/.pi/agent` or `process.env`. In clean, isolated, keyless execution environments (such as clean CI or mechanical builds), `ModelRuntime` initializes with zero available models (`getAvailableSnapshot().length === 0`), causing 4 test failures:
1. `PiAiModelProvider lists available models from native ModelRuntime`: `Native runtime must provide registered models`
2. `PiAiModelProvider resolves valid model by id and normalizes model reference`: `Runtime must have available models`
3. `PiAiModelProvider resolves model when provider is omitted or prefixed in model string`: `Cannot read properties of undefined (reading 'provider')`
4. `PiAiModelProvider resolves fallback model when ref is undefined`: `Default model must be returned when ref is undefined`

### Test-Only Remediation (Zero Production Source Changes)
- Modified **exclusively** `packages/adapter-pi-ai/test/model-provider.test.ts`. Zero edits to `packages/adapter-pi-ai/src/` or any production bundle.
- Seeded a deterministic test provider using official SDK `fauxProvider` from `@earendil-works/pi-ai` with two models (`test-model-1` with reasoning, `test-model-2`).
- Registered the provider via native public method `runtime.registerNativeProvider(faux.provider)`.
- Configured auth using fixture-only fake credential via `await runtime.setRuntimeApiKey("test-provider", "fixture-fake-key")` and refreshed local snapshot without network (`await runtime.refresh({ allowNetwork: false })`).
- Enforced strict filesystem isolation (`HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `PI_AGENT_DIR` set to temporary directories; `PI_ADDITIONAL_EXTENSIONS` cleared) for each test.
- Preserved all original behavioral assertions and public semantics:
  * Model list and model reference validation
  * Explicit provider/model resolution
  * Composite string (`provider/model`) resolution
  * Provider-omitted resolution
  * Fail-fast error propagation on invalid model
  * Fallback default resolution on omitted ref

---

## 2. Verification Receipts & Evidence

### Authentic Isolated RED Baseline
- **Command:** `env -i PATH="$PATH" HOME=/tmp/... PI_AGENT_DIR=/tmp/... node --test --test-timeout=5000 packages/adapter-pi-ai/test/model-provider.test.ts`
- **Exit Code:** `1`
- **Result:** 2 pass, 4 fail (reproducing the exact root-test failures)
- **Artifact:** `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/model-provider-fixture/red-baseline.junit.xml`

### Authentic Isolated GREEN Verification
- **Command:** `env -i PATH="$PATH" HOME=/tmp/... PI_AGENT_DIR=/tmp/... node --test --test-timeout=5000 packages/adapter-pi-ai/test/model-provider.test.ts`
- **Exit Code:** `0`
- **Result:** 6 pass, 0 fail (514ms)
- **Artifacts:**
  * JUnit XML: `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/model-provider-fixture/green.junit.xml`
  * Raw Log: `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/model-provider-fixture/green.log`

---

## 3. Scope & Invariant Assurance

- **File Modified:** `packages/adapter-pi-ai/test/model-provider.test.ts` (ONLY).
- **Production Source Invariant:** `packages/adapter-pi-ai/src/` is completely untouched. Production hash is identical to frozen commit.
- **Root Source Invariant:** `packages/runner/src/` and `packages/adapter-pi-durable/src/` untouched.
- **Quiescence State:** Source-write quiescence active. Holding cleanly for parent checkpoint.
