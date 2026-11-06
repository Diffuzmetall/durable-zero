# Frozen MCP/runtime source review — complete report

Candidate: `/tmp/pi-zero-session-commands-20261106-c`. Packet: [review-packet-mcp.md](review-packet-mcp.md).
Reviewer: `frozen-mcp-review`, request `subagent:1328`, result `durable:1329:1382`.
Recovered from this parent conversation entry `1391`. The report below is verbatim, excluding its transport header.
This is source review, not independently executed QA. Later dispositions are in [review-dispositions.md](review-dispositions.md).

---

Review scope: supplied frozen packet only. I read the English language skill and its required reference. I ran no commands or tests.

### Findings

**P2 — Tool refresh retains obsolete active tools**  
`packages/adapter-pi-durable/src/engine/shared/extension-runner.ts:102–116`

Failure conditions:
- An active tool changes exposure from `direct` to a discovery-only exposure.
- A registered active tool disappears.

`refreshTools()` starts with the previous active names. It removes only tools whose current exposure equals `hidden`. It does not remove absent tools or tools that change to another non-active exposure.

The active list therefore retains names that no longer qualify for direct activation. Consumers receive stale tool activation state.

**P3 — Removed subagent records retain old summary metadata**  
`packages/adapter-pi-durable/src/engine/runtime-hydration.ts:70–80`

Failure condition: a parent registry removes an agent entry while its conversation summary remains.

`applySubagentSummaries()` returns the previous summary unchanged when no matching agent exists. That summary can retain its old `parentId`, role, task, delivery status, and hold reason.

The publication handler applies this function to existing summaries. It therefore cannot clear obsolete registry-derived metadata. A previously pending delivery can remain displayed as pending.

### Evidence limits

The packet does not establish whether tool removal, exposure changes, or agent-record removal occur in supported native workflows. The findings identify incorrect reconciliation under those conditions.

The supplied source cannot establish:
- Native MCP cancellation behavior after disconnect.
- Readiness-hook ordering relative to registry synchronization and task snapshots.
- JSON-RPC pending-request settlement during transport shutdown.
- Integrated terminal behavior, installed-artifact behavior, or regression coverage.

The packet reports 74 scoped cases and 48 installed checks. Those are parent-reported results, not independently verified tests.
