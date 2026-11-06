# Как устроена терминальная сборка Durable на Zero

Документ для разработчика, который впервые открывает этот репозиторий. Здесь описаны границы пакетов, запуск, проверка и состав будущего pull request (PR). Это не инструкция по замене основного сервиса.

## 1. Что работает сейчас, а что ещё не переключено

Есть две отдельные установки:

- **Основная команда Pi Durable** пока использует прежний Host. Его сервисы, конфигурация и пользовательские сессии не заменены.
- **Новый изолированный кандидат** использует Zero и native Pi Durable Harness. Runtime, терминальный клиент и интерфейс разделены на три workspace-пакета. Проверки конкретного кандидата приведены в [отчёте о навыках](capability-followup.md).

Открытая ранее тестовая вкладка Rex остаётся на прежнем кандидате. Новая установка сама по себе не обновляет уже запущенный процесс.

**Входит в этот этап:** терминальный ввод, streaming, native-инструменты, abort, история, отключение/подключение и навыки. **Отложено:** Attention/supervisor, Goal, schedules, перенос коллекции расширений, BB и iii. Отключённые дополнительные панели скрыты; настоящие ошибки runtime остаются видимыми.

## 2. Путь запроса

```text
Пользователь
    │ клавиатура / редактор / выбор навыка
    ▼
@local-durable/terminal-ui       интерфейс, оформление, карточки
    │ публичные view/controller-контракты
    ▼
@local-durable/terminal          RPC-клиент, снимки, адресация команд
    │ JSON-RPC через приватный Unix-сокет
    ▼
@local-durable/runtime           процесс-хост, lease, соединения
    │ assembleDurableZero() — штатная композиция Zero
    ▼
@durable-zero/runner             связывает реализации портов
    ├── Core / coordinator / execution / resource loader
    └── @durable-zero/adapter-pi-durable
            └── один native Harness на открытую сессию
                    ├── модель и native tools
                    └── native SQLite storage
```

Терминал не владеет Harness, модельным циклом или базой сессии. Runtime не зависит от терминального рендерера. Закрытие терминала разрывает соединение, но не вызывает закрытие Harness; завершение процесса runtime — отдельное действие.

### `packages/local-runtime` — хост процесса

Package name: `@local-durable/runtime`. Команда: `pi-zero-runtime`.

- `src/main.ts` разбирает CLI и обрабатывает завершение процесса.
- `src/index.ts` запускает `assembleDurableZero()`, управляет socket endpoint и подключёнными клиентами.
- `src/client.ts` содержит низкоуровневый клиент соединения.
- `src/notifications.ts` ограничивает выходные очереди и сохраняет причинный порядок сообщений.
- `src/skills.ts` раскрывает явные команды навыков до native admission.

У каждой сессии свой endpoint: `<session-dir>/.terminal/runtime.sock`, режим `0600`. Lease и проверка занятого endpoint не позволяют второму процессу открыть того же владельца сессии. Удаление старого сокета допускается только после проверки, что endpoint не обслуживается.

Это локальная граница доступа через файловую систему, а не удалённый HTTP-сервис с авторизацией. Не выставляйте сокет в сеть.

### `packages/local-terminal` — клиент

Package name: `@local-durable/terminal`. Команды: `pi-zero-terminal`, `pi-zero-terminal-probe`.

`src/client.ts` переводит RPC в публичные интерфейсы UI. Он проверяет envelope, ревизии и выбранную conversation; устаревший снимок не заменяет новый. Потеря соединения помечает представление offline и блокирует команды без повторной отправки.

`src/main.ts` выбирает rich UI для настоящего TTY. Для pipe или явного `--probe` используется диагностический readline-клиент. Probe не заменяет основной интерфейс.

### `packages/terminal-ui` — представление

Package name: `@local-durable/terminal-ui`. Публичный вход — `src/index.js`, типы — `src/index.d.ts`.

`vendor/` сохраняет установленный редактор, layout, темы, model picker и карточки инструментов. Адаптация находится на границе подключения к новому клиенту. Этот пакет не открывает native-сессии.

`NOTICE.md` и `PROVENANCE.json` фиксируют происхождение, лицензии и допустимые изменения 49 presentation-файлов. `scripts/check-artifact.mjs` проверяет публичный вход и хеши. Изменение vendor-файла требует осмысленного adaptation record и нового хеша, а не отключения проверки.

## 3. Протокол и восстановление

Начальный `session/getView` и уведомления `session/view` передают `{ revision, view, resources }`. `view` остаётся native-представлением; каталог навыков и настройка команд находятся в `resources`, а не подмешиваются в native DTO.

Команды передаются с их native-смыслом: `session/prompt`, `session/abort`, `session/getTranscript`, выбор модели и conversation. Полный текущий список и схемы входных данных находятся в `requests` в `local-runtime/src/index.ts`.

Успешный admission receipt означает принятие запроса, а не завершение работы. Streaming и persisted transcript подтверждают разные стадии. После подключения клиент читает состояние и историю; старый prompt не посылается заново.

Выходной transport использует общую причинную FIFO-очередь и backpressure. Обычный pending budget — 8 MiB; отдельные oversized slots ограничены четырьмя кадрами. Промежуточные снимки view можно объединять. Нельзя переупорядочивать ответы и события ради обхода ограничения памяти.

## 4. Как работают навыки

1. Штатный resource loader Zero находит навыки. Read-only `instance.resources` отдаёт **тот же** каталог и настройку `getEnableSkillCommands()`; второго loader нет.
2. Runtime передаёт клиенту `name`, `description`, `filePath`, `baseDir` и флаг команд.
3. Picker вставляет `/skill:имя ` в редактор. Выбор **не отправляет** запрос.
4. Обычный Enter отправляет явную команду; Alt+Enter использует `followUp`.
5. Runtime ищет имя в своём каталоге, читает соответствующий файл, убирает frontmatter через публичный `stripFrontmatter`, добавляет skill block и сохраняет аргументы.
6. Раскрытый текст поступает через обычный bridge в native admission. Ошибка чтения или неизвестное имя возвращают RPC error до admission; редактор восстанавливает ввод.

Раскрытие находится на общем входе `session/prompt`, до выбора root/child маршрута. Native-адресация остаётся у engine/controller. Отдельного второго выполнения навыка в UI нет.

Это явно принадлежащий приложению preprocessing, а не вызов приватного SDK `_expandSkillCommand`. Текущее поведение намеренно строже SDK: неизвестный навык не превращается в обычный текстовый prompt.

Hot reload ресурсов через терминальный `/reload` пока не поддерживается. Не считайте появление файла на диске доказательством обновления каталога уже работающего процесса.

## 5. Изменения внутри Zero

Наши host-specific реализации находятся в трёх новых пакетах. Существующие файлы Zero меняются только для конкретных границ и исправлений:

| Место | Зачем |
| --- | --- |
| `packages/runner/src/composition.ts` | Экспортировать native view/controller и read-only доступ к уже созданным resources |
| `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts` | Открыть native-порты, сохранить штатного владельца Harness |
| `runtime-controller.ts`, `runtime-types.ts` | Адресация и проверка выбранной conversation на границе выполнения |
| `bridge/watch-events-compat.ts` | Доставить подтверждённые финальные сообщения в terminal event stream |

Regression-тесты лежат рядом с adapter и в новых пакетах. Эти изменения нельзя заменять копией внутренних файлов Zero в `local-runtime` или monkey-patching.

## 6. Собрать и проверить кандидат

Для локальных пакетов нужен **Node.js 24.19+**: сборка использует target `node24`, тесты запускают TypeScript напрямую. Проверенное окружение: Node `24.19.0`, pnpm `11.25.0`, Linux/Unix-сокеты. Для rich-acceptance нужен `tmux`.

Зависимости должны быть установлены по `pnpm-lock.yaml`. В этом checkout `pnpm-workspace.yaml` ещё содержит незаданные решения для install scripts `@google/genai` и `protobufjs`. Перед установкой на новой машине задайте их явно; проверенный deployment запрещал оба скрипта и сохранял разрешение для esbuild. Не разрешайте все dependency scripts автоматически.

Для такого же ограниченного выбора измените только соответствующие значения в блоке `allowBuilds`, не заменяя остальные workspace-настройки:

```yaml
allowBuilds:
  '@google/genai': false
  esbuild: true
  protobufjs: false
```

Затем установите зависимости: `pnpm install --frozen-lockfile`. Эта инструкция для новой машины; текущая source-конфигурация в рамках follow-up не изменялась.

На этой машине Corepack wrapper неисправен. Вместо глобального `pnpm` можно использовать:

```sh
node /home/ubuntu/.cache/node/corepack/pnpm/11.25.0/bin/pnpm.cjs --version
```

Сборка из подготовленного checkout:

```sh
# В корне репозитория. Путь должен быть новым и вне checkout.
CANDIDATE=/tmp/pi-zero-my-candidate
node packages/local-runtime/scripts/build-candidate.mjs "$CANDIDATE"

cd "$CANDIDATE"
node --test --test-timeout=40000 \
  packages/local-runtime/test/*.test.ts \
  packages/local-terminal/test/*.test.ts \
  packages/terminal-ui/test/*.test.mjs \
  packages/adapter-pi-durable/test/controller-targeting.test.ts \
  packages/adapter-pi-durable/test/watch-events-compat.test.ts
```

Build script копирует исходники без старых `dist` и `node_modules`, собирает Zero и оба executable-пакета, проверяет UI provenance и выполняет production typecheck. Source `dist` не перезаписываются. **Этот build candidate ещё ссылается на зависимости checkout и не считается самостоятельной установкой.**

Корневой `pnpm build` собирает базовые Zero-пакеты, но не всю локальную терминальную сборку. Корневой `pnpm test` не включает `.mjs` UI-тесты. Для этого этапа используйте команды выше.

### Запуск без переключения основной установки

В отдельном процессе запустите runtime; не привязывайте его жизненный цикл к окну UI:

```sh
node "$CANDIDATE/packages/local-runtime/bin/runtime.mjs" \
  --session-dir /tmp/pi-zero-example-session \
  --cwd /path/to/test-workspace \
  --provider PROVIDER --model MODEL
```

В другом терминале:

```sh
node "$CANDIDATE/packages/local-terminal/bin/terminal.mjs" \
  --session-dir /tmp/pi-zero-example-session
```

`PROVIDER`, `MODEL` и workspace нужно заменить своими значениями. Для offline-теста добавьте runtime `--extension "$CANDIDATE/packages/local-runtime/test/fixtures/provider.ts" --provider local-test --model scripted`. Fixture заменяет ответы модели, но не Harness, SQLite и Bash.

`/detach` закрывает только клиент. Повторите команду терминала для подключения к той же сессии. SIGTERM адресуйте runtime только когда действительно хотите остановить владельца сессии.

## 7. Получить самостоятельную установленную сборку

Установка идёт в **новый** prefix, не поверх текущей установки. В скопированном candidate-only `pnpm-workspace.yaml` задайте `@google/genai: false` и `protobufjs: false`, оставив esbuild разрешённым.

```sh
cd "$CANDIDATE"
PREFIX="$HOME/.local/share/pi-durable-zero/candidates/my-candidate"
pnpm --store-dir "$HOME/.local/share/pnpm/store" \
  --filter @local-durable/terminal deploy --legacy --prod --offline "$PREFIX"
```

Здесь `pnpm` — проверенный CLI; на этой машине замените его командой `node …/pnpm.cjs`, указанной выше. `--offline` требует уже заполненный store.

У pnpm 11 legacy deploy воспроизведена одна внешняя self-link. Проверьте `readlink "$PREFIX/node_modules/.pnpm/node_modules/@local-durable/terminal"`. Только если она указывает на исходный candidate, замените **эту созданную deployment-ссылку**:

```sh
ln -sfn ../../../.. "$PREFIX/node_modules/.pnpm/node_modules/@local-durable/terminal"
cp "$CANDIDATE/LICENSE" "$PREFIX/LICENSE.Zero"
```

После этого проверьте все symlink: каждый target должен существовать и разрешаться внутри prefix. Сравните хеши установленных entrypoints с candidate и проверьте UI provenance. Одного успешного `deploy` недостаточно.

Установленные entrypoints:

```sh
node "$PREFIX/node_modules/@local-durable/runtime/bin/runtime.mjs" --help
node "$PREFIX/bin/terminal.mjs" --help
```

Offline installed-acceptance использует [проверочный Python-скрипт](evidence/capabilities-installed-check.py). Скопируйте provider fixture в `$PREFIX/node_modules/@local-durable/runtime/test-fixtures/provider.ts`, чтобы он разрешал SDK из установленного пакета, затем:

```sh
python3 /path/to/checkout/docs/arch-improvement/cycle-8/evidence/capabilities-installed-check.py \
  "$PREFIX" "$PREFIX/node_modules/@local-durable/runtime/test-fixtures/provider.ts"
```

Перед запуском убедитесь, что prefix и fixture — ваш проверяемый кандидат, а не основная установка. Скрипт создаёт отдельный tmux socket, временные workspace/home/session и останавливает только собственные процессы. Он сохраняет результаты и экраны в напечатанном каталоге `EVIDENCE`. Это не обновляет открытую вкладку Rex и не меняет основную команду.

## 8. Как оформить PR

Отдельный репозиторий не нужен. Три пакета входят в этот workspace; pnpm deploy переносит их транзитивные runtime-зависимости. Публикация в npm не требуется.

Сохраните в одном интеграционном PR:

- `packages/local-runtime/`, `packages/local-terminal/`, `packages/terminal-ui/` — исходники, manifests, build/check scripts и тесты;
- ограниченные изменения runner/adapter и их regression-тесты;
- scoped изменения `pnpm-lock.yaml` и необходимые workspace-настройки;
- `NOTICE.md`, `PROVENANCE.json`, vendored лицензии и объяснение adaptation;
- этот документ, [follow-up](capability-followup.md), индекс и обезличенные доказательства проверок.

В описании PR укажите проблему, границы трёх пакетов, причины каждого изменения Zero, команды проверок, tested candidate и известные ограничения. Разделите source checks, installed-artifact checks и человеческую приёмку.

**Не добавляйте автоматически:** `AGENTS.md` с чужими изменениями, `.codegraph/`, `node_modules`, временные candidates, `.pi` с личными настройками, SQLite-сессии, sockets, credentials и сырые приватные логи. Проверьте untracked-файлы: `git diff --stat` их не показывает. Не используйте `git add .` для такого checkout.

Commit/push/создание PR — отдельный согласованный шаг. До глобального переключения нужны идентификация кандидата, список заменяемых команд/сервисов и план отката. Старые пользовательские сессии не мигрируют автоматически.

## 9. Где искать проблему

| Симптом | Первая проверка |
| --- | --- |
| Терминал не подключается | Runtime готов? Совпадает `--session-dir`? Не осталась ли живая lease? |
| Навыков нет | Каталог `resources.skills`, workspace runtime, настройки resource loader |
| `/skill:…` вернул ошибку | Имя есть в серверном каталоге? Файл читается? Ввод должен остаться в редакторе |
| Исчезла активная работа | Завершён только UI или ещё и runtime? SQLite-история не доказывает продолжение исполнения |
| После deploy нужен checkout | Внешние symlink, особенно legacy self-link; не объявляйте установку самостоятельной |
| Вкладка показывает старые предупреждения | Какой prefix запустил именно этот процесс? Новая установка не заменяет живой процесс |

Обновляйте этот документ при изменении протокола, SDK, package entrypoints, сборки или набора поддерживаемых возможностей.
