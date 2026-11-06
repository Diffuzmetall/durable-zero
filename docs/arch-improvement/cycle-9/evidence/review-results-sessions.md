# Frozen sessions source review — complete report

Candidate: `/tmp/pi-zero-session-commands-20261106-c`. Packet: [review-packet-sessions.md](review-packet-sessions.md).
Reviewer: `frozen-sessions-review`, request `subagent:1304`, result `durable:1305:1385`.
Recovered from this parent conversation entry `1402`. The report below is verbatim, excluding its transport header.
This is source review, not independently executed QA. Later dispositions are in [review-dispositions.md](review-dispositions.md).

---

Reviewed the frozen packet only. No files changed. No product commands or tests executed.

### Findings

**P2 — Reopening a catalog discards saved extensions**

- **Source:** `packages/local-runtime/src/sessions.ts:25,46–52,86`.
- **Failure condition:** A saved descriptor contains extensions, but the next caller supplies no extensions.
- The default argument is `[]`. Line 50 replaces the saved extension list, and line 52 persists that replacement. Subsequent session creation inherits the empty list at line 86.
- **Effect:** Restarting without repeating extension options removes the recorded configuration used to create later sessions.
- **Correction:** Distinguish omitted extensions from an explicitly empty list. Preserve saved extensions when options are omitted.

**P2 — Interrupted creation prevents retries from recovering**

- **Source:** `packages/local-runtime/src/sessions.ts:79–88`.
- **Failure condition:** Directory creation succeeds, but saving the descriptor fails or the runtime stops before the descriptor rename.
- A retry finds no descriptor at line 84. It then fails with `EEXIST` at line 87 because the directory already exists.
- **Effect:** The stable request identifier cannot recover the partially created session. Every retry encounters the same failure.
- **Correction:** Recover a directory belonging to the same creation request before retrying descriptor creation.

### Evidence limits

- The packet omits transport implementation, runtime assembly, complete reload logic, and most terminal lifecycle code.
- It cannot establish native persistence, exact model restoration, signal behavior, or integrated terminal reconnection.
- The supplied test checks sequential retries after successful creation. It does not check interruption between directory creation and descriptor saving.
- The **74 scoped cases** and **48 installed checks** are parent-reported results, not independently verified tests.

Read `asd-ste100/SKILL.md` and its required `references/writing-rules.md`. The language linter reported **0 violations** for the report draft.
