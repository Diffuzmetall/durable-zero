# Подготовительный отчет: Fix Round 3 Preparation, Устранение дефектов харнесса, Защита оракулов и TDD RED на R2

**Дата:** 2026-11-05  
**Статус:** Готовность к тестированию финального R3 артефакта / Исправлена регрессия оракула одного процесса / Зафиксирован TDD RED на R2  
**Скоуп:** `docs/arch-improvement/cycle-7/live/task-1/independent-product-review/fix-round-3/`  
**Ревьюер:** Независимый продукт-ревьюер (Black-Box Synthetic Testing)  

---

## 1. Исправление критической регрессии тестового оракула (Causally Linked Single-Process Journeys)

По замечанию оркестратора устранена регрессия изоляции между зависимыми шагами:

- **Journey 1 (Единый процесс от холодного старта до 2 ходов):**
  - Шаги 1.1 (рукопожатие готовности), 1.2 (первый промпт со стриминг-барьером) и 1.3 (второй промпт с общим префиксом для проверки сброса генератора) объединены в **единый причинно-следственный тест** `Journey 1`.
  - Все три шага выполняются строго в рамках **одного экземпляра клиента (PID 1)**.
  - Внедрена прямая проверка сохранения идентификатора процесса: `assert.strictEqual(client.child.pid, pid)` и `assert.strictEqual(client.isExited, false)`.
  - Проверено отсутствие паразитного переиспользования дельт и корректность очистки состояния генератора между ходами в одном живом процессе.
  - Очистка процесса выполняется строго в `t.after` по завершении всего сценария Journey 1.
- **Journey 2 (Многопроцессный рестарт и 3-й ход в том же рестартованном процессе):**
  - Фаза A: засев двух ходов в Клиенте A, фиксация ID и текстов, чистый выход SIGTERM с кодом 0.
  - Фаза B: рестарт во ВТОРОМ процессе (Клиент B) с тем же `--session`. Проверка отличия PID: `assert.notStrictEqual(pidB, pidA)`.
  - Проверка неизменности исторических записей из SQLite (100% идентичные строковые ID и тексты).
  - Третий промпт отправляется **В ТОТ ЖЕ САМЫЙ РЕСТАРТОВАННЫЙ ПРОЦЕСС (Клиент B)** с проверкой `assert.strictEqual(clientB.child.pid, pidB)`.
  - Очистка Клиента B выполняется в `t.after` в конце Journey 2.
- **Политика хуков `afterEach`:**
  - Хук `afterEach(closeAllActiveClients)` отрабатывает строго между верхнеуровневыми сценариями (Journeys), исключая разрыв связи между шагами внутри одного сценария.

---

## 2. Устранение замечаний к харнессу

1. **Честная пропагация exit code 1:**
   - Полный переход на нативный `node:test` (`test`, `assert`). При падении любого assertion раннер Node гарантированно завершается с кодом `1`.
2. **Исключение самописного JUnit XML:**
   - Формирование отчетов делегировано нативному C++/runtime репортеру Node.js (`--test-reporter=junit`). Счетчики тестов и тайминги выводятся динамически из рантайма, а не зашиваются константой.
3. **Глобальный трекинг процессов (Leak-Proof):**
   - В `durable-zero-client.mjs` реализован реестр `activeClients = new Set()`.
   - При завершении тестов или аварийном выходе (`process.on('exit')`) все процессы надежно завершаются (`SIGTERM` -> `SIGKILL` через 1.5 с) с закрытием stdin и readline.
4. **Строгий allowlist переменных окружения:**
   - `createIsolatedEnv(tempRoot)` исключает наследование `...process.env`.
   - Дочерний процесс получает только `PATH`, `NODE_PATH`, `TMPDIR` и выделенные папки `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `PI_AGENT_DIR`, `GATE_DIR`. Никаких секретов или внешних настроек MCP не передается.
5. **Валидный TDD RED на R2 (Genuine Failing Test & Native JUnit):**
   - Одиночный тест `r2-native-read-negative-control.test.mjs` выполнен на артефакте R2 через `node --test`.
   - Зафиксирован реальный отказ assertion `toolResult.isError === false` (`[error] env.absolutePath is not a function`).
   - Нативным репортером сформирован файл `r2-negative-control.junit.xml` с тегом `<failure>` и exit code `1`.
   - Первичный лог обсервационной пробы сохранен отдельно в `r2-negative-probe.log` без искажения истории.

---

## 3. Готовность тестового пакета для финального кандидата R3

В директории `docs/arch-improvement/cycle-7/live/task-1/independent-product-review/fix-round-3/`:
- `durable-zero-client.mjs` — защищенный клиент с реестром `activeClients`, очисткой и `createIsolatedEnv`.
- `fixtures/r3-provider-extension.mjs` — расширение модели (стриминг, барьер, abort и честный запуск инструмента `read`).
- `native-fix-round-3.test.mjs` — нативный тест `node:test` на 5 сквозных сценариев (все причинно-следственные связи сохранены):
  - **Journey 1:** Cold start handshake + Multi-block streaming с барьером + Same-PID sequential prompt (generation-reset).
  - **Journey 2:** Multi-process restart persistence (Phase A) + Resumed verification + Third prompt in same restarted PID (Phase B).
  - **Journey 3 (3.1–3.3):** -32700 Parse error, -32601 Method not found, consumer SIGKILL pending rejection.
  - **Journey 4 (4.1–4.2):** Stdin EOF clean exit <= 5s, active turn abort (`session/abort`) + prompt recovery.
  - **Journey 5 (5.1):** Native builtin `read` execution on owned sentinel yielding actual content through Harness.
- `r2-native-read-negative-control.test.mjs` + `r2-negative-control.junit.xml` — подлинный TDD RED негативный контроль на R2 (exit code 1).
- `r2-negative-probe.log` — исторический лог первичной обсервационной пробы.

---

## 4. Текущий статус

**HOLD.** Регрессия оракула полностью исправлена (Journey 1 и Journey 2 объединены в честные непрерывные процессы). TDD RED на R2 подтвержден нативным тестом (exit code 1).
Ожидаю сборки финального артефакта R3 и передачи его пути и SHA256 от билдера / оркестратора.
