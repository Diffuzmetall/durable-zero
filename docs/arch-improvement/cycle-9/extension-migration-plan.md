# Перенос коллекции Durable extensions на Zero

## 1. Решение и границы

Переносим по одному рабочему поведению, начиная с наиболее простых и независимых. Каждый самостоятельный runtime-компонент получает отдельный workspace-пакет, интеграционные проверки, проверенный устанавливаемый артефакт и отдельный commit/push. Рендереры подключаются к существующему terminal UI, а не становятся вторым владельцем runtime. Для legacy/duplicate компонентов перенос означает сохранение нужного поведения у нынешнего владельца, а не обязательное копирование старого каталога.

Этот документ — план, не утверждение совместимости или выполненной миграции. Никакие приведённые ниже продуктовые тесты в ходе планирования не запускались. Основная установка, пользовательские сессии, сервисы, DeLM и BB/iii не меняются. npm publication, global switch и upstream push не входят в плановую работу.

> 🧠 **From Hindsight memory (Переход локального Durable на Durable Zero)** — Исторически согласован порядок: сначала независимые terminal/runtime и один native Harness, затем перенос расширений через подходящую границу. Эти ограничения подтверждены текущим `AGENTS.md`; актуальное состояние поставки сверено отдельно с Cycle 8, а не выведено из памяти.

## 2. Проверенные входные данные

- Zero checkout: `/home/ubuntu/Projects/pi-durable-zero-playground`, HEAD `85afe89869e60b887703d215005d4c37bac3c177`, ветка `feat/zero-terminal-runtime`. В дереве уже есть изменения foundation/MCP/UI; они не принадлежат этому переносу.
- Коллекция: `/home/ubuntu/Projects/pi-durable-extensions`, HEAD `d2d6024704e172c52a007484ea07e8b012263bca`, также dirty. Следовательно, HEAD не идентифицирует текущие исходные байты: перед извлечением каждого пакета сохранить manifest путей/SHA256, notices и отличия от HEAD.
- Файловая инвентаризация подтвердила **31 каталог, 23 с package.json, 8 без manifest**. Перечень сопоставлен с `pi-durable-extensions/docs/extensions-inventory.md`. Это не 31 активное расширение.
- Текущая `~/.local/bin/pi-durable` указывает на прежний launcher `delivery-recovery-terminal-20261101`. Это проверка файла запуска, не состояния живого Host.
- Последний локальный отчёт `cycle-8/mcp-manager-and-pr3-review.md` описывает изолированный candidate `20261106T1307-mcp-manager`, результаты 69 scoped, 24 installed MCP, 13 baseline и 2 installed regression checks. Это сохранённое evidence, не повторный прогон здесь. Независимое review в отчёте ещё имеет статус «выполняется»; совместная приёмка и глобальное переключение не объявлены завершёнными.
- `fork` → `https://github.com/Diffuzmetall/durable-zero.git`; `origin` → `https://github.com/VanDalkvist/durable-zero.git`. Пользователь уточнил доставку: **существующий PR № 3**, head `Diffuzmetall/durable-zero:feat/zero-terminal-runtime`. PR открыт, его исходный head — `85afe89869e60b887703d215005d4c37bac3c177`. Прежняя рекомендация отдельной `feat/zero-extensions` отменена; новые проверенные commits идут в эту же ветку.

### Как оценена сложность

Оценки относительные, по текущим entry/API, owner boundary, внешним ресурсам и проверкам; не обещание сроков. S — локальный tool/section без нового lifecycle; M — сеть, transport, execution policy или UI; L — Harness lifecycle, authority, recovery или provider integration. После compile/probe оценка может измениться. «Заблокирован» — конкретная зависимость, а не «сложный код».

## 3. Обязательный первый шаг — не ещё один extension framework

В исходниках уже есть:

- `packages/runner/src/composition.ts`: native MCP через `createMcpExtension()` и существующий CodeMode builtin; `DefaultResourceLoader` для обычных Pi ExtensionAPI modules.
- `packages/adapter-pi-durable/src/engine/runtime-types.ts`: публичные `PiRuntimeDependencies.builtins`.
- `packages/adapter-pi-durable/src/engine/builtin-extensions/types.ts`: `register(ctx)` с native Registry и `teardown`, но без post-open Harness.
- `packages/adapter-pi-durable/src/engine/runtime-loader.ts`: сборка builtins и teardown.

**Измеренный интерфейсный пробел:** публичные `AssembleDurableZeroOptions` пока не передают дополнительные builtins; composition задаёт `[codemodeBuiltin]` непосредственно. Обычный `--extension` предназначен для Pi ExtensionAPI и не превращает native `defineExtension` в такой модуль. У `mcp-guidance/adapter.mjs` старый registry-transform entry — его нельзя принять за Zero extension entry.

Предпочтение для первого пакета: native extension factory в собственном пакете + тонкий Zero BuiltinExtension wrapper. Использовать существующую public Registry boundary. Для подключения сначала проверить, достаточно ли публичной композиции engine; если нет — предложить узкую передачу дополнительных builtins через composition root. **Это ещё не изменение Zero и не воспроизведённый дефект**, а отсутствующий assembly input. До изменения объяснить конкретную границу и проверить default behavior, duplicate IDs, startup failure/cleanup, reload и installed loading. Не делать deep imports, собственный loader, глобальный Registry, copied composition или скрытый Harness.

Post-open bind/drain/close для `running-now`/memory/tracing рассматривается позже, с реальным потребителем; не строить его заранее для двух первых статических extensions.

## 4. Полная очередь нашей коллекции

Номер — рекомендованный порядок среди готовых зависимостей. При блокировке лицензией или внешним сервисом работа переходит к следующему независимому кандидату; безопасность не обходится. Proposed package names выбираются при реализации, без объявления несуществующих пакетов установленными.

| № | Каталог | Сложность / готовность | Граница и главный критерий |
| --- | --- | --- | --- |
| 1 | `search-history` | S; первый кандидат после foundation и assembly input | Native tool над существующими `api.commit/scanEntries`. Только своя conversation, AND/filter/paging, compaction/reset, newest-10000/truncated; reopen не теряет результаты. Никакой второй БД. |
| 2 | `mcp-guidance` | S–M; после MCP baseline | Динамическая native prompt section из реальных direct/callable/deferred views. Проверить идентификаторы MCP Zero, hidden/exposure/reload, отсутствие секции без доступных tools; никакого auto-Lens или второго MCP client. |
| 3 | `context7` | S–M; credentials/network | Native tools с явным credential resolver, bounds, abort и ошибками. Сохранить API-key privacy; installed smoke через разрешённый реальный сервис до заявления полной готовности. Не дублировать Context7 из классического Pi-контура. |
| 4 | `web-tools` | M; сеть и dependency closure | Один пакет search/fetch/batch. Есть большой transport/extraction closure: не считать простым по трём exported tools. Проверить budgets, spills, download paths, partial/all-failed results, abort и real endpoint. |
| 5 | `dcg-guard` | M; security-critical | На фактической границе native исполнения bash, включая альтернативные разрешённые пути. Block до запуска, отсутствие bypass и сохранение разрешённых команд. UBS не включать. |
| 6 | `agent-mail-identity` | M–L; host identity/admission | Привязка существующей identity, guards и owned watcher close/reload/reconnect; не создавать identity автоматически. |
| 7 | `agent-mail` | M–L; после № 6; rights HOLD | MCP/policy adapter, не новый сервер. Conversation ownership, reservation/guard refusal, identity и cancellation. `UNLICENSED`/unresolved donor grant блокирует публичный перенос исходников, пока права не разрешены. |
| 8 | `agent-profiles` | S для parser; rights HOLD | Parser/catalog в отдельной library, runtime launch — у native owner. YAML validation, path/size bounds, profile consumption реальным child. `UNLICENSED` не игнорировать ради небольшого размера. |
| 9 | `running-now` | S по tool; BLOCKED lifecycle | Получает существующий Harness и host-authorized visibility. Проверить свой/чужой scope, dispose task graph, truncation, реально активный native task. Нужна явная post-open граница, не глобальная ссылка. |
| 10 | `durable-browser` | M; browser lifecycle | Один browser owner, conversation-scoped contexts; native call, изоляция, disconnect/reconnect и cleanup. Старый ограниченный live acceptance не считать новым PASS. |
| 11 | `codex-api` | M–L; OAuth/provider/persistence | Native tools через существующего provider owner, artifact/upload roots и abort. Проверять установленный пакет и реальные разрешённые операции; не добавлять второй auth store. Notices и grant closure сверить перед push. |
| 12 | `antigravity-shim` | L; service/auth; rights HOLD | Provider/service adapter, не Registry tool. Startup/auth/health/shutdown и отсутствие process-global monkey patches. `UNLICENSED` требует разрешения. |
| 13 | `antigravity-tools` | S по wrapper, M–L по зависимости | Только после работающего provider operations boundary № 12 или уже доказанного public provider API. Search/image, cwd output policy, auth failure и abort. 90 строк wrapper не доказывают готовность backend. |
| 14 | `codex-voice` | M–L; transport + microphone UI; rights HOLD | Transport/transcription отдельно от редактора/записи. Нет autosend, корректны отмена и отсутствие terminal. `UNLICENSED` и неполный provenance сначала разрешить. |
| 15 | `durable-schedules` | L; native admission/recovery | Существующие native tasks, не второй scheduler. Due while detached, exactly-once admission/reopen, cancel и uncertainty. |
| 16 | `durable-triggers` | L; после task/admission boundary | Bounded authorized read-only GitHub watches, реальные receipts, stop/recovery. Не включать webhook ingress, которого donor не переносил. |
| 17 | `durable-subagents` | L; существующие Zero children уже есть | Сопоставить отсутствующие capabilities с native Zero implementation; портировать только gap. Real parent/child receipts, tools/model visibility, steer/followUp, abort, delivery/reopen. Не ставить второй subagent loop. |
| 18 | `durable-goals` | L; companion lifecycle/recovery | Сохранить один Goal owner. Limits, pause/resume/wait/evidence и human gate через реальную сборку; никаких fabricated approvals и конкурирующего goal loop. |
| 19 | `hindsight` | L; lifecycle/admission/privacy | Существующие Harness/storage + bind/admit/drain/close. Нет утечки другой conversation, потерянных drains или второго memory controller; настоящий сервис проверяется отдельно. |
| 20 | `langfuse` | M–L; lifecycle/privacy | Один tracing pipeline, hooks на реальном Harness, flush/close, корреляция и redaction. Без автоматического экспорта private payloads или дублей. |
| 21 | `activity-panel` | M; UI owner | Пакет presentation на текущих native summaries/visibility. Реальные child states и clicks, не status из текста. Уже существующее поведение сначала сверить, не переносить patches повторно. |
| 22 | `automation-footer` | M; после № 15/18 | Только projection настоящих Goal/schedule states; detached/reattached состояния и bounds. Footer не исполняет задачи. |
| 23 | `minimal-footer` | S–M; UI partially present | Переиспользовать установленный preserved UI. Отдельный presentation package/entry только для реально отсутствующего поведения; resize/cwd/identity. Не переносить старый Algorithm bridge. |
| 24 | `slash-menu` | S–M; skills/commands partially present | Использовать действующий editor/skill loader. Проверить completion, selection, command dispatch и восстановление редактора. Не копировать legacy patch поверх нового UI. |
| 25 | `quit-command` | S–M; terminal semantics | Quit отсоединяет client, но не убивает активный runtime. PTY exit/abort/reconnect; не подменять Ctrl-C и выход общей остановкой Harness. |
| 26 | `tool-cards` | M; preserved UI уже содержит cards | Сначала соответствие renderer contracts/тем/width/tool results. Переносить только недостающую presentation closure с NOTICE/LICENSE.pi-style; не второй executor. |
| 27 | `session-resume` | M–L; часть уже реализована | Использовать Zero session identity/locks и текущий launcher. Новый CLI-пакет только для пробелов picker/title/resume; без implicit migration пользовательских SQLite. |
| 28 | `host-recovery` | M–L; operational, не extension | Адаптировать только к новой установке; dry-run/owned paths/backup/restore в изоляции. Никаких старых production путей и восстановления credentials/DB по умолчанию. |
| 29 | `cli` | M; после проверенных artifacts | Distribution package: scoped install, identity/digests, usable rollback, installed activation. Старая portable catalog не источник доверия для новой сборки. |
| R1 | `codemode` | REUSE; уже есть Zero adapter | Проверять существующий native sandbox/tool dispatch, exposure, abort и reload. Не копировать старый пакет ради 31-го нового пакета. |
| R2 | `local-host` | DO NOT LOAD WHOLE; legacy composition | Полезные capabilities распределить по владельцам выше. Старое controller patching и дублирующие resources не переносить. Нужное поведение учитывать явно, не устанавливать legacy host рядом с Zero. |

**Итого:** 29 последовательных решений о переносе/сохранении поведения + 2 явных reuse/retire решения = все 31 каталога. Номера не являются оценкой числа будущих commits: общая необходимая граница может потребовать отдельного инфраструктурного commit, а уже реализованный UI не нуждается в фиктивном новом пакете.

## 5. Первый исполняемый срез: search-history

### Предварительные условия

1. Завершена текущая foundation review/delivery; её source и installed artifact связаны проверяемым candidate identity. Никакие результаты Cycle 8 не объявляются повторно проверенными этим планом.
2. Remote/ref согласованы: `fork`, `feat/zero-terminal-runtime`, существующий PR № 3. Перед каждым push сверить актуальный head и отсутствие чужих remote commits; не force-push.
3. Зафиксированы donor bytes `search-history/src/{index,history}.ts`, package metadata, tests и notices. API сверяется именно с установленным SDK 1.5, а не с donor peer 1.3.
4. Нужный assembly input подключает пакет через публичную границу. Если нужен focused Zero improvement, сначала объяснение и узкие regression checks из раздела 3.

### Результат среза

Предлагаемый пакет `@local-durable/extension-search-history` в `packages/extension-search-history/`: native factory, Zero wrapper, public exports/types, README, license/provenance и tests. Это proposed name, не существующий artifact. Никакого нового history store. Пакет включается явно только в изолированную тестовую сборку.

### Проверки

- Unit: literal AND, kind/tool/range/entry semantics, bad range, order/offset/limit, boundary 10000, truncated/total_is_complete; не приписывать полноту усечённому результату.
- Native integration: через один реальный Harness записать entries, вызвать инструмент, compact/reset и reopen; инструмент видит только свою conversation. Не менять пользовательскую БД.
- Installed integration: pack → чистая временная установка → import публичного entry → native model-issued tool call → корректный tool result в terminal → reopen. Offline test provider допустим для детерминированного dispatch, но не заменяет живой provider smoke там, где от него зависит поведение.
- Reload/registration: нет duplicate tool names, смены владельца Registry или второго Harness. Ошибка установки не оставляет ресурсы. Завершение клиента не закрывает runtime.
- Source/build/type/package checks относятся к финальным байтам, а installed evidence — к hash упакованного artifact, а не только к src.

После принятия среза идти к № 2, не запускать всю очередь одним непрозрачным batch.

## 6. Одинаковая поставка каждого пакета

1. Выбрать следующий готовый пункт; уточнить текущие source bytes, права и supported API. Сохранить existing work.
2. Реализовать smallest complete package и необходимый integration wiring. Для изменения Zero сначала назвать проблему, границы и проверку; Core не получает host/provider dependencies.
3. Выполнить relevant unit/type/build/native integration checks. Проверить отрицательные пути: auth/permission отказ, abort, duplicate registration, close/reload; выбрать применимые, не одинаковый фиктивный checklist для всех.
4. Упаковать реальный artifact с entry/types, notices и dependency closure. Проверить archive contents и отсутствие credentials/cache/session data. Установить opt-in в изолированный prefix, не `npm install -g` вместо приёмки.
5. Проверить поведение через установленную Zero-сборку. Для network/provider функций необходим отдельный разрешённый live smoke; отсутствие credentials, сервиса или бюджета обозначает BLOCKED, а не PASS по mock.
6. Зафиксировать в Cycle 9 evidence: donor identity/hash, package version, source hash, artifact SHA256, команды, passed/failed/unavailable checks, installed candidate и оставшиеся ограничения. Значимые изменения архитектуры/оркестрации проходят независимое milestone review, не отдельную команду QA на каждую мелочь.
7. После успешных source и installed-system checks — один scoped commit пакета с tests/docs/wiring; затем один push в согласованный remote/ref. Не использовать `git add .`, не включать foundation WIP, не force-push. Prerequisite seam при необходимости — отдельный осмысленный инфраструктурный commit, а не размазанный по всем пакетам.
8. Продолжить следующим готовым пакетом. Не откатывать весь рабочий checkout при неудаче: отключить только opt-in candidate. У каждого installed candidate практический rollback на предыдущий проверенный artifact; активные пользовательские сессии не мигрируют автоматически.

Согласованная git-форма: линейные commits `feat(search-history): ...`, `feat(mcp-guidance): ...` в существующий PR № 3, ветка `feat/zero-terminal-runtime`, remote `fork`. Один пакет — одна проверенная поставка, не отдельный репозиторий или новая migration branch. Foundation/session исправления сначала получают собственный проверенный commit; каждый следующий пакет не смешивается с ними.

## 7. Самопроверка плана и открытые пункты

Самопроверка, не независимое architecture approval:

- Полнота: все 31 имени сверяются с текущими donor directories; classic Pi extras вынесены в соседний список, не объявлены уже активными Durable extensions.
- Ранний работающий результат: search-history проходит Registry → native execution → installed package → terminal/reopen, а не останавливается на import.
- Сохранность: один Harness, существующие CodeMode/MCP и UI, никаких copies private internals; dirty source/target не замещаются HEAD.
- Распространение: unresolved grants выделены отдельно. Разрешение пользователя на push не очищает права донора; нельзя публично отправить такой код без разрешения или подходящей самостоятельной реализации.
- Не скрыты зависимости: assembly input для первого пакета; post-open lifecycle для поздних; credentials/network/live smoke для внешних; native authority для automation.

**Решение по доставке принято:** существующий PR № 3 (`Diffuzmetall/durable-zero:feat/zero-terminal-runtime`), отдельные протестированные commits. Повторный вопрос о remote/ref не нужен.

**Технические незакрытые пункты:** финал текущего foundation review; точный SDK compile/probe каждого пакета; post-open lifecycle; лицензии donor пакетов; actual live credentials/service readiness. Их можно исследовать по мере наступления соответствующего среза; это не общий запрос повторного разрешения на обычную реализацию.

## 8. Источники

- Workspace `AGENTS.md` — порядок, архитектурные границы, installed checks и preservation.
- `docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md` — прежняя миграция runtime/ports, не текущий порядок extension delivery.
- `docs/arch-improvement/cycle-8/current-system-and-extensions.md` — первоначальная классификация.
- `docs/arch-improvement/cycle-8/mcp-manager-and-pr3-review.md` и `README.md` — последний локальный foundation report; результаты здесь только процитированы.
- `/home/ubuntu/Projects/pi-durable-extensions/docs/extensions-inventory.md` — назначение, donor notices, legacy/global scope; package manifests и первые candidates сверены с текущим деревом.
- CodeGraph использован в donor repository для `createSearchHistory`, `createMcpGuidanceExtension`, `createContext7`, `createWebTools`; tool вернул текущий on-disk source выбранных symbols, не аттестацию свежести всего индекса. В Zero checkout `.codegraph` отсутствует; использована source navigation без создания/перестроения индекса.
