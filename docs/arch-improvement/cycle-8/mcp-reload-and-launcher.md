# MCP, `/reload` и отдельная команда запуска

**Исторический отчёт для commit `85afe89` и кандидата `20261106T1026-mcp-reload`. Актуальная реализация и исправления review — в [новом отчёте](mcp-manager-and-pr3-review.md). Описанный ниже startup status-barrier отменён после P1 из PR № 3; прежняя проверка MCP calls не доказывала поддержку manager `/mcp`.**

Статус на момент этой итерации: **исправления и изолированная установка прошли проверки; команда `pi-durable-zero` установлена**. Это не глобальное переключение Pi Durable. Прежние сервисы, пользовательские сессии и открытая вкладка Rex не менялись. Перенос DeLM остаётся на паузе.

## Как запустить

```sh
pi-durable-zero
# Или выбрать рабочую папку:
pi-durable-zero --cwd /path/to/project
```

Команда запускает отдельный runtime и сохранённый rich-терминал. Для канонического пути каждой рабочей папки используется отдельная сессия в `${XDG_STATE_HOME:-$HOME/.local/state}/pi-durable-zero/sessions/<sha256-prefix>`.

- `/detach` закрывает только терминал; активная работа продолжается.
- Повторный запуск без startup-флагов подключается к тому же runtime. Старый prompt не отправляется повторно.
- `/reload` при отсутствии активных задач пересобирает ресурсы и соединения MCP, сохраняя процесс runtime, native-сессию и терминальное соединение.
- `/reload /absolute/path/extension.ts` добавляет явное расширение. Несуществующий путь отклоняется до закрытия сборки. Ошибки загрузки отдельных расширений остаются диагностикой SDK, а не доказательством успешной загрузки всего набора.
- Во время активной работы `/reload` возвращает ошибку, не прерывая задачу. Сначала дождитесь завершения или явно выполните abort.

`--session-dir PATH` выбирает другую изолированную сессию. `--provider`, `--model` и повторяемый `--extension` относятся только к первому запуску runtime; при подключении к уже работающему процессу они отклоняются. Процесс другой установки или рабочей папки не заменяется автоматически. Слишком длинный путь Unix-сокета отклоняется с предложением выбрать короткий `--session-dir`.

Установленная ссылка:

```text
~/.local/bin/pi-durable-zero
  → ~/.local/share/pi-durable-zero/candidates/20261106T1026-mcp-reload/bin/pi-durable-zero.mjs
```

Путь был свободен. Отдельный rollback команды — удалить только эту ссылку; это не остановит уже запущенные runtime и не удалит сессии. Сам кандидат оставлен доступным. Основная команда `pi-durable` не заменялась.

## Что было сломано и почему изменены файлы Zero

**MCP.** На настоящем stdio-peer воспроизведена ошибка первого native Codemode-вызова: `tools.mcp__fixture__zero_probe does not exist`. MCP подключался асинхронно, а native task уже фиксировал снимок реестра инструментов. Ожидание внутри tool wrapper было слишком поздним.

Первоначальное исправление находилось на публичной границе SDK extension bridge, не внутри Harness. Этот вариант ниже сохранён для истории; пункт 2 заменён demand-scoped readiness перед native tool snapshot после воспроизведения startup-зависания:

1. Composition root задаёт фабрике MCP явную inline-идентичность `mcp`.
2. До открытия Harness вызывается штатный read-only status handler зарегистрированной команды `<inline:mcp>`. Он дожидается первоначальных соединений; затем реестр синхронизируется.
3. Native `codemode` и `tool_search` проходят публичный `ToolTask.beforeTool` и SDK `tool_call`, включая настоящие permission blocks. Метаданные `reachesTools` используют публичное значение `"all"`.

У SDK нет отдельного публичного readiness-метода. Зависимость от штатного status handler явно ограничена именем и source identity; чужая одноимённая команда не вызывается. Фиксированный sleep, `wrapTool`, private imports и правки установленного SDK не используются. Проверка — реальный MCP protocol, native вызов и запрет через policy для трёх exposure-режимов.

**Reload.** Терминальный клиент раньше возвращал `Unsupported capability: runtime reload`. Теперь локальный host сериализует admission и reload, проверяет весь native task graph через публичный `observeTaskGraph` и переоткрывает ту же сборку только при отсутствии задач. Adapter предоставляет публичный read-only `isIdle`, runner передаёт его host. Startup provider/model overrides при переоткрытии не применяются повторно. Выбранная conversation восстанавливается через native controller; выдаётся новая view revision.

Это переоткрытие сборки, а не подмена модельного цикла и не обновление executable на месте. Ошибка повторного открытия закрывает endpoint; автоматического restart/replay нет. Native SDK/Harness, Core и формат SQLite не изменены.

## Проверенный кандидат и результаты

- Source/build candidate: `/tmp/pi-zero-mcp-reload-20261106-g`.
- Standalone prefix: `~/.local/share/pi-durable-zero/candidates/20261106T1026-mcp-reload`.
- Node `24.19.0`; Zero `0.27.0-alpha.1`; native SDK `1.5.0`.
- Build, production typecheck и проверка UI assets: **PASS** — [лог](evidence/mcp-reload-build.txt).
- Scoped source/native/client/UI/adapter tests: **60/60**, без skipped — [лог](evidence/mcp-reload-regressions.txt). Запуск с `--test-concurrency=2 --test-timeout=60000`; собственный 24-секундный deadline исходного native-теста не увеличивался.
- Новый installed rich PTY driver: **13/13** — [результат](evidence/mcp-reload-installed/results.json). Настоящий MCP V1/V2, `/reload` из UI, тот же PID/session, новая revision, новый навык, отказ при активной работе, native Bash после отключения всех наблюдателей и reconnect без replay.
- Прежний installed rich baseline: **13/13** — [результат](evidence/mcp-reload-baseline/results.json). Picker, Enter, Alt+Enter, error/draft recovery, отсоединение и продолжение native Bash не регрессировали.
- Standalone package: **459** внутренних symlink, **0** внешних/сломанных, **10/10** matching entry hashes, **49** UI provenance records и объявленная replacement — [манифест](evidence/mcp-reload-package.json).
- После создания короткой ссылки выполнен настоящий `pi-durable-zero --help`; PATH и realpath указывают на проверенный installed prefix.

Два ранних installed-прогона остановились после проверки busy reload. Причина — driver отправлял очистку редактора до закрытия error dialog, поэтому следующий ввод склеивался с восстановленным `/reload`. Сохранение черновика — ожидаемое UI-поведение. Финальный driver ждёт закрытия диалога и явно удаляет семь символов тестового черновика, не ослабляя проверку продолжающегося Bash. Отдельный ранний параллельный suite получил timeout при конкуренции; ограниченный запуск завершился без ошибок. Эти неудачные попытки не выдаются за PASS.

Deterministic provider заменяет только ответы модели. Runtime, rich PTY, Harness, SQLite, MCP protocol и Bash настоящие. Платного модельного запроса и действий внешними MCP-инструментами в этом follow-up не было. Полный suite репозитория, новый live-provider smoke, installed child UI roundtrip и полная model/thinking-матрица не заявляются проверенными.

### Воспроизведение

```sh
node packages/local-runtime/scripts/build-candidate.mjs /tmp/pi-zero-mcp-review
cd /tmp/pi-zero-mcp-review
node --test --test-concurrency=2 --test-timeout=60000 \
  packages/local-runtime/test/*.test.ts \
  packages/local-terminal/test/*.test.ts \
  packages/terminal-ui/test/*.test.mjs \
  packages/adapter-pi-durable/test/controller-targeting.test.ts \
  packages/adapter-pi-durable/test/watch-events-compat.test.ts \
  packages/adapter-pi-durable/test/extension-user-message.test.ts \
  packages/adapter-pi-durable/test/extension-ui-context.test.ts \
  packages/adapter-codemode/test/*.test.ts
```

Standalone deploy выполнялся offline через кешированный pnpm `11.25.0` по порядку из [packaging-отчёта](architecture-and-packaging.md). Исправлена только известная pnpm self-link внутри нового prefix; сохранён `LICENSE.Zero`. Fixtures установлены внутри кандидата, не загружаются из другого checkout.

```sh
PREFIX="$HOME/.local/share/pi-durable-zero/candidates/20261106T1026-mcp-reload"
EVIDENCE=docs/arch-improvement/cycle-8/evidence
node "$EVIDENCE/mcp-reload-package-check.mjs" /tmp/pi-zero-mcp-reload-20261106-g "$PREFIX"
python3 "$EVIDENCE/mcp-reload-installed-check.py" "$PREFIX" \
  "$PREFIX/node_modules/@local-durable/runtime/test-fixtures/provider.ts" \
  "$PREFIX/node_modules/@local-durable/runtime/test-fixtures/mcp-server.mjs"
python3 "$EVIDENCE/capabilities-installed-check.py" "$PREFIX" \
  "$PREFIX/node_modules/@local-durable/runtime/test-fixtures/provider.ts"
node "$EVIDENCE/mcp-reload-configured-check.mjs" "$PREFIX"
```

## Настроенные MCP: границы результата

В отдельной пустой рабочей папке проверены startup и доступность каталога из настоящего global MCP config. Конфигурация и ключи не менялись, секретные header values/URLs не сохранялись. [Санитизированный результат](evidence/mcp-reload-configured.json):

| Сервер | Наблюдение |
| --- | --- |
| kanso | connected, 15 tools |
| mcp-agent-mail | connected, 45 tools |
| railway | connected, 36 tools |
| context-mode | connected, 9 tools |
| langfuse | connected, 95 tools |
| pi-lens | connected, 17 tools |
| exa | connected, 3 tools; `web_search_exa` виден через native Codemode |
| codegraph | connected, 0 tools в неиндексированной временной папке |
| timewebCloud | failed; ранее получена ошибка аутентификации |
| open-design | failed; ранее получен `write EPIPE` |
| radius | needs sign-in |
| paper, shadcn | disabled по конфигурации |

**CodeGraph не сломан мостом:** установленный `dist/mcp/session.js`, `handleToolsList`, строки 231–242 намеренно возвращает `[]`, когда `engine.hasDefaultCodeGraph()` ложен. `SERVER_INSTRUCTIONS_UNINDEXED` объясняет тот же контракт. Первая диагностическая утилита ошибочно требовала CodeGraph tools даже в пустом workspace и вернула exit 1; после проверки причины ожидание исправлено. Индекс не создавался. Это не доказательство работы CodeGraph queries в конкретном проекте.

Bang-prefixed config values разрешает установленный SDK (`dist/core/resolve-config-value.js`), а не наш самодельный resolver. Успешная регистрация Langfuse и Exa не означает исправление всех серверных credentials. `connected` и каталог не доказывают выполнение внешнего инструмента; реальный tool-call проверен только на изолированном MCP peer.

## Инвентаризация недостающих основ

| Возможность | Статус и граница |
| --- | --- |
| Один запуск без длинного node-пути | Установлена отдельная команда; не заменяет `pi-durable` |
| MCP discovery и native calls | Исправлены и проверены на реальном peer в codemode/direct/deferred; внешние ошибки выше остаются |
| `/reload`, навыки, MCP reconnect | Проверены; только при idle, без смены executable |
| Streaming, tool cards, abort, detach/reconnect | Покрыты scoped native и installed PTY-проверками; без нового paid-provider smoke |
| `/model`, `/thinking`, `/compact`, `/tasks`, conversation switch | Клиент передаёт настоящие native команды; полная installed-матрица после reload ещё не проверена |
| Session creation/list/rename из терминала | Не реализованы; новая отдельная сессия доступна через `--session-dir`, list/rename возвращают unsupported |
| Отдельные CLI status/stop/list для фоновых runtime | Не реализованы; launcher показывает PID/log. `/detach` и `/quit` закрывают клиент, не процесс исполнения |
| Общий dispatch slash-команд расширений, `/mcp`, MCP login UI | Не подключён к терминальному RPC; внутренний вызов status handler при startup не означает доступность `/mcp` пользователю |
| Вся коллекция старых extensions и их UI | Не переносилась; работает явный `--extension`, полная совместимость не заявляется |
| Attention/supervisor, Goal, schedules | Отложены; скрытые панели не считаются реализацией |
| BB/iii, DeLM | Отдельный последующий этап; текущая работа их не запускала |
| Совместная приёмка и основное глобальное переключение | Не выполнены; старая вкладка Rex осталась на прежнем кандидате |

Новые commit/push и обновление PR № 3 относятся к этому согласованному follow-up. Merge, npm publication, перезапуск прежних сервисов и перенос пользовательских сессий не выполняются автоматически.
