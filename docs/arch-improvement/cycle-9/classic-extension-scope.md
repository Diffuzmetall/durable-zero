# Дополнительный контур: classic Pi ≠ native Durable

Источник: безопасно прочитаны только `packages`/`extensions` из `~/.pi/agent/settings.json`, имена entries `~/.pi/agent/extensions`, а также package manifests из `~/.pi/agent/npm/node_modules`. Secrets, MCP headers и session contents не выводились. Пакеты не запускались и не загружались для исследования.

Ниже **полный список package sources из текущей глобальной конфигурации**, а не перечень фактически активных расширений native Host. Один Pi package может поставлять несколько extensions, skills/themes или ноль активированных extensions. Для этих сторонних modules пока не выполнено чтение всех runtime APIs, поэтому точная сложность переноса и готовность **не установлены**. Пользователь уточнил цель: сохранить все нужные возможности текущего native Durable, не ограничиваясь 31 donor-каталогом. Поэтому каждый дополнительный источник нужно сопоставить с фактическим native owner; переписывать или включать все third-party пакеты только по записи в classic settings не требуется.

## Package sources

Версии в исходном spec сохраняют user pin, а не означают web/latest lookup. Названия без версии — текущие configured specs.

| Configured source | Предварительное решение / связь с native очередью |
| --- | --- |
| `npm:pi-agent-browser-native` | Сопоставить с `durable-browser`; не включать двух browser owners. |
| `npm:pi-updater` | Отдельный distribution/update contour; не давать обновлять Zero по правилам classic Pi. |
| `npm:pi-blackhole` | Отдельный audit API/поведения; пока не оценён. |
| `npm:@juicesharp/rpiv-ask-user-question` | В settings `extensions: []`; не активировать автоматически. Нужен реальный remote UI/dialogue contract. |
| `git:github.com/EveryInc/compound-engineering-plugin` | Skills/workflows отдельно от runtime extensions; не переписывать коллекцию skills в BuiltinExtension. |
| `npm:pi-add-dir` | Workspace/file authority и directory admission; не обходить existing execution policy. |
| `npm:@dreki-gg/pi-context7@0.2.0` | Capability покрывается native `context7`; выбрать одного owner. |
| `npm:pi-lens` | MCP/tool integration и explicit-analysis policy; не добавлять автоматические сканы. |
| `npm:pi-smart-fetch` | Сопоставить с `web-tools`; не регистрировать второй `web_fetch`. |
| `npm:pi-smart-web-search` | Сопоставить с `web-tools`; не дублировать search. |
| `npm:@wienerberliner/pi-markdown-reader` | Presentation/resource hook; проверить headless и terminal API отдельно. |
| `npm:@pi-kaush/pi-inline-skill-identifier@0.1.1` | Skill/prompt hooks; сначала сверить уже работающий loader. |
| `npm:context-mode@2.1.0` | MCP/tool authority и lifecycle; локальный manifest Elastic-2.0, права сверять отдельно от MIT-пакетов. |
| `npm:pi-antigravity` | Provider и tools; сопоставить с shim/operations, не создавать второй auth/provider owner. |
| `npm:@estebanforge/pi-codegraph-enhanced@1.0.6` | Graph/MCP/hooks; не создавать новые индексы автоматически ради миграции. |
| `npm:pine-of-glass@0.10.1` | Manifest содержит четыре UI extensions: contextimate/traceline/cachemire/meantime; нужна по-entry оценка, не один «готовый plugin». |
| `npm:@ff-labs/pi-fff` | В settings `extensions: []`; не включать автоматически. |
| `npm:@quandev104/pi-style` | UI/themes; theme exclusion `!themes/titanium.json` сохранить. Сопоставить с preserved tool cards. |
| `npm:pi-subagents` | Classic child runtime не переносить поверх native children; использовать capability comparison. |
| `npm:@dietrichgebert/ponytail@5.3.2` | History integration; сравнить с native `search-history`, отдельно изучить дополнительные capabilities. |
| `npm:@nicknisi/pi-model-switch` | Model/config/UI boundary; native model selection owner не заменять. |
| `npm:@hk_net/pi-timestamp` | Potential small prompt hook, но API ещё не исследован; локальный manifest EUPL-1.2. |
| `npm:@andrewjacop/pi-herdr` | Host adapter, не универсальный runtime plugin; Herdr здесь не запускается. |
| `npm:@99percentpeople/pi-codex-api` | Сопоставить с native `codex-api`, не дублировать OAuth/tools. |
| `npm:pi-intercom` | Coordination transport; не ставить второй delivery/admission layer автоматически. |
| `vendor/pi-until` | Локальный vendor source; source closure и права ещё не исследованы, не объявлять portable. |
| `npm:pi-goal-x` | В settings `extensions: []`; не включать второй Goal owner. |
| `npm:@juicesharp/rpiv-todo` | Task/UI semantics; сначала сопоставить с existing native task/activity model. |
| `npm:pi-multi-account@1.24.0` | Credential/provider boundary; no automatic account migration. |
| `npm:pi-agents@0.29.0` | Native child authority важнее повторения classic spawning; Apache-2.0 manifest не означает API compatibility. |
| `npm:specpi-lancet-guard@0.6.1` | Нужна отдельная оценка guard hooks и фактической execution boundary. |

## Explicit extension paths

Это конфигурация discoverability/исключений, не доказательство загрузки в native Durable:

- `~/.pi/agent/extensions/tool-schema-bounds-guard.ts`: provider payload/schema boundary; не выдавать tool-call patch за provider enforcement.
- `~/Projects/pi-above-harness/.pi/extensions/rpiv-herdr-blocked-bridge/index.ts`: classic Herdr bridge, отдельная host dependency.
- `~/Projects/pi-above-harness/.pi/extensions/agent-mail-identity-bridge/index.ts`: сверить с native identity, не второй authority owner.
- `~/.pi/agent/extensions/pi-algorithm-v8-v8202/index.ts`: отдельная LifeOS/Algorithm integration; не объявлять перенесённой наличием skills.
- `~/.pi/agent/extensions/antigravity-proxy.ts`: старое process-global transport glue не переносить monkey-patching-ом.
- `~/.hindsight/coding-agents/dist/pi.js`: classic coding-agent memory plugin не равен native Durable memory lifecycle.
- Явные исключения с `-` в settings: `herdr-agent-state.ts`, `ubs-stop.ts`, `dcg.ts`, `mu.ts`. Это не задача включить их обратно. UBS остаётся выключен по инструкции владельца; native DCG и classic `dcg.ts` различаются.

## Автообнаруживаемые local entries и архив

Filesystem содержит также `_archived`, `bb-thread-provider`, `context7` config/cache, `minimal-footer.ts`, disabled Google/Herdr/Mesh/Moshi/Orca entries, codex image install metadata, `pi-tool-display.disabled`, `subagent` config/backup и `you-should-know`. Их предыдущий подробный разбор находится в `/home/ubuntu/Projects/pi-durable-extensions/docs/extensions-inventory.md`, раздел Legacy/global extension sources. Названия текущих top-level entries сопоставлены с этим документом; повторная ревизия всех архивных файлов не выполнялась.

Archives, cache и metadata не становятся самостоятельными пакетами переноса. Для `you-should-know` отдельно учитывать передачу transcript стороннему AI и стоимость; никакой автоматической активации. BB, Herdr, Mu и другие runtime/host integrations не добавлять в первый terminal этап под видом «обычного extension».

## Что считается закрытием scope

Для нашей native коллекции canonical порядок — [основной план](extension-migration-plan.md). Для каждого additional classic source до включения нужен один из явных исходов: capability уже покрывается native owner; ordinary Pi extension действительно работает на поддерживаемых API; нужен отдельный adapter; intentionally disabled/legacy; blocked правами/host interface. Наличие npm manifest — только вход в такую проверку, не итог адаптации.
