ROLE: Independent BLACK-BOX product reviewer for Task-4B compiled COMPONENT, not production/native CLI acceptance.
Mandatory reading before action: workspace/project AGENTS; /Users/vanya/Projects/arch-improvement-skills/skills/arch-improvement-product-review/SKILL.md; arch-rules implementation review and actual arch-rules.md; relevant verification/good-tests skills IN FULL. No spawns, source edits, commits/push or ledger changes. Parent handles orchestration/immediate WIP backup. Commands <=60s, tests <=30s, own bounded finally teardown. No real model/network/auth/session databases.

ONLY CANDIDATE INPUTS:
- Runnable bundle /Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-4b/compiled-candidate/component-driver.mjs (EXECUTE, do not inspect its code).
- SHA256 7d8fb526e3cfcc1cefe4cf44eab67634ab38dab052a33668d3d2dd9be084db46; source provenance 49bcad1486a5101e20e8b88a616cc175a34fc3e9.
- Public API/spec /Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-4b/blackbox-input/api.md.
Do NOT read implementation source, diffs, original author tests/reports, builder README section 6, or build-manifest smoke outcomes/findings. Those are deliberately withheld to maintain independent consumer verification. Check artifact hash, then test real Node stdin/stdout subprocess as a fresh external consumer. Do not rebuild or patch candidate.

Scope: actual capability routing/typed args to authoritative SessionCoordinator + explicit TEST-ONLY in-memory engine port fixture. fixture/getCalls and fixture/reset expose real call traces, IDs fixture_sub_N are NOT native. State/metrics/transcript fixture outputs do NOT prove actual model/Harness/SQLite/persistence. Native Slice 0/host/probe/admin integration stays unaccepted separately.

Primary journeys:
- Happy path: valid prompt, image-only/mixed inputs, child/root routing, steer/followUp, model/thinking/policy/control/state calls; verify effects through fixture/getCalls, not only {ok:true}. Dynamic IDs observed rather than assumed.
- Cold fresh process and shutdown: no previous user mutations; setup/start calls may exist. Zero stdout protocol noise; SIGTERM bounded clean exit0; no orphan child.
- Error/recovery: unknown method => -32601; invalid params => -32602; ordinary internal failures => -32603 where API supports; errors do not break subsequent valid calls. IDs 0 and empty string preserved. Notifications mutate state but produce zero response, including errors. Explicit unsupported binding/register,binding/list,session/fork,tools/register is a declared limitation, never fake successful support.
Test appropriate adversarial argument validation, prompt combinations and forwarding using API only. Report user-visible lifecycle issues and attribute cross-scope dependencies accurately rather than inventing unsupported capabilities or blaming test fixture constants for absent native metrics.

Own ONLY /Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-4b/independent-product-review/ and private temp probe dirs. Save executable consumer test code, REAL Node reporter JUnit/log, structured per-journey results and report.md/findings.json. Canonical findings [P#] Evidence: ... Impact: ... Rule: AP-### Fix decision: ...; explicit scope PASS/FAIL, what remains untested, and Residual risk. P0–P2 block acceptance. Return first meaningful saved milestone <=10 minutes then HOLD for immediate parent push and same-context re-review if needed.
