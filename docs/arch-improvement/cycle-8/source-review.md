# Independent source-review summary

Verdict: **PASS for the scoped source review**.

Reviewer: `zero-terminal-review`. Final report: `subagent-send:cycle8-model-queue-final-review`, locator `durable:1347:4130`.

Reviewed candidate: `/tmp/pi-zero-ui-candidate-20261105T2146`.

The reviewer identified no remaining material source finding within scope. The reviewer did not execute tests, edit files, or start services.

## Closed findings

- Explicit root submit and abort now resolve root inside the existing native command queue. Hooks, receipts, and cascade abort use that target.
- Model selection carries an expected conversation ID through client, runtime RPC, and native controller. The queue rejects stale targets before mutation.
- Native summary rows without live evidence show unavailable activity. Selected native live documents enrich presentation without changing native values.
- The probe attaches its iterator before history loading. It reads complete native history and appends only missing final text.
- Native RPC replies and causal notifications share one FIFO. Output limits cover regular pending bytes and a count-bounded oversized reserve.

The reviewer inspected the retained model-target red result and the final focused log. The focused log records 47 passing tests. The build log identifies the candidate and records the 49-record UI provenance check.

## Output policy and correction

Regular pending frames have an 8 MiB budget. Four additional oversized frames may remain pending. A fifth disconnects that reader.

Snapshot and oversized-frame limits bound counts, not absolute bytes. Socket-buffered data is additional. Tests cover ordering, overflow, close cleanup, and the supported terminal-frame sequence beside a reply.

The reviewer withdrew an earlier claim about the default producer emitting repeated full-message terminal frames. Adapter branches alone did not prove that active path. The compatibility watcher emits `message_end` without the proposed `turn_end` and `run_end` sequence.

## Evidence boundary

This verdict covers source review. It does not independently establish native execution, pressure behavior, installed-artifact behavior, or human acceptance.

Separate evidence appears in [terminal-runtime.md](terminal-runtime.md) and [installed-qa.md](installed-qa.md).
