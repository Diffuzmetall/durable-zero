# Подготовительный отчет: Fix Round 3 Preparation, Устранение дефектов харнесса и TDD RED на R2

**Дата:** 2026-11-05  
**Статус:** Готовность к тестированию финального R3 артефакта / Устранены дефекты тестового харнесса / Получен валидный TDD RED на R2  
**Скоуп:** `docs/arch-improvement/cycle-7/live/task-1/independent-product-review/fix-round-3/`  
**Ревьюер:** Независимый продукт-ревьюер (Black-Box Synthetic Testing)  

---

## 1. Устранение замечаний к тестовому харнессу

В соответствии с замечаниями оркестратора полностью устранены 5 выявленных недостатков тестового окружения:

1. **Честная пропагация кода выхода при сбоях (Nonzero Exit Code Propagation):**
   - Полный отказ от самописных раннеров с маскировкой ошибок.
   - Тесты переведены на официальный нативный `node:test` (`test`, `assert`, `after`, `afterEach`). При падении любого assertion процесс Node гарантированно завершается с exit code `1`.
2. **Запрет самописного JUnit XML (Native node:test JUnit Reporter):**
   - Самописная генерация XML-строк исключена.
   - Отчеты генерируются нативным репортером Node.js через флаг `--test-reporter=junit --test-reporter-destination=...`, фиксируя реальные тайминги, точные стеки ошибок и реальные счетчики тестов.
3. **Глобальный трекинг процессов и гарантированная очистка дескрипторов (Leak-Proof Lifecycle):**
   - В модуле `durable-zero-client.mjs` реализован глобальный реестр `activeClients = new Set()`.
   - Каждый созданный клиент автоматически регистрируется при старте и дерегистрируется при выходе.
   - Хуки `afterEach` и `after` вызывают `await closeAllActiveClients()`, гарантированно закрывая stdin, readline и посылая `SIGTERM` с таймаутом и fallback на `SIGKILL` (<= 1500 ms). Любые утечки при сбоях в середине тестов исключены.
4. **Строгий allowlist переменных окружения (No Environment/Secret Leakage):**
   - Устранено наследование `...process.env`.
   - Функция `createIsolatedEnv(tempRoot)` формирует строго очищенное окружение:
     - `PATH`, `NODE_PATH`, `TMPDIR`
     - Изолированные дочерние папки: `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `PI_AGENT_DIR`, `GATE_DIR`
     - Никакие пользовательские токены, оригинальные конфиги MCP или переменные типа `PI_ADDITIONAL_EXTENSIONS` не наследуются дочерними процессами. Сентинелы содержат искусственные тестовые токены.
5. **Валидный TDD RED негативный контроль на R2 (Genuine Failing Test & Native JUnit):**
   - Создан целевой тест `r2-native-read-negative-control.test.mjs`.
   - Прогон через `node --test` завершился с exit code `1` и сгенерировал подлинный отчет `r2-negative-control.junit.xml` с падением assertion `toolResult.isError === false`.

---

## 2. Результаты валидного TDD RED на сохраненном артефакте R2

- **Команда исполнения:**
  ```bash
  node --test \
    --test-reporter=junit --test-reporter-destination=fix-round-3/r2-negative-control.junit.xml \
    --test-reporter=spec --test-reporter-destination=stdout \
    fix-round-3/r2-native-read-negative-control.test.mjs
  ```
- **Exit Code:** `1` (Command exited with code 1)
- **Результат прогона:**
  ```
  ✖ R2 Native Builtin Tool Execution Negative Control (should fail on R2 due to missing nativeEnv methods) (888ms)
    AssertionError [ERR_ASSERTION]: Native builtin read tool failed with error: "<harness>\n[error] env.absolutePath is not a function\n</harness>"
    true !== false
  ```
- **Сгенерированный нативный JUnit XML (`r2-negative-control.junit.xml`):**
  Зафиксирован отказ с типом `testCodeFailure`:
  `Native builtin read tool failed with error: "<harness>\n[error] env.absolutePath is not a function\n</harness>"`
- **Разделение свидетельств:**
  - `r2-negative-probe.log` — исторический лог первичной обсервационной пробы.
  - `r2-native-read-negative-control.test.mjs` + `r2-negative-control.junit.xml` — строгий валидный TDD RED с кодом выхода 1.

---

## 3. Готовность тестового пакета для финального кандидата R3

В директории `docs/arch-improvement/cycle-7/live/task-1/independent-product-review/fix-round-3/` подготовлены:
1. `durable-zero-client.mjs` — защищенный клиент с реестром `activeClients`, очисткой и `createIsolatedEnv`.
2. `fixtures/r3-provider-extension.mjs` — расширение модели со стримингом, барьером, abort и вызовом инструмента `read`.
3. `native-fix-round-3.test.mjs` — полный нативный тестовый сценарий `node:test` на **12 сценариев**:
   - 1.1 Cold startup handshake
   - 1.2 Multi-block reasoning+text streaming с барьером
   - 1.3 Second prompt in same process (generation-reset)
   - 2.1 SIGTERM clean shutdown
   - 2.2 Multi-process restart persistence
   - 2.3 Third prompt in restarted session
   - 3.1 -32700 Parse error
   - 3.2 -32601 Method not found
   - 3.3 Consumer SIGKILL pending rejection
   - 4.1 Ready-server stdin EOF clean exit (<= 5s)
   - 4.2 Active turn abort (`session/abort`) + prompt reuse
   - 5.1 Native builtin `read` execution on owned sentinel yielding actual content through Harness.

---

## 4. Текущий статус

**HOLD.** Все замечания оркестратора полностью устранены, TDD RED на R2 физически подтвержден нативным тестом (exit code 1).
Ожидаю сборки финального артефакта R3 и передачи его пути и SHA256 от билдера / оркестратора.
