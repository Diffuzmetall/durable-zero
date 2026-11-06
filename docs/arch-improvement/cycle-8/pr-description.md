# PR: независимый терминальный хост Durable на Zero

## Результат и текущая приёмка

Три workspace-пакета подключают сохранённый rich-терминал к штатной композиции Zero. Native Pi Durable Harness остаётся единственным владельцем исполнения, инструментов и SQLite. Runtime продолжает работу без терминала; reconnect не повторяет prompt.

Последний follow-up исправляет оба замечания review: **P1 — зависание startup из-за необязательного MCP**, **P2 — некорректное ожидание пути и cleanup launcher fixture**. Также реализован оригинальный `/mcp` manager, исправлена активация tools после изменения exposure и восстановлен редактор после закрытия manager. Native child names/activity теперь берутся из authoritative документов.

Финальный проверенный source candidate — `pi-zero-session-commands-20261106-d`, standalone prefix — `20261106-session-commands-d`. Build/typecheck прошли; полный scoped suite последовательно **79/79**, installed session commands **11/11**, rich manager **24/24**, baseline **13/13**. Дополнительно исправлены `/new`, `/name`, `/resume`, начальная готовность catalog, длина Unix-сокета, сохранение extensions при restart, атомарное создание сессии и activation при смене exposure. [Cycle 9](../cycle-9/session-commands-and-delivery.md) содержит финальный 33-file manifest и evidence; результаты candidate h ниже сохранены как предыдущий этап. Cycle 8 уже доставлен commit `2147e8d7b7109a7debe663c4b27900bed94bbcda`.

**Изменены не только наши пакеты:** десять существующих runtime/assembly-файлов Zero получили ограниченные изменения публичных границ. Native Harness/SDK, model loop, scheduler и формат SQLite не патчили. Core не получил terminal/BB/iii/storage implementation dependencies.

Актуальный отчёт: [session commands и финальная поставка](../cycle-9/session-commands-and-delivery.md). Предыдущий этап: [оригинальный MCP manager и устранение замечаний PR № 3](mcp-manager-and-pr3-review.md). [Матрица паритета](../cycle-9/terminal-parity.md) отделяет выполненные возможности от ещё не перенесённых.

## Зачем и что сохраняется

Цель — собрать Durable на общей основе Zero, а не переносить его внутренние фрагменты в старый Host. Сохранены редактор, layout, темы, model picker и tool cards установленного rich UI. Readline-клиент остаётся только диагностическим probe.

Терминал не открывает native session store и не запускает второй model/task loop. Runtime запускает `assembleDurableZero()` и отдаёт публичные view/controller через приватный Unix-сокет. История берётся из native state, а не собирается из предположений UI.

Основной `pi-durable`, сервисы прежнего Host, существующие сессии и старая вкладка Rex не переключены. `pi-durable-zero` — отдельная opt-in команда. Старый executable или session не заменяется автоматически при подключении.

## Замечания review и их устранение

Исходное review: [P1/P2 в комментарии](https://github.com/VanDalkvist/durable-zero/pull/3#issuecomment-6684195890).

### P1: необязательный MCP мог навсегда задержать ready

**Причина.** Предыдущее решение гонки discovery ожидало read-only MCP status при assembly. HTTP peer мог ответить на `initialize`, но не завершить POST `notifications/initialized`. Timeout запроса не ограничивал такую notification. В результате весь runtime не доходил до ready.

**Исправление.** В `extension-mount.ts` удалён startup status-await. Штатное Pi MCP extension подключается в фоне и владеет connection lifecycle. Для настоящих model-issued `codemode`/`tool_search` публичный `GenerationTask.afterResponse` ожидает MCP discovery **до native tool snapshot**, передавая native `abortSignal`.

На ранней стадии вызываются только handlers штатного `<inline:mcp>`, не произвольных extensions. Общие permission hooks сохраняются на `ToolTask.beforeTool`. Таким образом, readiness не даёт разрешение на выполнение. Фиксированный sleep, timeout-race вокруг незавершённой операции и патчи SDK не добавлены.

Простое удаление await было проверено и отвергнуто: первый Codemode task снова получал snapshot без MCP tool. Итоговый вариант сохраняет и неблокирующий startup, и корректное discovery.

**Проверка.** Исходный reviewer repro: [red](evidence/mcp-manager-startup-red.txt) → [green](evidence/mcp-manager-startup-green.txt). Новый [native startup regression](../../../packages/local-runtime/test/mcp-startup-native.test.ts) на установленном candidate проверяет ready, обычный offline turn, abortable discovery до tool task, reload с тем же PID, cancellation старого HTTP-запроса, graceful close без MCP handles и повторное открытие сессии. [Installed log](evidence/mcp-manager-installed-regressions.txt).

### P2: launcher fixture ошибалась на symlink path

**Причина.** Fixture строила ожидаемый session hash по неканоническому временному пути, а launcher использовал канонический cwd. Дополнительный runtime при неудачном assertion мог остаться вне первоначального cleanup.

**Исправление.** [Launcher regression](../../../packages/local-terminal/test/launch-native.test.ts) применяет `realpath(rawCwd)`, а reconnect намеренно выполняет через workspace alias. Fixture отслеживает все объявленные PID/session paths. Перед сигналом она сверяет RPC PID и canonical executable path, затем ожидает закрытия endpoint и собственных launcher children. Canonical comparison учитывает pnpm symlink в installed artifact.

**Проверка.** На Linux воспроизведён случай symlink в `TMPDIR`; исправленный source и standalone candidate проходят reconnect с тем же PID, без replay. [Installed 2/2](evidence/mcp-manager-installed-regressions.txt) включает P1 и P2. **macOS не запускалась**: это проверка эквивалентной причины на Linux, не заявление о macOS acceptance.

## Новые workspace-пакеты

### `@local-durable/runtime`: процесс-хост

- Запускает штатную композицию Zero с одним native Harness owner.
- Обслуживает JSON-RPC через приватный Unix-сокет `0600`, держит session lease и отклоняет второго владельца.
- Проверяет старый endpoint перед удалением. Не заменяет автоматически чужой или работающий runtime.
- Передаёт native view с монотонной revision и отдельные resource metadata.
- Ограничивает причинную выходную очередь; disconnect клиента не вызывает `Harness.close()`.
- Раскрывает явный `/skill:имя аргументы` до native admission, используя существующий каталог loader.
- Сериализует admission/reload, а при idle переоткрывает ту же сборку с прежним PID/session и соединением.
- Размещает command-owned native MCP UI adapter. Один клиент владеет вводом меню; остальные могут читать состояние и выполнять abort. Открытый manager запрещает reload до своего закрытия.

### `@local-durable/terminal`: клиент

- Подключается к runtime, не владея моделью, tools или SQLite.
- Проверяет envelope/revision и не заменяет свежий state устаревшим snapshot.
- Передаёт conversation target. После disconnect не делает автоматический retry/replay.
- Получает native историю при reconnect и выбирает rich UI для настоящего TTY.
- Opt-in launcher запускает detached runtime и переиспользует отдельную workspace session.
- Для `/mcp` временно передаёт terminal ownership оригинальному manager, пересылая клавиши, resize и terminal operations. После команды возвращает сохранённый UI.

### `@local-durable/terminal-ui`: сохранённое представление

- Сохраняет редактор, layout, темы, model picker и карточки tools. Photon загружается обычным Node import вместо filesystem monkey-patch исходного loader; замена отражена в provenance.
- Получает view/controller через публичный вход, не открывает native-сессию.
- Skill picker только вставляет команду. Enter отправляет её; Alt+Enter использует native `followUp`.
- Сохраняет черновик после ошибки admission. Скрывает только неподключённые дополнительные панели, не реальные notices.
- Маршрутизирует bare `/mcp` и его аргументы в native command, не в model prompt.
- Принудительно перерисовывает прежний редактор после возврата terminal ownership.

Presentation-код vendored и явно адаптирован. Это не копия Harness или replacement loop. Сохранены licenses, исходный notice, provenance 49 presentation records и adaptation hashes. Старые `src/ui/` пути в notice относятся к исходной поставке; актуальные лицензии — в `vendor/licenses/`.

Сохранённый UI использует `pi-tui@1.4.0`. Новый command-owned native MCP adapter напрямую зависит от `pi-tui@1.5.0`, как Pi SDK. Это два presentation-контекста, не downgrade или fork native Harness.

## Как работает оригинальный `/mcp`

Используется **оригинальный Pi MCP из SDK 1.5.0**, зарегистрированный в composition root. Nico не переносился, второго manager или transport owner нет.

`DurableController.executeMcpCommand()` вызывает зарегистрированную `<inline:mcp>` команду. `local-runtime/src/mcp-ui.ts` использует публичные `TuiMainScreen`, `Terminal`, SDK selectors/input/theme. Код самого manager не копируется и не импортируется по private path.

`session/mcpCommand`, `session/mcpInput`, `session/mcpResize` связывают original components с настоящим `ProcessTerminal` клиента. Цвета и resolved keybindings передаются из действующего UI. Только эта command UI получает `mode: tui` и `hasUI: true`; глобальный runner остаётся headless. Runtime host содержит native renderer adapter, но не зависит от нашего terminal client или preserved UI package.

Menu admission не удерживает очередь на всё время диалога. Ввод и resize принимает только owner; второй manager/reload отклоняются. Disconnect закрывает UI, а не Harness. Native меню самостоятельно снимает подписки и отменяет sign-in; altered cancel binding не мешает закрытию command-owned UI.

**Дополнительная реальная регрессия.** Installed PTY выявил пустой экран после Escape: runtime notification во время suspension оставляла pending render. Исправление использует публичный `requestRender(true)` на resume. [Source red](evidence/mcp-manager-editor-red.txt), [green](evidence/mcp-manager-editor-green.txt), [regression](../../../packages/terminal-ui/test/mcp-command.test.mjs) и следующий настоящий MCP call в installed driver подтверждают восстановление редактора.

**Динамическая активация.** После смены exposure/reload вновь зарегистрированный direct tool мог отсутствовать в active tools. `refreshTools()` теперь активирует новые direct/model-only переходы, исключает hidden, сохраняет `defaultActive: false` и явный opt-out при неизменённом refresh. [Регрессия](../../../packages/adapter-pi-durable/test/extension-activation.test.ts) проверяет эти переходы.

## Что изменено внутри Zero: полный runtime-список

| Файл | Изменение и граница |
| --- | --- |
| `adapter-pi-durable/src/engine/pi-durable-engine.ts` | Публичные view/controller, read-only native `isIdle()`, явный root target для root submit/abort. Harness owner не меняется |
| `adapter-pi-durable/src/engine/runtime-types.ts` | Optional conversation targets и expected model target; MCP command UI contract; native summary metadata |
| `adapter-pi-durable/src/engine/runtime-controller.ts` | Target validation внутри существующей command queue, hooks/receipts/cascade abort, stale model rejection; вызов оригинальной MCP command |
| `adapter-pi-durable/src/engine/runtime-hydration.ts` | Summary из публичных LiveDoc/InboxDoc/SubagentsDoc, native child metadata и настоящий assistant stop reason |
| `adapter-pi-durable/src/engine/runtime.ts` | Обновления непоказанных conversations и child registry попадают в summaries; retirement не считается обычным change |
| `adapter-pi-durable/src/engine/bridge/watch-events-compat.ts` | Подтверждённый `message_end` из persisted assistant entry, даже если live updates были объединены |
| `runner/src/composition.ts` | Экспорт native ports и read-only loader/settings; явная inline MCP identity в штатной композиции |
| `adapter-pi-durable/src/engine/extension-mount.ts` | Удаление общего startup barrier; demand-scoped readiness перед native snapshot; сохранение permission hooks |
| `adapter-pi-durable/src/engine/shared/extension-runner.ts` | Публичный `reachesTools: () => "all"`; корректная активация динамически зарегистрированных tools |
| `adapter-pi-durable/src/engine/tool-adapter.ts` | Именованный inline MCP descriptor вместо анонимной фабрики |

Пути в таблице находятся под `packages/`. Публичные native view/controller types уже экспортировались adapter-пакетом. Generic `IAgentEngine` не обязан реализовывать terminal-specific native ports.

Имена и activity children выводятся из native документов, не из текста родителя. Три regression cases используют ownerless conversations и пассивные records, без запуска дочерней модели. Подтверждённые пользователем child clicks не повторялись.

## Что не меняли

- Исходники зависимости Pi Durable, native `Harness`, model/tool loop, scheduler и SQLite format.
- SDK через `patch-package`, hidden postinstall, dependency override или monkey-patch. Такие механизмы не добавлены.
- Core ports ради терминального renderer, BB или iii.
- Основной Host, его services/launcher и существующие пользовательские сессии.

Точная формулировка: **отдельная host/terminal-сборка плюс ограниченные изменения Zero adapter/runner**, а не «только три пакета без изменений основы» и не «форк Harness».

## Навыки и native admission

Каталогом владеет прежний resource loader Zero. Runner открывает read-only facade того же экземпляра; metadata идут отдельно от native `view`.

Application-owned preprocessing раскрывает только явную `/skill:…` команду: ищет разрешённый catalog entry, читает файл, удаляет frontmatter публичным `stripFrontmatter` и сохраняет аргументы. Приватный SDK `_expandSkillCommand` не импортируется. Preprocessing расположен до root/child dispatch, а не дублируется в UI.

Неизвестный, повреждённый или недоступный skill отклоняется до admission. Receipt создаёт native submission, не адаптер. Это намеренно строже поведения, которое могло бы отправить неизвестную команду обычным текстом.

## Nico, config и OAuth

Текущий родительский Host использует Nico `pi-mcp-adapter@3.3.0`; Zero использует original Pi MCP `1.5.0`. Это разные реализации.

Общая основа `mcpServers`, `command/args/env`, `url/headers` совместима на уровне схемы. Native resolver поддерживает literals, `$VAR`/`${VAR}` и `!command`; project config загружается только из trusted `.pi/mcp.json`. Но Nico-specific imports, `directTools`, `disabled`, `requestTimeoutMs`, OAuth options и credential stores не объявляются переносимыми автоматически.

Original Pi хранит MCP OAuth в `<agent-dir>/mcp-auth.json`; Nico — в другом store (`$MCP_OAUTH_DIR`/`mcp-oauth`, service `pi-mcp-adapter.oauth`). `auth.provider` использует native login credentials. Токены не переносились, реальный browser/sign-in flow не принимался. Headers, URL с credentials и секреты не публикуются. Подробная [матрица совместимости](mcp-manager-and-pr3-review.md#nico-и-оригинальный-pi-mcp-что-совместимо).

## Сборка, установка и доказательства

Build script собирает кандидат вне source tree, не перезаписывая committed `dist`. Нужны Node `24.19+`, подготовленные зависимости и tmux для installed PTY.

```sh
node packages/local-runtime/scripts/build-candidate.mjs /tmp/pi-zero-review-candidate
cd /tmp/pi-zero-review-candidate
node --test --test-concurrency=1 --test-timeout=60000 \
  packages/local-runtime/test/*.test.ts \
  packages/local-terminal/test/*.test.ts \
  packages/terminal-ui/test/*.test.mjs \
  packages/adapter-pi-durable/test/controller-targeting.test.ts \
  packages/adapter-pi-durable/test/watch-events-compat.test.ts \
  packages/adapter-pi-durable/test/extension-user-message.test.ts \
  packages/adapter-pi-durable/test/extension-ui-context.test.ts \
  packages/adapter-pi-durable/test/extension-activation.test.ts \
  packages/adapter-pi-durable/test/runtime-activity.test.ts \
  packages/adapter-pi-durable/test/mcp-prompt-sync.test.ts \
  packages/adapter-codemode/test/*.test.ts
```

После source checks выполнен offline `pnpm deploy --legacy --prod` в новый prefix. Разрешения install scripts менялись только в копии candidate: `@google/genai=false`, `protobufjs=false`, прежний `esbuild=true`. Исправлена одна известная pnpm deployment self-link, затем проверен полный dependency closure. Это packaging correction, не runtime patch.

`pnpm-lock.yaml` содержит importers новых пакетов и их presentation dependencies; версия Harness не заменяется. `.gitignore` исключает машинный CodeGraph-каталог. Входящий в PR `AGENTS.md` сохраняет согласованный порядок: source checks → local install → installed checks → отдельная доставка.

| Проверка предыдущего candidate h | Результат | Где смотреть |
| --- | --- | --- |
| Build, production typecheck, UI asset checks | PASS | [build log](evidence/mcp-manager-build.txt) |
| Scoped source/native/client/UI/adapter suite | 69/69, 0 skipped | [regressions](evidence/mcp-manager-regressions.txt) |
| Installed original `/mcp` и rich/reload acceptance | 24/24 | [results](evidence/mcp-manager-installed/results.json) |
| Installed прежний rich baseline | 13/13 | [results](evidence/mcp-manager-baseline/results.json) |
| Installed stalled-peer startup + alias launcher | 2/2 | [log](evidence/mcp-manager-installed-regressions.txt) |
| Standalone package | 460 внутренних symlink, 0 external/broken, 10 matching entry hashes | [manifest](evidence/mcp-manager-package.json) |
| Presentation provenance/licenses | 49 records, public UI import, `LICENSE.Zero` | [manifest](evidence/mcp-manager-package.json) |

24 PTY checks включают bare `/mcp`, tools, direct/codemode exposure save, reconnect, disable/enable, resize, Escape/editor restoration, отсутствие MCP-команды в user prompts, nested-manager disconnect, сохранение PID, настоящий MCP call, reload, новый skill, отказ при active work и native Bash после отключения всех клиентов.

Offline provider заменяет только ответы модели. PTY, Harness, SQLite, MCP protocol и Bash настоящие. Driver создаёт собственные tmux/HOME/config/workspace/session и проверяет PID/executable перед cleanup. Реальные пользовательские данные не используются как fixtures.

Ранние 50/60-case и 13-case результаты сохранены в [skill follow-up](capability-followup.md) и [историческом MCP/reload-отчёте](mcp-reload-and-launcher.md). Старый startup-barrier помечен отменённым. Ранние driver failures не выдаются за PASS; дефект пустого редактора воспроизведён отдельно и исправлен до final candidate.

## Независимое source review

Для frozen candidate h сохранены [scope packet](evidence/mcp-manager-review-packet.md), [24-file manifest](evidence/mcp-manager-review-scope.json) и исходные verdict:

- [Terminal/projection report](evidence/mcp-manager-astra-terminal.md): частичная проверка без подтверждённых дефектов, не полный PASS. Activity, modal input, resize, truthful child status, provenance и часть cleanup не получили полного независимого покрытия. Reviewer не выполнял тесты и сообщил об одном read-only `rg` вопреки no-process ограничению.
- [Runtime/MCP outcome](evidence/mcp-manager-astra-runtime.md): worker остановлен по указанию пользователя; `unanswered (aborted)`, не PASS.

Первый Astra attempt candidate c также остался [incomplete / not accepted](../cycle-9/evidence/review-attempt-incomplete.md). Два меньших frozen-source review завершены: [sessions](../cycle-9/evidence/review-results-sessions.md), [MCP/runtime](../cycle-9/evidence/review-results-mcp.md). [Dispositions](../cycle-9/evidence/review-dispositions.md) содержат три подтверждённых исправления и явные ограничения неподтверждённого удаления tools/child records. Report reviewers не является независимым повторением product tests или проверкой candidate d. После этих reports новых reviewers не запускали.

## Порядок чтения для reviewer

1. [Session commands, финальный manifest и installed evidence](../cycle-9/session-commands-and-delivery.md), затем [P1/P2 и MCP](mcp-manager-and-pr3-review.md).
2. [Startup regression](../../../packages/local-runtime/test/mcp-startup-native.test.ts) и [extension mount](../../../packages/adapter-pi-durable/src/engine/extension-mount.ts): readiness против snapshot/permissions.
3. [Command UI adapter](../../../packages/local-runtime/src/mcp-ui.ts), [runtime ingress](../../../packages/local-runtime/src/index.ts) и [terminal client](../../../packages/local-terminal/src/client.ts): ownership и lifecycle.
4. [Activation regression](../../../packages/adapter-pi-durable/test/extension-activation.test.ts), [native activity regression](../../../packages/adapter-pi-durable/test/runtime-activity.test.ts), [launcher regression](../../../packages/local-terminal/test/launch-native.test.ts).
5. [Installed driver](evidence/mcp-reload-installed-check.py), его [24 results](evidence/mcp-manager-installed/results.json), экраны и package manifest.
6. [Общая архитектура и packaging](architecture-and-packaging.md), [README цикла](README.md), актуальные независимые reports Cycle 9.

## Ограничения и разрешённая доставка

- Не выполнены весь test suite репозитория, GitHub CI, macOS, новый live-provider smoke и реальная OAuth browser-авторизация. Model code review не заменяет live-provider acceptance runtime.
- `/mcp` поддержан как отдельный native command UI. Общий dispatch всех extension commands и общая UI-совместимость коллекции extensions не заявляются.
- Attention/supervisor, Goal, schedules, BB/iii и перенос коллекции extensions остаются следующими этапами. Скрытая панель не означает работающий backend.
- Idle-only resource reload не обновляет executable работающего runtime на месте. Нет неявной миграции старых sessions или user model state.
- Внешние MCP auth/connection failures не объявляются исправленными локальным fixture-прогоном.
- Полный installed child-model roundtrip не повторялся. Пользователь уже проверил child clicks; новая activity projection покрыта scoped native regressions.
- Основной `pi-durable` и старая вкладка Rex не переключены. DeLM остаётся на паузе.

Разрешены scoped commit/push и обновление **существующего PR № 3** после installed checks и независимого review. **Не разрешены автоматический merge, npm publication, primary global switch, session migration или production deployment.**
