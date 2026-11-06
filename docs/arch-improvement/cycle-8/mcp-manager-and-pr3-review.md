# Оригинальный MCP manager и исправления замечаний PR № 3

## Проверенный кандидат

- Source/build: `/tmp/pi-zero-pr3-review-20261106-h`.
- Standalone: `~/.local/share/pi-durable-zero/candidates/20261106T1307-mcp-manager`.
- Основа: commit `85afe89869e60b887703d215005d4c37bac3c177` плюс проверенные изменения рабочей копии. Commit доставки создаётся после installed-проверок.
- [Manifest исходников](evidence/mcp-manager-review-scope.json) фиксирует SHA256 24 изменённых или добавленных source-файлов. Их байты совпали с build candidate перед независимым ревью.
- Node `24.19.0`, Zero `0.27.0-alpha.1`, native Pi SDK `1.5.0`. Сохранённый терминал использует presentation-зависимость `pi-tui@1.4.0`; оригинальный MCP UI работает через `pi-tui@1.5.0`.

Это отдельная opt-in установка, не замена основной команды `pi-durable`. Пользовательские сессии, сервисы прежнего Host и старая вкладка Rex не мигрировали и не перезапускались. DeLM остаётся на паузе.

## P1: необязательный MCP блокировал запуск

Замечание: [комментарий к PR № 3](https://github.com/VanDalkvist/durable-zero/pull/3#issuecomment-6684195890).

Первоначальное исправление discovery ожидало штатную команду `/mcp` при сборке runtime. Это закрывало гонку реестра, но создало общий startup-барьер. HTTP peer мог ответить на `initialize` и оставить POST `notifications/initialized` без ответа. Настроенный секундный timeout не ограничивал ожидание этой notification, поэтому runtime не доходил до ready.

Ошибка воспроизведена исходным reviewer repro и отдельным regression-тестом. [Red](evidence/mcp-manager-startup-red.txt) показывает отсутствие ready; [green исходного repro](evidence/mcp-manager-startup-green.txt) проверяет исправленный build. Установленный кандидат дополнительно проверен [native regression-тестом](evidence/mcp-manager-installed-regressions.txt).

Исправление в `packages/adapter-pi-durable/src/engine/extension-mount.ts`:

1. Удалён await status-команды из startup. Подключением и закрытием MCP по-прежнему владеет оригинальное Pi extension.
2. Публичный `GenerationTask.afterResponse` ожидает discovery только после реального model-issued `codemode` или `tool_search`, до создания native tool tasks с неизменяемым snapshot реестра.
3. На этой ранней стадии вызываются только публичные `tool_call` handlers штатного `<inline:mcp>`. Им передаётся native `abortSignal`.
4. Общие SDK permission hooks остаются на `ToolTask.beforeTool`. Ранний discovery не выдаёт разрешение на выполнение и не обходит policy.

Удалить startup-await без переноса readiness было недостаточно: реальный Codemode-вызов снова терял инструмент в раннем snapshot. Этот неполный вариант отвергнут после воспроизведения регрессии. Ни timeout-race вокруг зависшей операции, ни правки SDK здесь не используются.

Installed-тест подтверждает: ready при зависшем peer, обычный offline turn, ожидание discovery до tool task, native abort, reload с тем же PID, отмену старого HTTP-запроса, graceful close без открытых MCP handles и повторное открытие той же сессии. Abort turn не уничтожает runtime-owned соединение; его отменяет штатное закрытие сборки.

## P2: канонический путь и уборка launcher-теста

`packages/local-terminal/test/launch-native.test.ts` теперь вычисляет ожидаемый hash после `realpath(rawCwd)`. Повторный запуск намеренно использует alias рабочей папки и должен вернуть прежний PID без повторного prompt.

Fixture отслеживает все объявленные launcher-ом runtime PID и session directory, включая процессы, созданные до неудачного assertion. Перед сигналом cleanup сверяет RPC PID и канонический executable path. Сравнение через `realpath` учитывает и установленные pnpm symlink. Затем тест ожидает закрытия endpoint и собственных launcher children.

Регрессия проверена на Linux с symlink в `TMPDIR`, а также на установленном standalone candidate: [2/2 installed regressions](evidence/mcp-manager-installed-regressions.txt). Это эквивалентный случай канонизации пути, **не проверка на macOS**. Для Unix-сокета использовались короткие временные пути; отдельный отказ при чрезмерной длине сокета не скрывался увеличением лимита.

## `/mcp`: оригинальный интерфейс, а не второй manager

Ранее проверялись MCP-вызовы, но bare `/mcp` возвращал `Unsupported command: /mcp`. Теперь команда и её аргументы проходят через публичный `DurableController.executeMcpCommand()` в зарегистрированную команду `<inline:mcp>`.

- `local-runtime/src/mcp-ui.ts` размещает оригинальные SDK-компоненты на публичном `TuiMainScreen` и реализует remote `Terminal`. Это command-owned UI adapter, не MCP client, не копия manager и не Harness.
- `session/mcpCommand`, `session/mcpInput` и `session/mcpResize` связывают этот UI с терминальным клиентом. Ownership проверяется на входе: другой клиент не может вводить клавиши в чужое меню.
- `local-terminal/src/client.ts` временно останавливает сохранённый UI, запускает `ProcessTerminal` и передаёт ввод, размеры и terminal operations. Цвета и keybindings приходят из действующего rich UI.
- Только interactive-команда получает `mode: tui` и `hasUI: true`. Сам runner остаётся headless. Admission сериализован, но очередь не удерживается на всё время жизни меню: observer может читать состояние и выполнять native abort.
- `/reload` отклоняется, пока manager открыт. Disconnect отменяет только command UI; native меню само освобождает подписки и отменяет sign-in. Для закрытия при изменённом cancel binding command-owned manager временно получает известную клавишу Escape.

Runtime host теперь содержит native TUI adapter именно для этой команды. Он не импортирует пакет сохранённого terminal UI или терминальный клиент. Core не получает renderer-зависимости; native runtime работает без подключённого терминала.

При полноценной PTY-проверке найден дополнительный дефект: runtime notification во время suspended UI оставляла отложенный render; после выхода из manager редактор мог остаться пустым. Он воспроизведён [отдельным red regression](evidence/mcp-manager-editor-red.txt). Возврат вызывает публичный `view.ui.requestRender(true)`, без патча TUI/SDK. [Green](evidence/mcp-manager-editor-green.txt) и installed PTY проверяют восстановление редактора и следующий настоящий MCP-вызов.

В `shared/extension-runner.ts` исправлена активация динамически зарегистрированных tools: direct/model-only переходы активируют новый инструмент, hidden удаляет его, `defaultActive: false` и явное отключение на неизменённом refresh сохраняются. Без этого после смены exposure и reload direct tool мог остаться недоступным.

## Имена и активность native children

`runtime-hydration.ts`, `runtime.ts` и `runtime-types.ts` проецируют public LiveDoc, InboxDoc и SubagentsDoc в summary. Сохраняются native key/name, parent, role, task/report и настоящий assistant stop reason. Изменения непоказанной conversation обновляют summary; retirement document не принимается за обычный change.

Статус не выводится из текста родителя и не подменяется предположением «завершён». Три регрессионные проверки работают с пустыми ownerless native conversations и пассивными записями, без запуска дочерней модели. Уже подтверждённые пользователем child clicks повторно не тестировались.

## Nico и оригинальный Pi MCP: что совместимо

В текущем родительском Host используется Nico `pi-mcp-adapter@3.3.0`. В Zero composition root зарегистрирован оригинальный `createMcpExtension()` из Pi SDK `1.5.0`. Nico не переносился в Zero, второй manager не создавался.

Read-only проверка схемы живого `mcp.json` не выполняла содержащиеся в нём shell-команды и не копировала credentials. В файле 13 server entries, из них два с `enabled: false`; четыре header maps, три со значениями-командами. Значения headers, URL и токены в evidence не публикуются.

| Область | Оригинальный Pi MCP | Граница совместимости |
| --- | --- | --- |
| Базовый config | Agent `mcp.json`, `mcpServers`, stdio `command/args/env`, HTTP `url/headers` | Общая основа совпадает, но весь config не объявляется взаимозаменяемым |
| Project config | Только trusted `<cwd>/.pi/mcp.json`; полные entries или ограниченные overrides | Не переносит автоматически import/discovery слои Nico |
| Значения headers/env | Литералы, `$VAR`/`${VAR}`, `!command` через native resolver | Нужны доступные процессу env и файлы; проверка схемы не доказывает авторизацию |
| Exposure | `codemode`, `deferred`, `direct`, `hidden`, per-tool overrides | Nico `directTools` и другие его опции не заменяются автоматически |
| Disable/timeout | `enabled: false`, `timeout` в секундах | Не путать с Nico `disabled` и `requestTimeoutMs` |
| OAuth | Native `<agent-dir>/mcp-auth.json`; HTTP challenge либо `auth.provider` через native login | Nico использует другой credential store: `$MCP_OAUTH_DIR`/`mcp-oauth`, service `pi-mcp-adapter.oauth`. Перенос токенов не выполнен и не обещается |

Ранее наблюдавшиеся auth/connection failures внешних серверов не выдаются за исправленные этим candidate. В installed-проверках использованы только собственные offline provider и MCP peers. Реальная OAuth browser/sign-in процедура здесь не принималась.

## Проверки

| Проверка | Результат | Evidence |
| --- | --- | --- |
| Build, production typecheck, UI provenance | PASS | [build](evidence/mcp-manager-build.txt) |
| Scoped source/native/client/UI/adapter suite | 69/69, без skipped | [regressions](evidence/mcp-manager-regressions.txt) |
| Installed rich `/mcp`, tools, exposure, reconnect, disable/enable, resize, Escape/editor, disconnect, reload, native call/Bash | 24/24 | [results](evidence/mcp-manager-installed/results.json) |
| Installed прежний rich baseline | 13/13 | [results](evidence/mcp-manager-baseline/results.json) |
| Installed stalled-peer startup и alias launcher | 2/2 | [native regressions](evidence/mcp-manager-installed-regressions.txt) |
| Standalone dependency closure | 460 внутренних symlink, 0 external/broken, 10 matching entry hashes | [manifest](evidence/mcp-manager-package.json) |
| Presentation | 49 provenance records, сохранён `LICENSE.Zero`, публичный UI import | [manifest](evidence/mcp-manager-package.json) |

Installed driver создаёт отдельный tmux server, HOME, agent config, workspace и session. Сигналы адресуются только сверенным собственным runtime. Ранние неудачные driver-прогоны не включены в итоговые PASS: уточнены ожидания native menu selection и сравнение pnpm executable path. Дефект пустого редактора, в отличие от этих ошибок driver, получил отдельный source regression и исправление продукта.

## Независимое source review

После installed-приёмки запущены два native Astra reviewers для frozen candidate h. [Scope packet](evidence/mcp-manager-review-packet.md) и [SHA manifest](evidence/mcp-manager-review-scope.json) фиксируют 24 source-файла.

- [Terminal/projection report](evidence/mcp-manager-astra-terminal.md): подтверждённых дефектов нет, но проверка частичная. Activity, modal input, resize, truthful child status, provenance и часть cleanup не получили полного независимого покрытия. Reviewer не выполнял тесты и не проверял все acceptance logs; сообщил об одном read-only `rg` вопреки no-process ограничению.
- [Runtime/MCP outcome](evidence/mcp-manager-astra-runtime.md): итоговый отчёт не получен. По указанию пользователя закончить проверки worker остановлен; outcome — `unanswered (aborted)`, не PASS и не дефект продукта.

Полная независимая приёмка обоих slices не заявляется. Source и installed evidence выполнены владельцем и записаны отдельно. Новые раунды review не запускались.

При согласовании следующего session-среза GrayMountain передал дополнительные source-review предположения о stale active-tool names и удалении child registry metadata. Disposition active-tool refresh передан ему для следующего согласованного коммита; это не объявляется закрытым исправлением h. Штатный сценарий удаления child registry record пока не установлен. Непроверенные предположения не превращены в подтверждённые severity findings.

## Как повторить

Сборка и полный scoped набор: команда из [исторического MCP/reload-отчёта](mcp-reload-and-launcher.md#воспроизведение), дополненная `extension-activation.test.ts`, `runtime-activity.test.ts` и `mcp-prompt-sync.test.ts`. Финальный лог содержит все 69 cases.

```sh
CANDIDATE=/tmp/pi-zero-pr3-review-20261106-h
PREFIX="$HOME/.local/share/pi-durable-zero/candidates/20261106T1307-mcp-manager"
EVIDENCE=docs/arch-improvement/cycle-8/evidence

node "$EVIDENCE/mcp-reload-package-check.mjs" "$CANDIDATE" "$PREFIX"
python3 "$EVIDENCE/mcp-reload-installed-check.py" "$PREFIX" \
  "$PREFIX/node_modules/@local-durable/runtime/test-fixtures/provider.ts" \
  "$PREFIX/node_modules/@local-durable/runtime/test-fixtures/mcp-server.mjs"
python3 "$EVIDENCE/capabilities-installed-check.py" "$PREFIX" \
  "$PREFIX/node_modules/@local-durable/runtime/test-fixtures/provider.ts"
ZERO_INSTALLED_PREFIX="$PREFIX" \
ZERO_PROVIDER_FIXTURE="$PREFIX/node_modules/@local-durable/runtime/test-fixtures/provider.ts" \
node --test --test-timeout=30000 \
  packages/local-runtime/test/mcp-startup-native.test.ts \
  packages/local-terminal/test/launch-native.test.ts
```

Для symlink-TMPDIR case создаются собственные короткие `/tmp/rXXXXXX` и `/tmp/l…`; alias указывает на реальный каталог. `TMPDIR` задаётся только тестовому процессу. После проверки удаляются только собственный alias и пустой каталог.

Не проверены весь test suite репозитория, GitHub CI, macOS, новый live-provider smoke и реальная OAuth авторизация. Общий extension-command dispatch, перенос коллекции extensions, BB/iii, Attention, Goal и schedules не входят в этот follow-up. Рабочий `/mcp` не означает общую UI-совместимость всех extensions.
