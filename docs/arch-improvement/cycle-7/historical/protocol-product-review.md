# Продуктовое ревью [S9b: Product Verify Gate]

**Объект ревью:** Кандидатный пакет `@durable-zero/protocol` (commit `ad122ffc9a7bf63c73a516d19fb07afcabeb7781`, sha256 `a4eafbd7365b261f6645442a4646b5c01fc9192ce056f8f479087b7e0573578f`).  
**Режим проверки:** Black-box верификация внешнего потребителя поверх публичных экспортов (`StdioJsonRpcServer`, `JsonRpcMethodNotFoundError`, `jsonRpcResponseSchema`) без инспекции исходного кода и git diff.

## 1. Executed User Journeys

1. **Happy Path:**  
   `node --test /Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-package/test-suite.mjs` (тесты Journey 1) и `node generate-journey-artifacts.mjs` -> **PASS**
   - Запросы с wire ID `0` (число) и `""` (пустая строка) корректно сохраняют тип и значение идентификатора.
   - Уведомления (`notify_increment`) изменяют внутреннее состояние потребителя (`counter: 0 -> 33`), сохраняя абсолютную тишину в потоке stdout (0 байт ответа).
   - Исходящий обратный запрос (`server.request`) корректно генерирует wire ID, получает ответ от родителя и возвращает usable result в исходный запрос.
   - Falsy-значения (`0`, `false`, `""`, `null`) и void (`undefined` -> `null`) успешно транслируются и валидируются `jsonRpcResponseSchema`.

2. **Empty / Cold-Start:**  
   `node --test /Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-package/test-suite.mjs` (тесты Journey 2) -> **PASS**
   - Чистый процесс Node без предварительного хранилища и сессионного контекста мгновенно готов к обработке входящих RPC-запросов (`counter: 0`, `logsCount: 0`).
   - Завершение работы (`server.close()` / `server.stop()`) немедленно прерывает зависшие исходящие запросы с понятной ошибкой `"Server stopped"` и завершает процесс с кодом `0`.

3. **Error Recovery & Adversarial:**  
   `node --test /Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-package/test-suite.mjs` (тесты Journey 3) -> **FAIL**
   - Несуществующий метод возвращает `-32601` (`Method not found`).
   - Метод с явным `throw new JsonRpcMethodNotFoundError()` возвращает `-32601`.
   - Невалидный запрос возвращает `-32600` (`Invalid Request`).
   - Некорректный JSON возвращает `-32700` (`Parse error`) с `id: null`.
   - Уведомления с исключениями (`notify_throw_generic`, `notify_throw_not_found`) не генерируют ответов, не роняют сервер и не блокируют последующие запросы.
   - `jsonRpcResponseSchema` строго отклоняет ответы, содержащие одновременно `result` и `error` либо не содержащие ни одного из них.
   - Поврежденный ответ на reverse request отклоняется немедленно (<2мс) без ожидания таймаута; таймаут корректно очищает таймеры.
   - Неожиданные (unsolicited) и запоздалые (late) ответы игнорируются без рефлексии и падений.
   - **Дефект:** Обычный `Error` с переопределенным свойством `.name = 'JsonRpcMethodNotFoundError'` ошибочно классифицируется как `-32601` вместо `-32603`.

## 2. Findings

- [P2] Generic Error with matching name property misclassified as -32601 Method Not Found instead of -32603 Internal Error
  - Journey: Error Recovery
  - Action: Обработчик потребителя выбрасывает обычную ошибку: `const err = new Error("backend fault"); err.name = "JsonRpcMethodNotFoundError"; throw err;`
  - Expectation: Сервер должен строго дифференцировать объявленный типизированный инвариант ошибки (`instanceof JsonRpcMethodNotFoundError` или уникальный символ/бренд) от обычных внутренних сбоев, возвращая код `-32603` (Internal Error) для нетипизированных исключений.
  - Reality: Сервер проверяет совпадение по строковому имени (`err.name === 'JsonRpcMethodNotFoundError'`), в результате чего ошибка бэкенда возвращается клиенту как протокольная ошибка отсутствия метода `{"code": -32601, "message": "backend fault"}`.
  - Fix decision: fix-now
  - Rule: AP-022 (Typed errors и явная обработка исключений)

## 3. Product Verification

- Primary Journey Complete: YES (Happy Path и Cold Start функционально завершены)
- Feedback & Error Clarity: NO (сбой бэкенда маскируется под отсутствие метода RPC из-за поверхностной проверки `.name`)
- Clean State & Clean Exit: YES (чистый выход с кодом 0, отсутствие утечек процессов)
- Residual User Risk: Ошибочная диагностика вызывающей стороной — клиент решит, что метод не зарегистрирован, вместо обработки внутренней ошибки обработчика.

## Итоговый вердикт

VERDICT: FAIL
