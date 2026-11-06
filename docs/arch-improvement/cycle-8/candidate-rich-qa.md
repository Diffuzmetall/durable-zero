# Rich terminal milestone verification

Verdict: PASS for the requested rich TTY flow and final-message comparison.

Candidate: `/tmp/pi-zero-ui-candidate-20261105T2140`.
Evidence directory: `/tmp/zero-rich.rQdBvo`, mode `0700`.

## Commands

Executed `python3 /tmp/zero-rich.rQdBvo/rich_check.py`.
Executed `python3 /tmp/zero-rich.rQdBvo/differential.py`.

The scripts record the complete process commands and tmux operations:
- `commands-rich.txt`
- `commands-differential.txt`

The runtime command uses `packages/local-runtime/bin/runtime.mjs`.
The rich terminal command uses `packages/local-terminal/bin/terminal.mjs`, without `--probe`.
The direct runner command uses `packages/runner/dist/main.js`, with `--no-global-extensions`.

All runtime commands specify an isolated session directory and workspace.
They select `--provider local-test --model scripted`.
They load `packages/local-runtime/test/fixtures/provider.ts` from the candidate.
Each process receives a clean environment with isolated HOME, configuration, agent directory, and temporary directory.

## Rich TTY results

- PASS: normal rich UI starts. Both stdin and stdout use `/dev/pts/24`.
- PASS: ANSI rendering, editor borders, model footer, agent section, and task section appear.
- PASS: no readline banner appears in either raw PTY recording.
- PASS: the first short answer displays `started:plain: rich-short-unique`.
- PASS: the slow answer displays `started:` while the model task remains active.
- PASS: Escape aborts the slow turn in 31.4 ms. The UI displays `Operation aborted`.
- PASS: the native Bash card displays the command, running state, response, and exit code 0.
- PASS: completed tool output displays `native-work-continued`.
- PASS: SIGHUP disconnects the rich terminal without stopping the runtime.
- PASS: native Bash writes the marker 920.5 ms after terminal exit.
- PASS: no terminal or observer remains connected during that marker check.
- PASS: reopening restores completed Bash cards and assistant output.
- PASS: reopening does not repeat prompts. User entry IDs remain `8`, `13`, `18`, and `26`.
- PASS: `/detach` exits the reopened rich UI without stopping the runtime.
- PASS: `session/getView` and `session/view` use the `{revision,view}` envelope.
- PASS: the owned runtime exits gracefully with code 0.

## Reopening assertion correction

The initial harness required equality of every transcript entry ID before and after reopening.
That assertion failed because assistant entry `33` completed during reopening.
It contains the legitimate final response for the detached tool turn.

Both transcripts contain exactly the same four user entries, with identical IDs and text.
No existing entry disappeared, and no new user entry appeared.
The raw failed assertion remains in `rich-results.json` for transparency.
This is a harness assertion error, not evidence of prompt replay.

## Direct Zero versus socket notifications

Both transports use separate fresh sessions for their first plain and slow turns.

Plain notification types match exactly:
`message_end`, `turn_complete`, `runtime_graph_snapshot`.

Slow notification types match exactly:
`message_update`, `runtime_graph_snapshot`, `message_end`, `turn_complete`, `runtime_graph_snapshot`, `runtime_graph_snapshot`.

Each plain turn emits one complete `message_end` with text `started:plain: final-message-differential`.
Each slow turn emits an early `started:` delta and one complete final `message_end`.
The slow final text is `started:slow: final-message-differential`.

Final message arrival times after prompt submission:
- Direct plain: 147.6 ms.
- Socket plain: 151.3 ms.
- Direct slow: 5053.7 ms.
- Socket slow: 5047.3 ms.

All four comparisons pass. Each final message has `stopReason: stop`.
All four owned runner processes exit with code 0.

## Evidence index

- `01-startup.screen.txt`: rich layout and editor.
- `02-short-final.screen.txt`: short final answer.
- `03-live-before-abort.screen.txt`: partial answer and active model task.
- `04-aborted.screen.txt`: aborted operation.
- `05-native-bash-card.screen.txt`: native running Bash card.
- `06-native-bash-completed.screen.txt`: completed tool output.
- `07-reopened.screen.txt`: restored cards, output, and idle state.
- Corresponding `.screen.ansi` files preserve colors.
- `rich-first.pty.raw` and `rich-reopened.pty.raw` preserve raw PTY output.
- `rich-notifications.jsonl` and `reopened-notifications.jsonl` preserve transport messages.
- `initial-view.json` preserves the getView envelope.
- `before-reopen-transcript.json` and `after-reopen-transcript.json` establish prompt identity.
- `differential-results.json` summarizes the four final-message comparisons.
- `diff-{direct,socket}-{plain,slow}/wire.jsonl` preserves each complete wire capture.
- Each differential directory also contains `events.json`, `transcript.json`, and `stderr.log`.

## Boundaries and cleanup

No source, installation, or user session changed.
The checks used no paid model, credential, existing service, or other agent.
The parent-owned native integration test was not repeated.

All owned Node processes stopped. The isolated tmux server stopped.
A final process scan found no owned Node or tmux processes.
Artifacts remain in the private evidence directory as requested.
This test does not cover joint testing in Rex or a global installation switch.
