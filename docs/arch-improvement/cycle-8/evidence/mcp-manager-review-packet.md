# PR 3: independent correctness review

## Assignment

Review the assigned slice once. Do not change files or external state. Do not run tests or models. Do not delegate work.

Read `/home/ubuntu/.agents/skills/review/Workflows/review-correctness-doctrine.md` before the review. Apply that doctrine. Read `/home/ubuntu/.agents/skills/asd-ste100/SKILL.md` and its writing rules before the response. Use plain English for the response.

Report concrete regressions caused or activated by this change. Give each finding a severity, exact file location, causal explanation, and proof reference. Classify the evidence as deterministic, inferential, or insufficient. Do not promote a test gap into a severe defect. State material limitations even if no finding remains.

Return the report through the native parent channel. Do not write the report to a file. The parent saves the report. Stop after the report.

## Immutable source

- Base commit: `85afe89869e60b887703d215005d4c37bac3c177`.
- Source candidate: `/tmp/pi-zero-pr3-review-20261106-h`.
- Installed candidate: `/home/ubuntu/.local/share/pi-durable-zero/candidates/20261106T1307-mcp-manager`.
- Manifest: `docs/arch-improvement/cycle-8/evidence/mcp-manager-review-scope.json`.
- Patch: `docs/arch-improvement/cycle-8/evidence/mcp-manager-review-scope.patch`.
- Patch SHA256: `a37f702a28131033d86a4c7f9890b0bda3f7c138613df153d5edd76f5cbaa16f`.

The manifest covers 24 changed or added source files. Their bytes match the source candidate. Read candidate source, not mutable production source. Use the patch to identify changed behavior. The parent can update documentation during the review. The source scope stays fixed until both reports arrive.

## Contracts

Zero remains the foundation. One native Harness owns each open session. The terminal does not own execution or storage. A terminal disconnect must not stop native work. Keep Core independent of terminal implementations. Do not copy SDK internals or use private product imports. Preserve UI licenses and provenance.

Original Pi MCP owns the Zero assembly. Nico owns the current parent conversation. Do not read private configuration, credentials, unrelated sessions, or another checkout. Do not contact live MCP servers. Do not start processes or change the primary installation.

## Review findings to close

P1: The old adapter awaited the MCP status command during assembly. An HTTP peer could accept `initialize` and never acknowledge `notifications/initialized`. That peer blocked readiness despite its configured timeout. The candidate removes this global barrier. Its public `GenerationTask.afterResponse` hook waits for original MCP discovery before native tool snapshots. Permission decisions stay at the native tool boundary. Native abort cancels the wait. Native shutdown owns connection cancellation.

P2: The launcher fixture hashed a noncanonical temporary path. An alias could produce a different session expectation. The candidate hashes the real workspace path. It reconnects through an alias and tracks every test runtime. Cleanup checks the runtime PID and canonical executable path before a signal.

## Evidence

- Build and production typecheck: `/tmp/zero-pr3-h-build.log`, exit 0.
- Scoped suite: `/tmp/zero-pr3-h-suite.log`, 69 passed, no failures or skips.
- Installed startup and alias regressions: `/tmp/pr3-review-installed-h.log`, 2 passed.
- Installed rich manager acceptance: `/tmp/zero-mcp-manager-h-rich.log`, 24 passed.
- Installed baseline: `/tmp/zero-mcp-manager-h-baseline.log`, 13 passed.
- Installed package proof: `/tmp/zero-mcp-manager-h-package.log`.
- Original P1 reproducer, before fix: `/tmp/pr3-startup-red.log`.
- Original P1 reproducer, after fix: `/tmp/pr3-original-repro-green.log`.
- UI repaint regression, before fix: `/tmp/mcp-editor-restore-red-3.log`.
- UI repaint regression, after fix: `/tmp/mcp-editor-restore-green.log`.

The offline provider replaces model responses only. MCP protocol, Harness, SQLite, Bash, and the rich PTY are real. These checks exclude live providers and macOS. The alias case ran on Linux. The operator already checked child clicks. Do not repeat that live test.

## Slice A: runtime and MCP

Review the adapter, extension bridge, local runtime, and related tests. Check startup, registry snapshots, permissions, exposure changes, ownership, cancellation, shutdown, and reload. Pay special attention to the early original-MCP handlers and the later general permission hooks. Check the command-owned remote UI and its disconnect cleanup. Trace relevant public SDK contracts from installed source when needed.

## Slice B: terminal and projection

Review terminal transport, the vendored UI adaptation, activity projection, launcher tests, and installed acceptance. Check modal input, resize, resume, alias identity, cleanup, truthful child status, and package provenance. A runtime notification during UI suspension caused a blank editor after resume. The candidate requests a forced repaint through the public TUI API. Check whether the regression and installed evidence support that fix.
