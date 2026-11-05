# Thinking effort: claim check, not an A/B benchmark

Date: 2026-11-04. The user forwarded third-party recommendations; these are not user-authored benchmark data or an explicit instruction to change running workers.

## Assessment

Lower effort is a plausible latency/cost optimization for bounded tasks, not a universal optimum or a guarantee of equal quality. OpenAI explicitly describes lower effort as favoring speed/token efficiency and higher effort as favoring more complete reasoning; supported values and defaults are model-dependent, and its guidance recommends evaluating medium and high for complex agentic work. [Source: https://platform.openai.com/docs/guides/reasoning, fetched this turn]

The quoted fixed budgets (4k–12k high vs 1k–2k medium), 3–4x TTFT improvement and 60–75% savings were not established by the primary documents read. This is not proof the figures are impossible; it means they are unsupported for these tasks, models and the Pi/Antigravity route. No local A/B measurements were run. [Source: same OpenAI guide; https://ai.google.dev/gemini-api/docs/thinking; no linked benchmark in forwarded excerpt]

The claim that four high-effort workers necessarily generate about 30k tokens per second and saturate the network is unsupported. Token totals per request are not generation rates, and internal reasoning tokens are not equivalent to bytes streamed over the network. Google describes internal reasoning plus optional thought summaries/signatures, not transmission of all raw thoughts. [Source: https://ai.google.dev/gemini-api/docs/thinking]

Google Developer API documents request/token/time-window quotas, per-model/tier variability and capacity variability; it does not say four concurrent high-effort workers necessarily throttle. Those public API limits also do not establish the exact limits of the Antigravity OAuth route used here. [Source: https://ai.google.dev/gemini-api/docs/rate-limits]

Our observed new-worker launch failure happened before model generation: global and workspace semantic-skill-loader installations could not resolve ./types.js. Both installation links were removed with user authorization; source code retained. This failure cannot be fixed by lowering model reasoning effort. An earlier unbounded diagnostic also retained an intentionally persistent serve process after setup resolved; changing effort does not close that process. [Source: pi-launch-blocker.json; shared ledger unbounded diagnostic incident]

## Decision

Treat medium-for-bounded-workers as a reasonable hypothesis, not verified optimal policy. No running workers' effort was changed on the basis of the forwarded text. Architecture/product acceptance, dependency traceability, bounded commands and process teardown remain separate obligations.
