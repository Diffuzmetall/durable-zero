# Independent native Slice 0 black-box product review

Read workspace/project AGENTS and arch-improvement-product-review + architecture implementation review skills in full, then public installed Pi 1.5 model-provider/ExtensionAPI declarations as needed. Use actual AP rules, real receipts and scoped verdicts. Parent owns orchestration/commits/ledger. No children, source fixes, public API invention, original user sessions/DB/auth/network or deployment.

## Frozen public candidate
Source fc0909602e7969df080259a2e2d4a7114be450b8. Actual CLI artifact:
`/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/native-candidate/packages/cli/bin/durable-zero.js`
Actual compiled runner `packages/runner/dist/main.js` beneath same candidate root; independently built SHA256 `813931832b4f689713b67cafb3421f4a4fe328a7daa64259acf845f1572efff6`. Compute actual SHA before claiming match. SDKs pinned1.5. No mock engine component: actual native Harness, scheduling, SQLite and storage.

Use CLI serve with isolated temp HOME/XDG/agent directory/work/session; public `--extension <absolute caller fixture>` and `--provider scripted-e2e --model echo --no-global-extensions`. Confirm supported session flag from published API/run instructions (`--session` canonical author journey); do not silently test another default session. Public model fixture is caller INPUT at native-candidate/fixtures/scripted-provider-extension.mjs, not app implementation. You may read/modify/recreate this external model fixture and public SDK types for independent gated streaming, but NOT application source, sourcemaps, author tests/diffs or internal build findings. Execute production artifact only. No real LLM/API keys/network. Do not patch artifact.

Public minimum methods: `session/prompt` params `{content: <unique text>}`; `session/getState`; `session/getTranscript`. Notifications `session/event` contain canonical native event; require message_update.assistantMessageEvent.type=text_delta and delta, correlated turn_complete.requestId matching admission.id. Read actual envelopes; no invented expected IDs. Native SubmissionId differs from EntryId. This minimum candidate is not full Task4B production capability wiring; don't demand unsupported remaining Task2/3/4 methods as if approved complete.

## Empirical acceptance
- Cold startup, strict JSON-only stdout, readiness RPC handshake, stderr retained, pending requests rejected on child exit/error.
- Unique nonce prompt -> actual model boundary invocation -> two incremental text chunks. Crucially establish first wire delta BEFORE provider allowed completion, not merely before terminal event: implement an external test-only model-provider gate (temp file/own controlled async barrier at MODEL seam only) if timing alone cannot prove this. Never replay persisted assistant output as live.
- Correlated actual completion; read real user and assistant transcript entries, correct complete text, stable distinct opaque entry IDs (not just count or DB file existence).
- Another prompt in SAME process with shared prefix/different suffix to detect generation-reset/lost/replayed deltas; exact second complete reply, not ACK/count alone.
- Clean SIGTERM after readiness/work; actual exit code0; restart same explicit session directory in new OS process; identical previous user/assistant IDs and text; then another distinct completed reply with correct content and updated native entries.
- Bounded lifecycle/error recovery as supported public minimum; no private DB queries to fake green. Do not attribute pre-ready signal races or your test-client leaks to app without proof.

Own only `docs/arch-improvement/cycle-7/live/task-1/independent-product-review/` and temp fixtures/dirs. Save executable consumer test, external model fixture, real JUnit/log/command exits, wire observations, findings.json/review.md. All process/requests/test timeouts explicit: <=30s/test ordinarily, justified complete two-process journey <=120s total/60s per test; command tool timeout too. ALWAYS t.after/finally closes readline/stdin, pending timers, and only owned children with bounded TERM→KILL fallback. Use pipefail or direct reporter outputs; tee0 is not Node success.

First meaningful saved checkpoint <=10min then HOLD for immediate parent backup. Verdict is independent NATIVE WALKING PATH acceptance only, not all capabilities/whole Cycle, host integration, metrics, probe, typecheck or full suite. No claims from author green12 or builder startup smoke; derive your own result. Failures route to ORIGINAL author context; no production repair by reviewer.
