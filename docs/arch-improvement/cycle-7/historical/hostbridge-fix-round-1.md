# HostBridge Task 2A — bounded parent-inspection fix round 1/5

Your five-file candidate is safely checkpointed at 8e42698. Component is NOT accepted or wired to Harness. Keep exactly the existing five-file ownership; parent owns ledger and later mechanical checkpoints. Append your fix report and test evidence to the SAME cycle7-hostbridge-report.md. Do not spawn agents, change shared indexes, expand integration, commit or label S9 PASS.

- [P2] Extra payload field overrides the explicit interaction kind
  - Evidence: packages/runner/src/host/host-bridge.ts uses `{ kind, ...payload }`. Parent called real HostBridge.requestInteraction("confirm", JSON.parse('{"title":"Confirm operation","kind":"notify"}')) with an observing requester. Saved probe /Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/hostbridge-kind-boundary-probe.json shows outbound params.kind = "notify", not "confirm".
  - Impact: payload data controls the operation kind despite a separate explicit kind argument; runtime JavaScript callers bypass the TypeScript payload shape. A requested confirmation can become another interaction kind.
  - Rule: AP-022, AP-026.
  - Fix decision: fix-now. The explicit kind parameter is authoritative. Construct only declared payload fields with that kind, or reject an unexpected payload.kind; do not silently overwrite the requested operation.
  - Parent ruling (recorded in ledger): the plan's literal `{ kind, ...payload }` example was unsafe; this correction takes precedence. No new UI semantics or integration scope is introduced.

- [P2] Reported initial RED is only missing-module failure, not the required behavioral oracle
  - Evidence: report §2 records ERR_MODULE_NOT_FOUND for both original RED runs. The handoff explicitly required a genuine behavioral RED and said missing-module failure alone was insufficient. Those logs must remain recorded honestly, not relabeled as proof of runtime behavior.
  - Impact: green tests and a module-import error do not establish the promised negative-control/behavioral RED evidence.
  - Rule: AP-028, AP-076; canonical TDD/writing-good-tests and task handoff.
  - Fix decision: fix-now. If additional original behavioral RED artifacts exist, point parent to the exact files. If they do not, perform a truthful bounded behavioral RED→GREEN redo for the component/schema runtime behavior using the existing written tests and frozen contract: preserve the checkpoint, keep pure interface types, replace runtime implementation with a minimal valid unimplemented boundary so tests load and fail on actual behavior, observe/save those failures, then implement minimally from the contract/tests and observe GREEN. Do NOT claim this happened before the original implementation, copy the original logs into new evidence, or treat another import/parse error as the oracle. No need to rewrite unrelated code or redesign the component. If you cannot do this within the five-file boundary without affecting another writer, report the exact blocker instead.

New kind-override regression must be written and run RED before its fix. Cover schema valid/invalid behavior, real request dispatch/correlation/timeout as previously specified. Keep separate redo/fix-round RED/GREEN JUnit/log artifacts, actual commands and outcomes. No claimed zero-regression guarantee from file ownership alone. Public package exports/Harness/full-model E2E remain pending integration gates and must stay explicit in the updated report.
