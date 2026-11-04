# Продуктовое повторное ревью [S9b: Product Verify Gate — Round 1]

**Объект ревью:** Кандидатный пакет `@durable-zero/protocol` (fix round 1, commit `f3fff38a84154a36f017514c234421aef5215ced`, artifact SHA256 `24e9a99fb89f6383390c19998d3df1e50b0fb05a244b7d627e08f260105e1514`).  
**Режим проверки:** Black-box верификация внешнего потребителя поверх публичных экспортов (`StdioJsonRpcServer`, `JsonRpcMethodNotFoundError`, `jsonRpcResponseSchema`) в изолированном каталоге `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-package-fix-r1`. Исходный код и diff не инспектировались. Исходный пакет `protocol-package` оставлен нетронутым.

## 1. Targeted Finding Verification

### [P2] PROD-FND-001: Generic Error with `.name = 'JsonRpcMethodNotFoundError'` misclassification
- **Status:** **ADDRESSED**
- **Action:** Обработчик потребителя выбрасывает обычный `Error` с модифицированным свойством `.name`:
  `const err = new Error("backend fault"); err.name = "JsonRpcMethodNotFoundError"; throw err;`
- **Expectation:** Ошибка классифицируется как `-32603` (Internal Error), а не `-32601` (Method Not Found).
- **Reality:** Сервер вернул `{"jsonrpc":"2.0","id":"err-generic-named","error":{"code":-32603,"message":"backend fault"}}`.
- **Typed & Subclass Check:**
  - Прямой вызов `throw new JsonRpcMethodNotFoundError("method")` -> возвращает `-32601` (`Method not found: method`).
  - Вызов `throw new SubclassMethodNotFound("method")` (наследник класса) -> возвращает `-32601` (`Method not found: method`).
  - Обычный `throw new Error("msg")` -> возвращает `-32603` (`msg`).

## 2. Executed User Journeys (Regression Suite)

1. **Happy Path:**  
   `node --test protocol-package-fix-r1/test-suite.mjs` (Journey 1) -> **PASS**
   - Запросы с wire ID `0` (число) и `""` (пустая строка) сохраняют тип и значение идентификатора.
   - Уведомление (`notify_increment`) инкрементирует счетчик с 0 до 33 при абсолютной тишине в stdout (0 байт ответа).
   - Исходящий обратный запрос (`server.request`) корректно генерирует wire ID, получает ответ родителя и возвращает usable result (`kernelVersion: "6.1.0"`).
   - Falsy-значения (`0`, `false`, `""`, `null`) и void (`undefined` -> `null`) корректно возвращаются и проходят схему `jsonRpcResponseSchema`.

2. **Empty / Cold-Start:**  
   `node --test protocol-package-fix-r1/test-suite.mjs` (Journey 2) -> **PASS**
   - Свежий процесс потребителя стартует с нулевым состоянием (`counter: 0, logsCount: 0`) без предварительных файлов или окружения.
   - Завершение работы прерывает зависший обратный запрос с ошибкой `"Server stopped"` и завершает процесс с кодом `0`.

3. **Error Recovery & Adversarial:**  
   `node --test protocol-package-fix-r1/test-suite.mjs` (Journey 3) -> **PASS**
   - Несуществующий метод -> `-32601`.
   - Настоящий `JsonRpcMethodNotFoundError` и его подклассы -> `-32601`.
   - Обычный `Error` и `Error` с измененным `.name` -> `-32603`.
   - Невалидный запрос (отсутствие метода, неверный `jsonrpc`) -> `-32600`.
   - Поврежденный JSON -> `-32700` с `id: null`.
   - Уведомления с ошибками не выводят ответов и не нарушают работу последующих запросов.
   - `jsonRpcResponseSchema` отклоняет ответы с обоими полями или без полей `result`/`error`.
   - Поврежденный ответ на reverse request отклоняется немедленно (<1мс).
   - Таймаут обратного вызова очищает ресурсы и завершается с ошибкой.
   - Запоздалые и неожиданные ответы не приводят к эхо/рефлексии.

## 3. Product Verification Matrix

- Primary Journey Complete: YES
- Feedback & Error Clarity: YES (типизированные и общие ошибки строго разделены)
- Clean State & Clean Exit: YES (код завершения 0, отсутствие зависших подпроцессов)
- Open Blocking Findings (P0-P2): 0
- Residual User Risk: None в рамках скоупа Task 4A.

## Итоговый вердикт

VERDICT: PASS
