# Terminal foundation on Zero

Status: source review, native integration, pressure checks, and installed rich-terminal acceptance pass. An isolated Rex tab passed a real-model/native-tool smoke test. Human joint acceptance and the global switch remain pending.

## Product boundary

The assembly preserves the installed Pi Durable editor, layout, themes, and tool cards. Readline remains a transport probe only.

```text
Installed Pi presentation, with notices and declared boundary changes
    @local-durable/terminal-ui
                 │ native view / presentation controller
    @local-durable/terminal
                 │ private Unix socket, JSON-RPC
    @local-durable/runtime — independent process
                 │ assembleDurableZero()
    Zero composition → coordinator + PiDurableEngine
                                  │
                          one native Harness
                          SQLite / native tools
```

The terminal owns no Harness, model loop, or session database. Disconnecting it does not close Zero. Reconnection reads authoritative state without replaying prompts.

The endpoint uses mode `0600` inside a private directory. Zero's public owner lease protects that directory. Recovery removes a socket only after `ECONNREFUSED` under the lease. It preserves live endpoints and ordinary files.

## Focused Zero changes

### Authoritative final messages

Fresh direct Zero and socket runs both lost short answers and final text deltas. Their SQLite transcripts contained complete assistant messages.

The compatibility watcher previously derived text only from transient `pi.live.generation` snapshots. Persisted assistant entries emitted `entry_appended`, but the output adapter required `message_end`.

New assistant entries now emit authoritative `message_end` events. Existing `entry_appended` events remain. Initial history and repeated snapshots do not replay completed messages. The regression cases failed before the fix.

The independent comparison used separate fresh direct and socket sessions. Both transports now emit exactly one complete final message for plain and slow turns. See [candidate-rich-qa.md](candidate-rich-qa.md) and [the differential summary](evidence/candidate-differential.json).

### Native presentation and control ports

`PiDurableEngine` exposes its existing `DurableViewSource` and `DurableController`. The composition result exposes these optional capabilities for the native assembly. Injected generic engines do not claim them.

Core gains no native UI dependency. The local host uses composition-owned ports rather than private imports or bundled-class identity checks.

Initial views and notifications use `{revision, view}`. The client retains the highest nonnegative revision. Older buffered snapshots cannot replace newer initial state.

### Explicit root targeting

Selecting a child exposed a controller defect: explicit root submission and abort could target the selected child. Root receipts still reported root.

The controller now resolves optional submission and abort targets inside its existing queue. Root engine calls pass the actual root ID. Hooks, tools, receipts, abort, and child-cascade lookup use that target.

Tests cover explicit root hooks and submission, root cascade abort, omitted-target compatibility, and missing-target rejection. They reproduced incorrect child routing before the fix.

### Model-picker target guard

A local picker guard alone cannot detect a concurrent switch before the updated view arrives. Model requests now carry the client's expected conversation ID.

The runtime forwards this ID to the native controller. Its existing queue checks the ID before model lookup or mutation. Stale requests reject without changing configuration or the active model. Omitted IDs preserve native behavior.

The queue regression failed before the fix. See [the retained red result](evidence/model-target-red.log). The native integration test also checks rejection through the runtime RPC boundary.

## Transport pressure policy

The first pressure experiment disconnected a healthy reader and truncated JSON during large snapshot bursts. A fixed `socket.writableLength` threshold caused that failure.

The replacement output boundary serves native RPC replies and causal notifications through one FIFO. It respects socket backpressure without awaiting the terminal from Harness execution.

- Regular pending frames have an 8 MiB budget.
- Four additional oversized frames may remain pending. A fifth disconnects that reader.
- Pending native views and graph snapshots each retain only the latest value.
- Snapshot and oversized-frame bounds limit their count, not their absolute size. Socket-buffered data is additional.
- Closing a client removes its drain listener and retained packets.

Causal frames and replies preserve FIFO order. Replaceable snapshots deliberately follow pending causal frames. Graph snapshots precede views. Revision checks handle older view notifications.

A source-review claim about repeated default terminal frames was withdrawn. The active compatibility watcher does not emit that proposed sequence. Regression coverage still exercises the full supported contract sequence and a large reply.

The real pressure test submitted a 600,000-character prompt while one observer stopped reading. Native Bash completed. The healthy reader remained connected. The stalled reader resumed with two views across seven revisions.

A separate stopped reader submitted 30 full-view requests. The output bound disconnected it after 219,264 wire bytes. The healthy client and Harness remained usable. See [pressure evidence](evidence/final-pressure.log) and [the harness](evidence/pressure.py).

## Presentation preservation

The UI source is the installed `delivery-recovery-terminal-20261101` artifact, not an assumed-equal checkout. The package retains notices, licenses, and 49 provenance records.

Declared changes replace the old Host connection, reject stale picker selection, and avoid fabricated activity. Native summary rows without live evidence show activity unavailable. Selected native live and inbox documents enrich presentation without mutating native values.

The Photon loader uses native Node loading. The assembly does not copy the installed filesystem monkey-patch. Original and replacement hashes remain recorded.

The probe attaches its input iterator before history loading. It reads complete native view history and prints only missing authoritative final text. Unsupported controls report errors instead of successful placeholders.

## Candidate and installation

Final source candidate:

```text
/tmp/pi-zero-ui-candidate-20261105T2146
```

Standalone installed prefix:

```text
/home/ubuntu/.local/share/pi-durable-zero/candidates/20261105T2146-standalone
```

The build candidate links dependencies to the workspace. The installed prefix does not. Verification checked 458 symlinks and found none escaping that prefix. Five entry hashes match the source candidate. Installed UI hashes match all 49 provenance records and declared replacements.

Installation command:

```sh
cd /tmp/pi-zero-ui-candidate-20261105T2146
node /home/ubuntu/.cache/node/corepack/pnpm/11.25.0/bin/pnpm.cjs \
  --store-dir /home/ubuntu/.local/share/pnpm/store \
  --filter @local-durable/terminal deploy --legacy --prod --offline \
  /home/ubuntu/.local/share/pi-durable-zero/candidates/20261105T2146-standalone
```

Two earlier attempts did not complete. The first selected an empty temporary package store. The second reached installation but rejected unspecified dependency-script decisions.

For the final deployment, the candidate-only workspace configuration explicitly denies `@google/genai` and `protobufjs` scripts. It retains the existing esbuild allowance. The repository's workspace configuration remains unchanged. No additional dependency scripts received approval.

Legacy deployment left one self-link pointing to the source candidate. Installation fixed that link to the installed root before closure verification. The correction affects packaging only, not runtime module resolution rules.

`LICENSE.Zero` preserves Zero's root license. `INSTALLATION.json` records installed hashes, dependency-script decisions, the self-link correction, and provenance checks. See [the archived manifest](evidence/installation.json).

The offline provider fixture resides inside the installed native adapter's dependency context for acceptance testing. It replaces only model responses. Harness ownership, SQLite, native Bash, cancellation, and recovery remain real.

## Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Final build and production typecheck | PASS | [Build log](evidence/final-build.log) |
| Focused source and presentation tests | 47 passed | [Focused log](evidence/final-focused.log) |
| Native detach, tool completion, reopen, abort, restart, SIGKILL recovery | PASS | [Native log](evidence/final-native.log) |
| Healthy and stalled readers, view coalescing, response flood | PASS | [Pressure log](evidence/final-pressure.log) |
| Independent scoped source review | PASS | [Source-review report](source-review.md) |
| Standalone production deployment | PASS | [Install log](evidence/isolated-install.log) |
| Installed imports, dependency closure, entry hashes, UI provenance | PASS | [Manifest](evidence/installation.json), [closure check](evidence/verify-install.py), [UI check](evidence/check-installed-ui.py) |
| Rich PTY and direct/socket finals on the first candidate | PASS | [Independent report](candidate-rich-qa.md) |
| Installed rich PTY, restart, and crash recovery | 22 checks passed | [Independent installed QA](installed-qa.md), [results](evidence/installed-qa/results.json) |
| Existing Rex app, real model, native Bash, visible final answer | PASS | [Rex handoff](rex-handoff.md), [screen](evidence/rex-real.screen.txt), [smoke result](evidence/rex-real-smoke.json) |
| Human joint acceptance | Pending | Operator checks the open Rex tab |

The first native test invocation exceeded its 20-second command timeout. It did not establish a failure of the runtime. A bounded background invocation completed the same test in 21.1 seconds, including crash recovery.

## Rex preparation and preservation

An installed native runtime uses a new isolated session:

```text
/home/ubuntu/.local/share/pi-durable-zero/test-sessions/rex-20261105T2146
```

Its separate workspace is `test-workspaces/rex-20261105T2146` under the same base. It selects `openai-codex/gpt-6.1-sol`. The real model executed native Bash and returned `ZERO_REX_READY`. Rex capture shows the completed Bash card, `ZERO_NATIVE_TOOL_READY` output, exit code 0, final answer, and idle state.

The existing Rex server and connected MacBook app remain in place. The system `/usr/bin/rex` path now names an unrelated executable. Operations use the existing server's `/proc/2123/exe` with autostart disabled.

The new Rex window is `window:01a1adbc-3b4b-7697-a29b-f06911383a14`. Its terminal block is `block:01a1adbc-3b49-7a0f-a50c-a3ae6fd00eb3`. All four pre-existing windows remain. See [the joint-test handoff](rex-handoff.md).

This work replaced no primary launcher, service, credential, or existing user session. No session migration, extension collection migration, BB/iii adapter work, commit, push, publication, or global switch occurred.

Rollback requires no primary-installation change. Stop only the new runtime after checking its recorded PID and command identity. Preserve the isolated session unless its removal receives authorization.
