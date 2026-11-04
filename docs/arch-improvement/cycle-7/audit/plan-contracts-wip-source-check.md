# Parent source check of current contract patch (not final S7)

Reviewed WIP after real saved plan patches; scope remains the same four contracts. Native controller.compact/setModel/setThinkingLevel, subagentPolicyHolder.setRecord and harness.abortTask DO exist; keep these valid paths. This is NOT another baseline audit.

- [P1] Native root identity versus unimplemented wire alias
  - Evidence: installed SDK node_modules/@earendil-works/pi-durable/dist/types.js:2 exports ROOT_CONVERSATION_ID = 1. Current plan E2E asserts receipt.conversationId = "root", while adapter returns native receipt.conversationId (String(native.id)).
  - Impact: the first walking-skeleton oracle contradicts the proposed real execution path.
  - Rule: AP-026, AP-075, AP-076.
  - Fix decision: fix-now. Use canonical wire string "1" consistently (or explicitly design the mapping everywhere, but no need to add it).

- [P1] Persisted entry cannot supply an undeclared native submission ID
  - Evidence: installed dist/types.d.ts:411 EntryRecord has id: EntryId, conversationId, kind, model, data?, head?, edits?, byTaskId?; it does NOT have a native SubmissionId field. dist/types.d.ts:450+ SubmissionRecord separately has id: SubmissionId and entry: EntryId once placed/done. Current getState plan computes lastTurn from context.entries but promises lastTurn.requestId equal to the admission SubmissionId, with no source-backed correlation path. ContextView entries are active context, not full retained history after a head/compaction.
  - Impact: persistence E2E cannot derive its claimed value; implementation is pushed toward fabricated IDs or a hidden correlation store.
  - Rule: AP-026, AP-028, AP-075, AP-076.
  - Fix decision: fix-now. Simplest source-backed design: expose transcript readback with native entry IDs + user/assistant text; query paged conversation.entries for retained transcript, not context() for all historical turns. In E2E compare exact persisted user AND assistant text and stable entry IDs before/after restart. Admission/terminal correlation stays on the native Submission.id during the live turn. Remove unsupported lastTurn.requestId derivation rather than adding a second persistence scheme. If selecting a native Submission.status-based readback instead, explicitly supply/request the known SubmissionId and define that public API path; do not guess a reverse lookup.

- [P1] Production runner must not import a test fixture to make its provider exist
  - Evidence: WIP creates runner/test/fixtures/scripted-model-provider.ts but production composition root branches on --provider mock and calls createScriptedProvider(). Current runtime-loader.ts:75-95 already builds CLI extension paths and consumes resourceLoader.getExtensions(); runtime-loader.ts:54-61 registers pendingNativeProviderRegistrations via modelRuntime.registerNativeProvider(provider).
  - Impact: the compiled production entrypoint depends on test support or contains a test-only magic provider branch; a constructor-injection test alone does not prove the real child process receives the fixture.
  - Rule: AP-020, AP-026, AP-028, AP-075.
  - Fix decision: fix-now. Prefer loading the test-only scripted provider through the EXISTING public --extension path and native pending provider registration, alongside --provider scripted-e2e --model <declared fixture model>. Production composition does not import test fixtures or branch on mock. Define the exact fixture entry export, registration and CLI launch args. Preserve optional nativeProviders/ModelRuntime injection for normal embedded composition if useful, but routine black-box CLI E2E uses the real extension route. This is a seam correction, not an invitation to another provider/SDK sweep.

One remaining buildability question in the FOUR-contract scope: ISandboxExtension is named but not defined, while the proposed CodemodeExtension receives concrete BuiltinExtensionContext from adapter-pi-durable. Specify its actual pure signature and the composition-root projection/wrapper, OR retain adapter-owned native extension types with a concrete acyclic import direction. No undocumented adapter cycle and no imaginary class constructor: existing codemode exports createCodemodeBuiltinExtension().

Please finish the bounded patch/report, not another broad audit. No runtime or skills edits; no PASS claim from author.
