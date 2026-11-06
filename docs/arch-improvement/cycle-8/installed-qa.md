# Installed artifact acceptance

Verdict: PASS. All 22 recorded checks pass.

Installed prefix: `/home/ubuntu/.local/share/pi-durable-zero/candidates/20261105T2146-standalone`.
Private evidence directory: `/tmp/zero-installed.xV2OKa`, mode `0700`.

## Command and identity

Executed `python3 /tmp/zero-installed.xV2OKa/check_installed.py`.
The complete process commands and tmux operations are in `commands.txt`.
Resolved paths and SHA-256 hashes are in `installed-identity.json`.

Every UI process uses `PREFIX/bin/terminal.mjs`, without `--probe`.
Every runtime process uses `PREFIX/node_modules/@local-durable/runtime/bin/runtime.mjs`.
Every provider loads `PREFIX/node_modules/@durable-zero/adapter-pi-durable/test-fixtures/provider.ts`.
All three entries resolve within the installed prefix.

Runtime arguments select `--provider local-test --model scripted`.
Each runtime receives the same owned test session and workspace.
The environment isolates HOME, configuration, agent files, and temporary files.
No runtime or UI entry comes from the workspace or a temporary candidate.

## Rich PTY acceptance

- PASS: stdin and stdout both use `/dev/pts/24`.
- PASS: the installed rich editor and layout appear, not the readline probe.
- PASS: the first short response displays `started:plain: installed-short-unique`.
- PASS: live text appears before the slow turn completes.
- PASS: Escape aborts the active slow turn in 47.8 ms.
- PASS: native Bash cards display the command, running state, response, and exit code 0.
- PASS: SIGHUP exits the terminal without stopping the runtime.
- PASS: no observer or terminal remains connected during the detached native execution check.
- PASS: native Bash writes its marker 1005.5 ms after terminal exit.
- PASS: the detached tool turn completes and persists its final assistant response.
- PASS: reopening restores tool cards and assistant output without duplicate user entries.
- PASS: user entry IDs remain `8`, `13`, `18`, and `26` after reopening.
- PASS: `/detach` exits only the rich terminal.

## Restart and recovery

The first runtime stops gracefully with exit code 0.
A new installed runtime opens the same owned session.
Its session ID, entry IDs, and user entries match the saved baseline.
The installed rich UI reopens and displays the previous tool output.

I submit a new slow turn through the rich PTY.
After its live delta appears, I send SIGKILL to that owned runtime.
Its exit status is `-9`. The rich UI detects the lost runtime and exits.

A third installed runtime opens the same session without manual socket or lock removal.
It preserves the session ID and all five user entries, including interrupted entry `34`.
Native recovery finishes the interrupted response and emits its final `message_end`.

The recovered rich UI accepts one new plain prompt and displays its complete answer.
The final transcript contains exactly six user entries, with the earlier five unchanged.
The new prompt receives a completed `turn_complete` event.
The final `/detach` leaves the runtime alive.
The runtime then stops gracefully with exit code 0.
SQLite `PRAGMA integrity_check` returns `ok`.

## Evidence index

- `results.json`: all 22 check results.
- `01-startup.screen.txt` through `15-final-detach.screen.txt`: milestone screens.
- Corresponding `.screen.ansi` files preserve colors.
- `installed-*.pty.raw`: raw PTY output for each rich terminal.
- `phase-1-wire.jsonl` through `phase-4-wire.jsonl`: transport messages and requests.
- `before-reopen-transcript.json` and `after-reopen-transcript.json`: duplicate-prompt check.
- `before-graceful-restart.json` and `after-graceful-restart.json`: restart identity check.
- `before-sigkill-transcript.json` and `after-sigkill-transcript.json`: crash recovery check.
- `final-transcript.json`: final six user entries and assistant output.
- `runtime-1.log` through `runtime-3.log`: installed runtime logs.

## Cleanup and boundaries

All owned Node processes and the private tmux server stopped.
A final process scan found no owned Node, tmux, or tee processes.
Evidence occupies approximately 0.76 MB before this report.
Artifacts remain in the private directory as requested.

No production source, primary installation, existing service, user session, or Rex tab changed.
The checks used only the offline provider and real native runtime, SQLite, and Bash.
No paid model, credential, or other agent participated.
