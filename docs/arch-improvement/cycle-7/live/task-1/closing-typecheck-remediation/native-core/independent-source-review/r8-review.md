# Cycle 7 Task 1: Independent Architecture & Spec Review — R8 Draft Candidate

**Date:** November 5, 2026  
**Reviewer Role:** Independent SOURCE/SPEC Architecture Reviewer (Separate circuit, non-author)  
**Target Candidate Commit:** `2cc724f3c73a544d161015ae4fdcf8539d76e6a5` (Frozen Candidate)  
**Governing Rules:** `/Users/vanya/Projects/arch-rules/arch-rules.md` (AP-010 ... AP-076), Cycle 7 Canonical Plan, Binding Rulings R1–R8  
**Artifact Directory:** `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/`  
**Review Verdict:** **VERDICT: FAIL (SEMANTIC - 4 Blocking Defect Groups on Frozen 2cc)**

---

## 1. Executive Summary & Status Overview

1. **Compilation Gate:** **PASS.**
   - Official `pnpm run typecheck` (`tsc -p tsconfig.src.json --pretty false`) verified with exit code 0 and zero diagnostics.
   - Previous compiler blocker `FND-T1-12` (the 2 `runtime-loader.ts` ABI errors) is confirmed **CLOSED**.
2. **Semantic Verification:** **FAIL (1 PASS / 17 FAIL in 143ms).**
   - Expanded empirical probe suite (`probe-r8-frozen.test.ts`) executed against frozen candidate `2cc724f3c73a544d161015ae4fdcf8539d76e6a5`.
   - Results: **1 PASS** (Negative Control baseline), **17 FAIL** (confirming all 4 defect groups including exact negative variants for error code prioritization, in-flight cleanup draining, cancellable context refusal, non-file stat handling, and legacy constructor validation).
   - Measured JUnit XML saved to [`probe-r8-frozen.junit.xml`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/probe-r8-frozen.junit.xml).

---

## 2. Frozen Candidate Checksums (`2cc724f3c73a544d161015ae4fdcf8539d76e6a5`)

| Audited Component | Source File Path | SHA-256 Checksum |
| :--- | :--- | :--- |
| Core Execution Env Adapter | `packages/adapter-pi-durable/src/engine/core-execution-env-adapter.ts` | `7202a5832d91d46c2d9488cf3626469d842e96f7cf529db9f2ac34a8f81d2570` |
| Harness Setup (ExecutionEnvs) | `packages/adapter-pi-durable/src/engine/harness-setup.ts` | `68d14c293883d683b15f762dc4714a2375c012c139a196edb0e5642e43918e30` |

---

## 3. Detailed Adjudication of the 4 Defect Groups & Negative Variants

### [P1] R8-01: Unsupported Operations and Metadata Reported as Success
- **File:** `packages/adapter-pi-durable/src/engine/core-execution-env-adapter.ts:36-40, 72-88, 95-116`
- **Rule:** `AP-026, AP-076`
- **Findings & Empirical Proof:**
  - **Probe 1.1:** `flushFile` returns `ok(undefined)` despite Core `IExecutionEnvironment` having zero flush capability. Under R8 and SDK semantics, unrepresentable operations must return `err(new FileError("not_supported", ...))`. (*Assertion failed: `true !== false`*).
  - **Probe 1.2:** `listFiles` hardcodes `kind: "file"` for all entries (including subdirectories) and asserts `truncated: false` without truncation knowledge. (*Assertion failed: `true !== false`*).
  - **Probe 1.3:** Constructor generates a random string ID (`core-env-${Math.random()}`) rather than preserving the immutable filesystem namespace identity `coreEnv.id`. (*Assertion failed: `core-env-0b052f !== core-env-canonical-101`*).
  - **Probe 1.4:** `fileInfo` forces `kind: "file"` when neither `isFile` nor `isDirectory` is true (e.g. sockets/pipes/devices), instead of returning `err(FileError("not_supported"))`. (*Assertion failed: `true !== false`*).
- **Status:** **OPEN (FAIL)**.

### [P2] R8-02: Permission, Cancellation and Unknown Errors Masquerade as Missing Files
- **File:** `packages/adapter-pi-durable/src/engine/core-execution-env-adapter.ts:42-70`
- **Rule:** `AP-012, AP-022, AP-026`
- **Findings & Empirical Proof:**
  - **Probe 2.1:** `readTextFile` catches all errors and returns `FileError("not_found")`. When `readFile` throws an `EACCES` permission error, the adapter reports the file as non-existent rather than permission denied. (*Assertion failed: `'not_found' !== 'permission_denied'`*).
  - **Probe 2.2:** `exists` catches all errors (including `EACCES` or aborted operations) and returns `ok(false)`. An unreadable file is reported as missing, masking security and operational failures. (*Assertion failed: `true !== false`*).
  - **Probe 2.3:** `readTextFile` ignores caller cancellation and delegates to Core `readFile` even when `context.abortSignal.aborted === true`. (*Assertion failed: Core `readFile` invoked despite aborted context*).
  - **Probe 2.4:** `toFileError` prioritizes substring matching ('not found') over structured error codes (`EACCES`), causing permission errors with descriptive messages to masquerade as missing files. (*Assertion failed: `'not_found' !== 'permission_denied'`*).
- **Status:** **OPEN (FAIL)**.

### [P2] R8-03: Async Environment Cache and Cleanup Do Not Ensure Single Ownership
- **File:** `packages/adapter-pi-durable/src/engine/harness-setup.ts:120-175`
- **Rule:** `AP-023, AP-034, AP-074`
- **Findings & Empirical Proof:**
  - **Probe 3.1:** `getOrCreate` checks `this.#envs.get(key)` before awaiting the factory, allowing concurrent calls with the same `cwd` to spawn multiple distinct adapter instances. (*Assertion failed: distinct instances created for concurrent call*).
  - **Probe 3.2:** If the factory returns the same underlying `IExecutionEnvironment` for two distinct keys (e.g. `/workspace/dirA` and `/workspace/dirB`), two separate `CoreExecutionEnvAdapter` instances are stored in `#uniqueEnvs`, causing `cleanup` to be invoked twice on the same Core object. (*Assertion failed: `cleanup` called 2 times instead of 1*).
  - **Probe 3.3:** In `cleanup(context)`, iterating over `envsToClean` with `await env.cleanup(context)` halts immediately upon the first thrown exception, silently skipping cleanup for all remaining environments. (*Assertion failed: subsequent environment cleanup was not invoked*).
  - **Probe 3.4:** Legacy string constructor `new ExecutionEnvs("/app")` without factory does not throw a fail-fast configuration error. (*Assertion failed: missing expected exception*).
  - **Probe 3.5:** In-flight creations during `cleanup` are not drained, allowing factories resolving after disposal to leak uncleaned environments and corrupt closed state. (*Assertion failed: post-cleanup access did not reject*).
- **Status:** **OPEN (FAIL)**.

### [P2] R8-04: Core Exec Pretends to Implement Unsupported Native Shell Semantics
- **File:** `packages/adapter-pi-durable/src/engine/core-execution-env-adapter.ts:118-144`
- **Rule:** `AP-023, AP-026, AP-076`
- **Findings & Empirical Proof:**
  - **Probe 4.1:** `options.onOutput` requires real-time chunk streaming in arrival order. The adapter runs the entire command to completion and then fake-replays all `stdout` followed by all `stderr`, returning `ok({ exitCode })` instead of rejecting with `shell_unavailable`. (*Assertion failed: `true !== false`*).
  - **Probe 4.2:** Unsupported options (`spill`, `window`, `inheritEnv`) are silently ignored rather than returning typed `ExecutionError("shell_unavailable")`. (*Assertion failed: `true !== false`*).
  - **Probe 4.3:** `exec` does not check `context.abortSignal.aborted` or handle context cancellation, executing commands to completion even after abort. (*Assertion failed: Core `exec` invoked despite aborted context*).
  - **Probe 4.4:** `exec` fails to refuse cancellable contexts (`context.abortSignal !== undefined`) up front, despite pure Core having no cancellation signal contract. (*Assertion failed: `true !== false`*).
- **Status:** **OPEN (FAIL)**.

---

## 4. Empirical Test Results Matrix (`probe-r8-frozen.test.ts`)

```
✔ NEGATIVE CONTROL: Baseline readTextFile on supported Core env returns ok (0.73ms)
✖ GROUP 1.1 (R8-01): flushFile must return err(FileError('not_supported')) (0.64ms)
✖ GROUP 1.2 (R8-01): listFiles must not invent metadata or truncated=false (0.17ms)
✖ GROUP 1.3 (R8-01): Constructor must preserve underlying coreEnv.id (0.27ms)
✖ GROUP 1.4 (R8-01): fileInfo must return not_supported if neither isFile nor isDirectory is true (0.12ms)
✖ GROUP 2.1 (R8-02): readTextFile must preserve permission_denied error (0.14ms)
✖ GROUP 2.2 (R8-02): exists must not return ok(false) on permission denied (0.10ms)
✖ GROUP 2.3 (R8-02): readTextFile must return aborted when context is cancelled (0.13ms)
✖ GROUP 2.4 (R8-02): toFileError must prioritize structured EACCES code over 'not found' text in message (0.10ms)
✖ GROUP 3.1 (R8-03): Concurrent same-key getOrCreate must return the identical instance (11.18ms)
✖ GROUP 3.2 (R8-03): Same Core instance for 2 keys must only have cleanup called once (0.25ms)
✖ GROUP 3.3 (R8-03): Cleanup failure on first env must not prevent cleanup of subsequent envs (0.18ms)
✖ GROUP 3.4 (R8-03): Legacy string ctor without factory must throw configuration error (0.08ms)
✖ GROUP 3.5 (R8-03): In-flight creation during cleanup must be drained and not leak uncleaned env (0.08ms)
✖ GROUP 4.1 (R8-04): exec with onOutput must reject with shell_unavailable (0.09ms)
✖ GROUP 4.2 (R8-04): exec with spill/window must reject with shell_unavailable (0.07ms)
✖ GROUP 4.3 (R8-04): exec must abort when context is cancelled (0.08ms)
✖ GROUP 4.4 (R8-04): exec must refuse cancellable contexts up front (no signal contract in Core) (0.05ms)

Total: 18 | Passed: 1 | Failed: 17 | Duration: 143.07ms
```

---

## 5. Review Conclusion & Next Step

**VERDICT: FAIL (SEMANTIC - 4 Blocking Defect Groups on Frozen 2cc)**

The typecheck gate is clean (0 errors), but candidate `2cc724f3c73a544d161015ae4fdcf8539d76e6a5` fails the semantic specification across all 4 defect groups and their negative variants. 

All empirical evidence is preserved in:
- [`probe-r8-frozen.test.ts`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/probe-r8-frozen.test.ts)
- [`probe-r8-frozen.junit.xml`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/probe-r8-frozen.junit.xml)
- [`findings.json`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/findings.json)
- [`r8-review.md`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/r8-review.md)

Quiescing in the same context to immediately replay this test suite against Author A's consolidated candidate when provided.
