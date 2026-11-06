# Review dispositions — final candidate d

## Scope and ownership

The complete independent packet reports are [sessions](review-results-sessions.md) and [MCP/runtime](review-results-mcp.md). They reviewed candidate c source, not candidate d or independently executed tests. The earlier [incomplete attempt](review-attempt-incomplete.md) remains incomplete. No additional reviewers were started.

SnowyCave delivered Cycle 8 as `2147e8d7b7109a7debe663c4b27900bed94bbcda` and transferred Cycle 9 ownership in Agent Mail messages 531/533. GrayMountain owns the dispositions below. The final candidate is `/tmp/pi-zero-session-commands-20261106-d`, installed at `/home/ubuntu/.local/share/pi-durable-zero/candidates/20261106-session-commands-d`. Its [33-file manifest](source-manifest.json) and [package proof](package.json) identify the tested bytes.

## 1. Saved extension configuration — confirmed and fixed

The catalog test reproduced an empty extension list after reopening without options. [Red evidence](zero-catalog-review-red.txt) records actual `[]` instead of the saved provider path.

`openSessionCatalog()` now distinguishes omitted extensions from explicit `[]`. The runtime reads this configuration before assembling its one native Harness, so preserving metadata also preserves actual extension loading. The native session test restarts without any extension argument or environment fixture and checks subsequent session creation.

Focused checks passed [3/3](zero-catalog-review-green.txt). The final [79/79 suite](regressions-serial.txt) includes the native restart regression. Explicit empty configuration still clears the saved list.

## 2. Interrupted session creation — confirmed and fixed at publication

The catalog test recreated the empty directory left between `mkdir` and descriptor saving. The old implementation failed with `EEXIST` for every retry. The same [red evidence](zero-catalog-review-red.txt) preserves this failure.

Creation now prepares the complete descriptor in a unique directory inside the originating catalog's `.terminal` metadata. A directory rename publishes the complete session atomically. The stable target never represents a partially saved new session. A process interruption before publication can leave an internal staging directory, but does not block retry or appear in the sibling session list.

An empty interrupted target can be completed. A nonempty unregistered target is not overwritten. Concurrent completed publication returns the existing descriptor. Normal failures remove only the unique staging directory created by that operation. Existing native databases and sessions are not migrated or deleted.

The focused tests cover retry, empty interrupted target, occupied-target preservation, and staging cleanup. They passed [3/3](zero-catalog-review-green.txt), and passed again within the final suite. This is process-interruption safety, not a claim of power-loss durability or migration of incomplete older candidate directories containing arbitrary metadata.

## 3. Tool activation — supported transition fixed, unsupported removal bounded

Two focused tests reproduced stale activation for `direct → codemode` and `direct → deferred`. [Red evidence](zero-active-tools-red.txt) records both failures. The tests observe the same callback that `extension-mount.ts` forwards to native `root.configure({ modelTools })`.

The focused adapter fix removes previous direct activation when a registered tool changes to a discovery-only exposure. It preserves core tool names, explicit deselection, direct/model-only defaults, and explicit `tool_search` activation when deferred exposure stays unchanged. These tests passed in the final 79/79 suite. The installed native MCP manager/exposure suite passed [24/24](mcp-installed/results.json).

This changes an existing Zero adapter because a supported Pi registration update did not reconcile activation. Core, native Harness, execution, scheduler, and SDK implementations are unchanged. The regression at the owning action boundary is deterministic, so transport instrumentation and broad speculative hypotheses were unnecessary.

Installed SDK `1.5.0`, `dist/extensions/mcp/index.js:339–344`, explicitly states that tools cannot be unregistered. It re-registers removed server tools as `hidden`; that path already deactivates them. The native manager's `setExposure()` also explicitly filters indirect tools. Therefore this is not presented as a newly reproduced failure of the original MCP manager. The new regression covers the adapter's general supported registration-update path. Arbitrary disappearance from `getRegisteredTools()` remains an unsupported conditional, not a proven native defect. No speculative removal mechanism was added.

## 4. Removed child records — unresolved conditional, no speculative change

The source observation is accurate if an agent registry entry disappears while its conversation summary remains. However, bounded inspection of `subagent*.ts`, the `SubagentsDoc` schema, and `applySubagentSummaries()` did not establish a supported operation that removes that registry entry. SnowyCave independently reported the same limitation in message 533.

`runtime-hydration.ts` was not changed for this hypothetical condition. The existing native activity tests do not prove deletion reconciliation. This finding remains an explicit coverage limitation, not a fixed defect or unconditional runtime failure. Revisit it if a supported deletion workflow is introduced.

## Final evidence and limits

- Build, production typecheck, 49-record UI provenance: PASS.
- Serial scoped suite: **79/79 PASS**, zero skipped.
- Installed sessions: **11/11 PASS**.
- Installed MCP/reload: **24/24 PASS**.
- Installed baseline: **13/13 PASS**.
- Standalone closure: **460 symlinks**, zero external/broken links, **11 matching artifact hashes**.
- Original candidate c results are preserved in [candidate-c/](candidate-c/); the packet reviewers' line numbers refer to c.
- CodeGraph exploration was unavailable (`MCP_MAY_HAVE_RUN` timeout). Current source navigation supplied the relevant callers. No index was created or rebuilt.
- Raw review packets and terminal/test logs retain their original whitespace. A full Git whitespace check flags those snapshots. The source and authored documentation whitespace check passes with raw evidence excluded.
- The installed baseline command first used a nonexistent driver path and exited 2 before running tests. The corrected `cycle-8/evidence/capabilities-installed-check.py` command passed all 13 checks.
- No independent rerun of candidate d, full repository suite, live-provider/OAuth acceptance, macOS verification, global switch, or extension-collection migration is claimed.
