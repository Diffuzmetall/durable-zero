---
type: analysis
title: "Durable Zero — аудит плана Cycle 7 после host-bridge редакции"
date: 2026-11-04
status: audit-complete-plan-not-ready
tags: [durable-zero, planning, retrospective, architecture, superpowers]
related:
  - architecture/durable-zero-dip-and-improvement-roadmap
---

# Аудит плана Cycle 7: цель сохранена, исполнимость пока не доказана

## State

**S7 / VERDICT: FAIL — текущий implementation plan не готов к запуску.** Это оценка плана, не продуктовая приёмка ещё не написанной реализации. Рассмотрена новая редакция `ab637a6f06ee13d39eef153fcf9da5dda1fab0c3`, а не только устаревшая `43136ae`. План и скиллы в этом аудите не менялись. [Source: git status/log и snapshot `audit-snapshot.json`, thread `thr_9yjb93iwmn`, 2026-11-04]

Новая редакция **закрыла пробел scope host-обвязки**: теперь прямо названы вынос `host-rpc.ts`, `stdout-guard.ts`, `shared/extension-ui-context.ts`, removal globals, `host/toolCall` и `host/interaction`. Повторять старое замечание «это вообще забыли» неправильно. Но задачи ещё не замыкают оставшиеся runtime-зависимости и не определяют весь путь исполнения. [Source: plan@ab637a6:5–23,251–296]

**Исходная цель не заменяется ретро:** сохранить зрелый рабочий runtime, вынести Pi/host/IO детали из абстрактного core в соответствующие адаптеры, подключить через явные порты и DI, заменить существующий транспорт на один полный JSON-RPC 2.0, а BB provider переработать отдельно позже. «Без совместимого транспорта» не означает «без функционального паритета». [Source: `thr_rfpka9ntjx` human seq9331,9448,10081,10233; master plan Goal/Architecture; current plan Goal]

### Snapshot / границы

- Repo: `/Users/vanya/Projects/durable-zero`; branch `cycle-7-runtime-adapter-ioc-migration`.
- Audited plan: `docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md`.
- Plan SHA-256: `6104b17cce0620e094ef3206768c415306be750b8f9f921597ec5fdffe9bf8c5`.
- В core найдено **87 TS source files**, из них **48 файлов** содержат ссылки на Pi SDK или adapter packages. Это результат инвентаризации строк, **не утверждение, что все 48 надо перенести**: pure business policies следует сохранить, очистив vendor-типы. Фраза «remaining 45 runtime files» не годится вместо карты миграции. [Source: `audit-snapshot.json`, `core-vendor-imports.json`]
- У source repo нет собственного `AGENTS.md` в просмотренном project-level scope; применены workspace instructions. Другие worktrees/WIP не менялись.
- Build и полная suite не запускались; acceptance production runtime не выполнялась. Выполнены только три read-only in-process protocol probes, все выявили нарушение ожидаемого контракта. Не открывались исходные пользовательские session DB. [Source: tool receipts, `protocol-probes.json`]

## Sources и метод

Изучены оба исходных BB-треда, текстовые human/assistant части указанной Pi-сессии с привязкой к исходным line/id, первоначальный Cycle 7 plan@42882bb, revisions@43136ae/ab637a6, master plan, актуальный код и реальные package/build contracts. Сторонний аудит `thr_vtwpv4zibg` проверен отдельно по каждому тезису. Ретро использовано как источник гипотез, а не доказательство того, что текущая версия кода всё ещё имеет каждый старый дефект. [Source: сохранённые thread event snapshots и dialogue extracts]

Нормативные первоисточники:
- `arch-rules/arch-rules.md` @9ab4772: весь baseline AP-010…AP-076; stack-specific правила оценены на применимость.
- `arch-improvement-skills` @facc860: loop, memory, orientation, review, fix, product-review; `arch-rules-skills` @fafc208: context, slice-planning, implementation-review.
- Актуально установленные Superpowers: brainstorming, writing-plans, executing-plans, SDD и fix-loop reference, TDD и writing-good-tests, verification-before-completion. Рабочий snapshot обновлён commit@1ff0f0f; upstream writing-plans@v7.0.2 дополнительно прочитан непосредственно.
- https://raw.githubusercontent.com/obra/superpowers/v7.0.2/skills/writing-plans/SKILL.md
- https://www.jsonrpc.org/specification — transport-agnostic protocol, notifications, responses, errors.
- Pi source: `pi/packages/durable/src/harness/harness.ts:129–133,378,551–564`, `harness/types.ts:820–831,929`: реальные submit/watchTaskGraph contracts. Это не разрешение заменить существующий Harness новым самописным agent loop.

**Достоверность ретро.** Утверждения старой Pi-сессии про «80% слепоту», «70% контекста», рост «41→89%», мотивы агента и ряд исследований не имеют проверенных первичных ссылок в рассмотренной переписке. Здесь они не используются как доказательство и не приписываются пользователю. Подтверждаемая инженерная цепочка проще: недоказанные контракты → layer-local tests → преждевременный PASS → отсутствующий сквозной outcome. [Source: Pi JSONL lines70,85,110,220 vs actual source and historical review messages]

## Findings

### F01 — [P1] Вынос runtime по-прежнему неполный: мигрируется не замыкание зависимостей
- Evidence: Task 4 перечисляет runtime.ts/runtime-controller.ts/runtime-graph-source.ts, subagent-*, bridge/*, shared/*. Но runtime.ts:4,12–15 импортирует harness-setup, runtime-bindings, runtime-cleanup, runtime-loader, runtime-hydration; runtime-types.ts также остаётся. core/src/index.ts:1–31 экспортирует engine/session-daemon/tool-adapter/extension-mount/prompt/policy-related runtime. Запланирован перенос session-storage/session-fork/session-lock-eviction из core, хотя эти файлы уже находятся в adapter-pi-durable/src. Инвентаризация обнаружила 87 TS-файлов в core, 48 файлов со ссылками на Pi или adapter-пакеты; это не число обязательных переносов.
- Plan location: `durable-zero/docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md:204`.
- Impact: После буквального исполнения Task 4 core останется связанным с инфраструктурой либо импорты сломаются. Массовый перенос shared/* не решает, где живут чистые политики, Pi ACL, resource loading, model setup и sandbox.
- Rule: AP-010, AP-011, AP-020, AP-025; writing-plans / File Structure
- Fix decision: fix-now
- Required change: До нарезки задач построить фактическую карту file → responsibility → target package → consumers/tests. Мигрировать полные исполняемые замыкания по поведению; чистые политики оставить, очистив vendor-типы, Pi-механизмы вынести. Указать судьбу каждого entrypoint/export/build target. Не переносить несуществующие файлы.

### F02 — [P1] План вызывает методы, которых нет у openDurable
- Evidence: Task 2 требует handle.submitPrompt(), handle.abort(), handle.onEvent(). Реальный OpenDurableResult (core/src/runtime-types.ts:111–119) предоставляет controller, view, harness, close; controller.submit/abort описаны в :73–82. runtime.ts:20 требует executionEnvFactory. У текущего координатора метод events(), а Task 1/3 используют onEvent(). IAgentEngine.getState объявлен, но его реализация в Task 2 не описана.
- Plan location: `durable-zero/docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md:132`.
- Impact: Это не готовый интерфейсный handoff: исполнитель вынужден заново проектировать контракты или писать заглушки. Одной подписки на view недостаточно считать доказанным поток текстовых/tool-дельт.
- Rule: AP-026, AP-029, AP-074, AP-076; writing-plans / Type consistency
- Fix decision: fix-now
- Required change: Зафиксировать реальные подписи и маппинг: submit → controller.submit(content, deliverAs), abort → controller.abort(), state → явный доменный DTO из snapshot, события → существующий watch/projector тракт. Передать executionEnvFactory из root. Выбрать одно имя events/onEvent и согласовать receipt.id с native requestId/conversationId. Добавить typecheck и consumer-visible contract tests.

### F03 — [P1] Смена import в CLI не запускает новый runner
- Evidence: Task 3 предлагает заменить import runner-server.ts на import runner/dist/main.js. runner/src/main.ts:35–43 вызывает main() только если import.meta.url.endsWith(process.argv[1]); при запуске cli/bin/durable-zero.js argv[1] указывает на CLI, не на runner main.js. У core/CLI также остаются публичные импорты старого DurableEngine.
- Plan location: `durable-zero/docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md:187`.
- Impact: Новый production entrypoint может завершиться без запуска RPC-сервера. Это повторяет старый провал «композиция есть, но не исполняется».
- Rule: AP-020, AP-021, AP-075
- Fix decision: fix-now
- Required change: Объявить экспортируемый main(argv, io/config) с точной подписью и явно вызвать его из CLI либо запускать реальный executable. Проверять именно пользовательскую команду после сборки. Удалять legacy build/export только после переключения всех внутренних клиентов.

### F04 — [P1] Не определён единственный владелец session, lock и lifecycle
- Evidence: План одновременно передаёт coordinator store и engine, запускает coordinator.start() и engine.start(sessionDir). Текущий coordinator.start() (:45–48) вызывает store.acquireLock(); PiDurableSessionStore.acquireLock() (:50–54) берёт acquireSessionLock. openDurable() (:23) вызывает selectSession(), который также берёт acquireSessionLock (adapter session-storage.ts:73–74). store может отдельно открыть session.sqlite (:40–47).
- Plan location: `durable-zero/docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md:183`.
- Impact: Если сохранить обе ветки, получится повторный lock и/или два владельца одного persistence runtime. Это статически обнаруженный конфликт плана, не воспроизведённый в пользовательской сессии. Не решены cleanup частичного старта, повторный close и возможность нового prompt после abort.
- Rule: AP-013, AP-023, AP-034, AP-074
- Fix decision: fix-now
- Required change: В утверждённом design выбрать одного владельца session/lock/harness. Store — фасад того же открытого runtime либо отделённый административный порт, но не второе независимое открытие БД. Описать start order, subscription-before-resume, readiness, abort/reuse, teardown and rollback-on-start-failure; проверить на временных сессиях.

### F05 — [P1] Полный переход транспорта не сохраняет весь существующий функционал
- Evidence: Новый plan не имеет old-command → new-method → owner → test матрицы. core/session-commands.ts содержит prompt с images/conversationId, steer, abort_task, compact, set_subagent_policy через policy holder, get_available_models, set_model, set_thinking_level, session_fork. session-state-commands.ts добавляет get_state/get_session_stats, binding-commands — другие команды. RuntimeGraphSource упомянут в findings, но отдельного behavioral task для его доставки нет. Review Focus обещает session/cancel, composition.ts:85 знает session/abort.
- Plan location: `durable-zero/docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md:251`.
- Impact: Текстовый happy path может пройти при потере рабочих возможностей. Отказ от совместимости с BB не означает разрешения выбросить runtime-функции.
- Rule: AP-013, AP-026, AP-038, AP-046, AP-048, AP-050, AP-076
- Fix decision: fix-now
- Required change: Зафиксировать реестр всех существующих команд, событий, ошибок, CLI options и persistent behaviors; каждому дать новый контракт и regression test либо явно согласованное исключение. Сохранить images, root/child targeting, steer/followUp, abort/reuse, compaction, model/reasoning, policy CAS/ack, graph/tool streaming, fork/resume и codemode state по фактическому baseline. Не возвращать legacy transport.

### F06 — [P1] HostBridge теперь в scope, но ещё не определён как исполнимый DI-контракт
- Evidence: Новая версия действительно добавила host-rpc extraction, host/interaction, stdout guard и singleton removal. Но IHostBridge нигде не объявляется; нет файла порта, полных signatures, schema export/validation steps и обновления consumers. shared/extension-ui-context.ts:2,6 импортирует requestHostInteraction как default. Task 5 перечисляет test-файлы и затем запускает их, но не содержит шага их создания/RED; при этом удаляет старый stdio-host-tool-call.test.ts.
- Plan location: `durable-zero/docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md:255`.
- Impact: Получится класс, умеющий server.request(), но без доказательства, что модель видит tools, вызывает их, получает ответ и завершает ход. Удаление старого теста раньше characterization replacement уменьшает защиту.
- Rule: AP-012, AP-022, AP-026, AP-074, AP-076; TDD; writing-plans / Interfaces
- Fix decision: fix-now
- Required change: Объявить transport-agnostic host/tool/interaction ports в согласованном внутреннем слое, их DTO и ошибки. JSON-RPC оставить в runner/protocol. Инжектировать requester в extension UI и tool registration без defaults/globals. RED→GREEN: actual model/tool path → reverse request → client result → continued turn; отдельно error/timeout/disconnect/cancel и cross-session isolation. Старые проверки перенести/заменить до удаления.

### F07 — [P1] Срез 0 пока разделён на горизонтальные задачи, а oracle слишком слабый
- Evidence: Task 1 — core port, Task 2 — adapter facade, Task 3 — wiring/E2E. По SDD каждый получит собственный reviewer gate, хотя до Task 3 сквозного результата нет. E2E в Task 3:171 требует accepted и хотя бы одну text delta «before process exit or abort», но не completed turn, соответствующий prompt/request или persistence. Task 7 имеет более сильный happy path, однако только в конце.
- Plan location: `durable-zero/docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md:22`.
- Impact: Зелёные промежуточные отчёты опять могут означать готовность слоя, а не системы. Один токен не исключает дальнейший hang/failure и не доказывает сохранность сессии.
- Rule: AP-075, AP-076; writing-plans / Task Right-Sizing; product-review / Functional Outcome
- Fix decision: fix-now
- Required change: Объединить Task 1–3 в один reviewable Task «Slice 0»: подпункты внутри допустимы, завершение только после compiled CLI → real harness/model → correlated stream → terminal result, с cleanup. Для durability — restart/readback проверка. Зависимость от сети сделать явным opt-in live smoke; детерминированные тесты подменяют только внешнюю модель, не harness/persistence/transport.

### F08 — [P1] «Strict JSON-RPC 2.0» не подкреплён conformance задачей
- Evidence: Read-only in-process probes подтвердили: входящая notification получает -32600 вместо отсутствия ответа; неизвестный метод маппится в -32603 вместо -32601; response schema принимает одновременно result и error. Источники: protocol/request-dispatcher.ts:28–85, jsonrpc/schema.ts:10–21; protocol-probes.json. План проверяет только invalid request -32600 в финале.
- Plan location: `durable-zero/docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md:20`.
- Impact: Замена оболочки не даёт корректный full-duplex protocol; ошибки/notifications клиента ломаются. JSON-RPC не определяет session/* методы или framing — их должен фиксировать project design.
- Rule: AP-012, AP-022, AP-026; JSON-RPC 2.0 §§4.1,5,5.1
- Fix decision: fix-now
- Required change: Добавить явный supported profile и method/params/error schemas, framing UTF-8/chunks/EOF/limits, notification silence, result XOR error, -32700/-32600/-32601/-32602/-32603, correlation, outbound timeout/disconnect and concurrent reverse calls. Reuse existing protocol implementation, не создавать второй tracker. Решить batch/positional params явно относительно заявленной совместимости.

### F09 — [P2] Проверки core и сборки не обеспечивают заявленных gates
- Evidence: Boundary check — grep с || true и проверка adapter-* лишь в package.json; Task 6 не удаляет protocol и extension-pi-resource dependencies. scripts/build.mjs:82–97 всё ещё собирает удаляемый core/src/runner-server.ts. План не содержит build/typecheck task; product command dist/bin/durable-zero.js не создаётся текущим build. Почти все targeted node --test команды не имеют объявленного --test-timeout, а total timeout нигде не указан.
- Plan location: `durable-zero/docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md:332`.
- Impact: Проверка способна завершиться exit 0 при нарушении; удаление runner-server ломает существующий build. Старая dist может скрыть проблему. Команды не воспроизводимы из чистого checkout.
- Rule: AP-025, AP-028, AP-029, AP-045, AP-057; verification-before-completion
- Fix decision: fix-now
- Required change: Указать настоящие scripts/build.mjs, exports/bin, package.json и lockfile changes. Автоматизировать failing boundary/dependency-graph/typecheck gates, включая type-only, relative и dynamic imports, Node I/O и транзитивные утечки. Проверять packed/clean compiled artifact по реальному bin. В команды вписать per-test 30s и total 60s либо обоснованные live E2E limits.

### F10 — [P2] Review Focus и test steps не превращены в проверяемые assertions
- Evidence: Review Focus содержит SessionError, empty/unstarted/closed и session/cancel, но задачи не дают соответствующих literal assertions/test bodies и error codes. Task 2 тест «implements interface, accepts submit, forwards events» оставляет executor выбирать значения и источник событий. В Task 5 отсутствует test-first step. Требование <120 LOC к PiDurableEngine сохраняет прежнюю прокси-метрику.
- Plan location: `durable-zero/docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md:28`.
- Impact: Формат стал lean, но часть решений просто исчезла; исполнитель снова сам придумывает acceptance и может закрыть тестом своего double. Формальные line caps снова конкурируют с функциональностью.
- Rule: AP-019, AP-028, AP-076; writing-plans / What a Step Contains, Review Focus; writing-good-tests
- Fix decision: fix-now
- Required change: На каждый пункт Review Focus — owning task, test name и точные independent assertions; для ключевого теста назвать production mutation, которую он ловит. Ошибки и noSession capabilities определить типами. Тестировать результат настоящего consumer, spies оставить для контракта побочного вызова, а не самоценной проверки mock. Убрать произвольный 120 LOC gate, применить AP-019 без урезания логики.

### F11 — [P1] Spec ссылается на старый implementation plan с конфликтующими решениями
- Evidence: Вместо самостоятельного approved design указан мастер-план 2026-11-03, audit thread и Pi session. Старый мастер-план требует backward-compatible re-exports, сохранение forkSessionDatabase в core, setter-based host bridge и удаления ряда «obsolete» runtime files; новые user instructions в thread seq9448 исключают compatibility transport/работу над BB. Нынешний план утверждает «all 5 ... 100%», включая crash --no-session, хотя runner/main.ts:6–12 просто не передаёт noSession и не вызывает coordinator.start(). Точный crash не был воспроизведён.
- Plan location: `durable-zero/docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md:11`.
- Impact: Executor получает несколько конфликтующих источников истины и обязан сам выбрать архитектуру. Claim из старого отчёта превращается в якобы проверенный факт.
- Rule: AP-012, AP-020, AP-026; brainstorming / approved design; writing-plans / Spec coverage
- Fix decision: fix-now
- Required change: Короткий canonical design amendment: intent/non-goals, approved breaking change, one runtime owner, dependency map, protocol contract, preservation criteria и superseded clauses. Historical findings пометить claimed/static/reproduced, без «100%». Отделить ретро-уроки от неподтверждённых психологических объяснений и процентов из старой Pi-сессии.

### F12 — [P2] Оркестрация, re-review и Learn Gate остаются незафиксированными
- Evidence: Task 7 перечисляет A/B/C только в самом конце, хотя arch loop требует S9 по meaningful slice. Свежий Superpowers SDD использует fresh agent per task, resume implementer в fix rounds 1–3, bounded 5-round loop; executing-plans допускает один final fix pass без re-review. Arch loop требует обоих S9 PASS и блокирует P0/P1/P2 — эти режимы не эквивалентны. Plan заканчивается ledger, но не содержит S11 lesson/no durable lesson.
- Plan location: `durable-zero/docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md:354`.
- Impact: При очередном FAIL исполнитель выберет удобный режим, либо спор начнёт раздувать scope. Можно повторить acceptance автором собственного исправления или забыть незакрытый P2 после breaker.
- Rule: arch-improvement-loop S7/S9/S11; arch-improvement-fix; workspace orchestration contract; Superpowers SDD
- Fix decision: fix-now
- Required change: Сохранить ранее выбранное пользователем исполнение через оркестратора. Один owner на slice; brief/spec/global constraints/interfaces, BASE..HEAD и evidence paths. Resume автора в рамках фикса, не reviewer self-acceptance; при смене роли fixer — новый независимый acceptor. Два независимых S9 verdicts на одном SHA + orchestrator diff inspection. При cap реальные P0–P2 остаются blocked, а не становятся PASS. Добавить Learn Gate и владельца committed ledger.


### F13 — [P1] Фасад над openDurable не устраняет вторую сборку зависимостей
- Evidence: Task 2 только оборачивает openDurable; Task 3 добавляет engine к прежнему composition. Но core/runtime-loader.ts:74–90 самостоятельно создаёт ModelRuntime, SettingsManager, DefaultResourceLoader; :117–125 собирает registry; :168–173 открывает Harness/SQLite. runner/composition.ts:53–68 параллельно создаёт executionEnv, store, resourceExt, codemodeExt, modelProvider. OpenDurableOptions не принимает эти уже собранные экземпляры (кроме executionEnvFactory и частичных extension options). Task 4 переносит лишь часть файлов, не меняя этот контракт.
- Plan location: `durable-zero/docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md:132`.
- Impact: Можно получить работающий текстовый ответ, но сохранить декоративный DI и два независимых набора model/settings/resources/sandbox. Это не просто вопрос папок: подмена адаптера из root не будет гарантированно менять исполняемый путь.
- Rule: AP-020, AP-073, AP-074, AP-076
- Fix decision: fix-now
- Required change: Явно разделить инфраструктурное создание Pi objects и use/runtime orchestration. В design выбрать typed engine factory/dependencies, передаваемые от root; resource/model/codemode/execution implementations живут в своих предусмотренных пакетах и реально используются. Удалить декоративные coordinator ports, если их единственный честный consumer — engine, либо определить фактическое делегирование. Подтвердить injected implementation → observed behavior; не писать второй LLM loop.

### F14 — [P2] Два RPC hop ошибочно объявлены дублирующим tracker
- Evidence: Новый Global Constraint запрещает duplicate pending trackers across host/runner; финальный thread report seq10455 называет две Map одинаковым split-brain. Но core/host-rpc.ts:27–38 ждёт результат runner → host ('host_tool_call'), а plugin/src/host/tool-call-tracker.ts:30–67 отправляет отдельный JSON-RPC 2.0 item/tool/call в BB и имеет thread/turn/scope. Это разные hops/ID spaces, не одна и та же очередь.
- Plan location: `durable-zero/docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md:20`.
- Impact: Механическое объединение может стереть необходимую корреляцию и cancellation scopes. Кроме того, исполнение задачи начинает требовать изменений BB plugin, которые пользователь явно вынес за scope.
- Rule: AP-011, AP-020, AP-026, AP-038, AP-048; JSON-RPC 2.0 roles
- Fix decision: fix-now
- Required change: Заменить blanket-правило на один authority для pending outbound requests каждого endpoint/канала; убрать только повторную реализацию одного и того же механизма внутри endpoint. Runner↔host и host↔BB могут иметь отдельные IDs/trackers с явным mapping. Для Cycle 7 приёмка — generic test client over JSON-RPC, не переделка BB. Записать будущий BB mapping как handoff, а не скрытую задачу.

## Сторонний аудит: критическая сверка, не голосование

### A1. Task 1–3 — отдельные горизонтальные gates вместо одного Slice 0
- Verdict: **Подтверждено**.
- Evidence / reasoning: В ab637a6 задачи всё ещё разделены по core/adapter/runner. Сам порядок подшагов не дефект; опасны самостоятельные DONE/PASS до общего E2E outcome.
- Решение для текущего плана: Один reviewable deliverable для сквозной вертикали; unit tests внутри допустимы.

### A2. Host-обвязка забыта в core
- Verdict: **Устарело частично**.
- Evidence / reasoning: ab637a6 явно добавил host-rpc extraction, stdout guard, host/interaction и removal globals. Но порт, consumers и RED→GREEN не определены.
- Решение для текущего плана: Не повторять старое замечание; закрыть конкретные пробелы F06.

### A3. Host/probe нужно проверить до массовой миграции
- Verdict: **Подтверждено с оговоркой**.
- Evidence / reasoning: В новой версии Task 5 всё ещё идёт после переноса Task 4. Это разумное снижение интеграционного риска, но AP-075 не требует вместить все features в Slice 0.
- Решение для текущего плана: Ранний отдельный обратный tool round-trip; probe — отдельная read-only проверка.

### A4. Probe Mode решит конфликт блокировок
- Verdict: **Отклонено**.
- Evidence / reasoning: Отсутствие session в discovery не решает двойное владение store/openDurable в persistent mode.
- Решение для текущего плана: Отдельно решить F04; no-session не использовать как обход lifecycle ошибки.

### A5. unknown в events автоматически нарушает AP-011/076; core должен знать JsonRpcNotification
- Verdict: **Отклонено в такой формулировке**.
- Evidence / reasoning: AP-011 — когезия/связность, strictness — AP-029. unknown допустим на непроверенной границе; JsonRpcNotification в core сам создаст transport leak.
- Решение для текущего плана: Типизированный доменный event union + проверенный mapper в protocol/runner. Конкретный host RPC method не обязан входить в IAgentEngine.

### A6. start(sessionDir) неизбежно теряет cwd/model/thinking
- Verdict: **Частично**.
- Evidence / reasoning: Эти параметры могут быть constructor-injected. В плане точной constructor signature/config mapping нет — вот доказуемый дефект.
- Решение для текущего плана: Зафиксировать engine factory/config contract; не раздувать start по догадке.

### A7. Переносить по три файла или слоями events → runtime → SQLite
- Verdict: **Отклонено как готовое решение**.
- Evidence / reasoning: Число файлов не задаёт безопасную границу. Storage уже перемещён. Слои повторяют запрещённую горизонтальную нарезку и могут разрывать import closure.
- Решение для текущего плана: Нарезать по исполняемому поведению и замыканию зависимостей с green E2E.

### A8. Task 5 очистки core хорошо описан; достаточно pnpm --filter core build
- Verdict: **Не подтверждено**.
- Evidence / reasoning: В ab637a6 это Task 6; остаются F01/F09. В core/package.json нет script build, только build:runner.
- Решение для текущего плана: Использовать реальные команды и добавить failing graph/packaging gates, не выдумывать отсутствующий script.

### A9. Review Focus не привязан к тестам
- Verdict: **Подтверждено**.
- Evidence / reasoning: Новая редакция не добавила точные cases/assertions для empty/closed/cancel и test-first host/probe.
- Решение для текущего плана: Owner task + literal assertions + mutation caught для каждого пункта.

### A10. В финальном gate вообще не указан compiled binary
- Verdict: **Отклонено**.
- Evidence / reasoning: Task 7 явно требует compiled binary; ошибка другая: dist/bin/durable-zero.js не создаётся нынешней сборкой, а до E2E нет свежего build.
- Решение для текущего плана: Исправить путь/packaged entrypoint и проверять compiled artifact без TS source fallback.

### A11. Всегда возвращать фиксы прежнему автору, никогда fresh
- Verdict: **Уточнить**.
- Evidence / reasoning: Superpowers fix-loop сохраняет автора в rounds 1–3, дальше fresh context/escalation; runtime может не поддерживать resume. Арх-гейт строже generic parking после cap.
- Решение для текущего плана: Resume в рамках slice, fresh при подтверждённом stuck, structural block не превращать в PASS.


[Source: `thr_vtwpv4zibg` assistant seq384; current plan@ab637a6; package.json/build source; AP rules и SDD references, перечисленные выше]

## Как применить ретро, не потеряв исходный замысел

Это предложения к следующей редакции, **не новый утверждённый implementation plan**. До S8 остаются решения из F04/F11. Нельзя ни сносить рабочие runtime-файлы по слову «legacy», ни прятать весь монолит в adapter, считая задачу завершённой.

### Предусловие: design amendment и две карты покрытия

Короткий design документ должен зафиксировать исходную цель, non-goals (без BB migration и без skill updates), владельца session/lock/harness, точную роль coordinator/engine/model/resource/sandbox ports и существующих dedicated adapter packages, wire contracts и явно отменённые пункты прежнего плана. Подтвердить протокол терминологически: в одном user message написано «gRPC 2.0», тогда как исходные планы/код говорят JSON-RPC 2.0. Не смешивать их молча. [Source: human seq9448; plan@ab637a6; JSON-RPC primary spec]

Две карты — разные и обе нужны:
- **Поведение:** old command/event/persistent behavior → новый public contract → owner → test → допустимое исключение.
- **Код:** существующий файл/export/build target → ответственность → целевой package → consumers → regression evidence.

Для каждого delete сначала предъявить replacement path и покрытие. Реальные пользовательские сессии не использовать как тестовые фикстуры; проверять сохранение/reopen/fork на отдельно созданных временных данных.

### Следующая нарезка: по наблюдаемым исходам

**Task 1 — единый Walking Skeleton.** Одно reviewable deliverable: packaged CLI принимает prompt, новый composition root исполняет настоящий существующий runtime через согласованный engine port, выдаёт correlated stream и terminal result, корректно закрывается. Начать с failing E2E; unit tests портов — подпункты этой же задачи, а не отдельные «архитектура готова». Не вводить adapter → concrete core runtime → adapter цикл: relocation или временную injection boundary надо решить до dispatch.

**Task 2 — обратный host вызов целиком.** Tool definitions приходят через согласованный клиентский контракт, попадают в runtime registration, модель вызывает инструмент, runner делает reverse RPC, получает client result/error и runtime продолжает ход. Сюда же явный interaction requester, error/timeout/cancel/disconnect и изоляция двух экземпляров; не просто unit test метода server.request.

**Task 3 — probe как отдельный read-only путь.** Параметр `--no-session` проходит через реальный CLI/root, позволяет согласованный diagnostics/model catalog, не создаёт persistent session/lock и явно отвергает unsupported state-changing commands. Это **не** способ обходить lock defect в persistent mode.

**Дальше — vertical migration tasks по карте поведения.** Порядок выбирается по фактическому import graph, а не «по три файла» или по слоям. Каждый task имеет замкнутый изменяемый capability, перенесённые tests и сохранённый сквозной smoke. Конкретные file lists должны быть получены из инвентаря до переписывания задач.

**Последний функциональный task — удаление заменённых путей и упаковка.** Убрать старые runner build/export/import paths, исправить source/public exports/lockfile, доказать изолируемость core и возможность запуска упакованного runner из чистого временного consumer без stale dist. Прежний runtime исчезает из core только после того, как его возможности наблюдаемы через новый путь.

**Gate каждого meaningful slice и всего branch.** Task-scoped review по Superpowers; S9 architecture и product reviews — независимые роли на одном candidate SHA, плюс собственный diff gate оркестратора. Финальный whole-branch проход проверяет всю preservation matrix, не только последний diff. Learn Gate фиксирует, какой конкретный проверяемый механизм теперь ловит каждый прежний провал.

Это не требует добавлять десяток ревьюеров. Требует правильных входов и условий выхода.

### Что меняется относительно прежних ошибок

- «Пакеты созданы» заменяется на доказанный working public path.
- «Tests pass» заменяется на конкретный сохранённый capability и тест, который ловит его удаление.
- «DI имеется» заменяется на единственного владельца ресурса и фактические вызовы портов.
- «HostBridge написан» заменяется на tool request/result/continued turn.
- «Перенесли файлы» заменяется на closed dependency graph + consumer migration.
- «Ревьюер сказал PASS» заменяется на независимые verdicts, test artifacts, actual diff и проверенный executable.
- «Меньше контекста терять» означает resume автора в пределах fix task + структурированный handoff; не самоприёмку reviewer-fixer.
- «Ретро применено» означает regression oracle на прошлый сбой, а не новые лозунги в шапке.

[Source: AP-075/AP-076; writing-plans Task Right-Sizing/Interfaces/Review Focus; SDD fix-loop; historical thread evidence and F01–F14]

## Architecture verification

- **Passed: none claimed for implementation acceptance.** Предмет — S7 readiness, не S9 выполненного кода.
- **Checked applicable:** AP-010/011/012/013/019/020/021/022/023/025/026/027/028/029/032/034/038/043/045/046/048/050/056/057/059/074/075/076 по описанным рискам. AP-046 разрешает явно согласованный breaking change; здесь не навязывается возврат legacy transport.
- **Not applicable to this work:** React/shadcn/Next.js/motion rules AP-051…055/063…065/068…070; Postgres-specific AP-062 (runtime использует Pi SQLite). AP-067 не повод переписывать Pi persistence на Drizzle: исходный spec требует нативный Pi SDK, выбор должен быть явно отражён в context map.
- **Semantic probes:** dependency traceability — gap F02/F06; runtime completeness — gap F01/F05/F09; entrypoint wiring — gap F03; anti-hollow acceptance — gap F07/F10.
- **Residual risk:** без полного сохранённого behavioral baseline нельзя обещать нулевые регрессии; lifecycle conflict статически выявлен, не проигран в live session; live model turn, packaged deployment и полноценные architecture/product circuits не исполнялись. Нет утверждения о нынешнем общем числе green tests.
- **VERDICT: FAIL — S7, return to S6 after design/contract reconciliation.**
- **S9: NOT RUN.**

## Handoff / artifacts

Все evidence artifacts этой проверки — `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/`:
- `audited-plan-ab637a6.md`, `initial-cycle7-plan.md`, `latest-plan-change.patch`, `audit-snapshot.json`.
- `plan-findings.json`, `core-vendor-imports.json`, `protocol-probes.json`.
- `third-party-adjudication.json`, исходные thread event snapshots и human/assistant extracts.
Это артефакты конкретного аудита, не альтернативные нормативные AGENTS/skill files.

## Timeline

- 2026-11-04: прочитаны initial threads/Pi retro и актуальные canonical skills.
- Во время проверки пользователь сообщил о новой редакции плана: база аудита обновлена на ab637a6; закрытый host-scope пункт снят.
- Добавлен сторонний audit thread; каждый тезис adjudicated против новой редакции и кода.
- Результат: замечания и предложения к плану; никаких изменений runtime/plan/skills в рамках этого аудита.

## See also

[Существующая дорожная карта и исходный замысел](../../architecture/durable-zero-dip-and-improvement-roadmap.md).
Исторические заявления этой страницы о «полностью чистом core» не считаются текущей верификацией; актуальная проверка приведена выше.
