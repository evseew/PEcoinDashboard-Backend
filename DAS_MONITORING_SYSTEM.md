# 🚀 Автоматическая система мониторинга DAS индексации

## 📋 Решение проблемы #3
**Проблема:** Отсутствие DAS API интеграции для проверки индексации compressed NFT

**Решение:** Полнофункциональная система автоматического мониторинга с background jobs и webhook уведомлениями

---

## 🏗️ Архитектура решения

### 1. **IndexingMonitorService** - Основной мониторинг
```javascript
// Автоматическое отслеживание DAS индексации
- startMonitoring() - запуск мониторинга операции
- checkDASIndexing() - проверка статуса в DAS API  
- Background jobs - автоматические проверки каждые 30 сек
- Event-driven уведомления
```

### 2. **WebhookNotifierService** - Уведомления
```javascript
// Система webhook уведомлений
- registerWebhook() - регистрация endpoints
- notifyEvent() - отправка уведомлений
- HMAC подпись для безопасности
- Retry логика с экспоненциальным back-off
```

### 3. **API Endpoints** - Управление
```javascript
// REST API для управления мониторингом
GET /api/mint/monitoring/stats
GET /api/mint/monitoring/active
POST /api/mint/webhooks
DELETE /api/mint/webhooks/:id
```

---

## 🔄 Процесс работы

### Автоматический процесс:
```
1. Минт NFT ✅
2. Автоматический запуск мониторинга 🚀
3. Background проверки каждые 30 сек 🔄
4. DAS API проверки (с retry) 🔍
5. Webhook уведомления при изменениях 📡
6. Автоматическая остановка при индексации ✅
```

### Timeline индексации:
- **0-30 секунд**: Блокчейн подтверждение
- **30 секунд - 5 минут**: Быстрая DAS индексация  
- **5-20 минут**: Полная индексация + Phantom готовность
- **20+ минут**: Таймаут (но NFT может появиться позже)

---

## 🛠️ Настройка и использование

### 1. Переменные окружения:
```bash
# DAS API (ОБЯЗАТЕЛЬНО)
DAS_API_URL=https://rpc.helius.xyz/?api-key=YOUR_API_KEY
DAS_API_KEY=YOUR_HELIUS_API_KEY

# Опциональные настройки мониторинга
MONITORING_INTERVAL_MS=30000    # 30 секунд
MONITORING_MAX_RETRIES=40       # 20 минут максимум
WEBHOOK_RETRY_ATTEMPTS=3        # Retry webhooks
```

### 2. Автоматический запуск:
```javascript
// Мониторинг запускается автоматически после успешного минтинга
if (result.success && result.assetId) {
  monitor.startMonitoring(operationId, result.assetId, metadata);
}
```

### 3. Регистрация webhook:
```bash
POST /api/mint/webhooks
{
  "url": "https://yourapp.com/webhook",
  "events": ["indexingCompleted", "indexingTimeout"],
  "secret": "your-webhook-secret"
}
```

---

## 📊 API Endpoints

### **Мониторинг:**
```bash
# Статистика системы мониторинга
GET /api/mint/monitoring/stats

# Активные операции мониторинга
GET /api/mint/monitoring/active  

# Статус конкретной операции
GET /api/mint/monitoring/{operationId}

# Остановка мониторинга
POST /api/mint/monitoring/{operationId}/stop
```

### **Webhooks:**
```bash
# Регистрация webhook
POST /api/mint/webhooks
{
  "url": "https://example.com/webhook",
  "events": ["indexingCompleted", "indexingTimeout", "indexingError"],
  "headers": {"Authorization": "Bearer token"},
  "secret": "webhook-secret"
}

# Список всех webhooks
GET /api/mint/webhooks

# Тестирование webhook
POST /api/mint/webhooks/{id}/test

# Удаление webhook
DELETE /api/mint/webhooks/{id}
```

---

## 🔔 Webhook События

### **indexingCompleted** - NFT проиндексирован
```json
{
  "event": "indexingCompleted",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "operationId": "abc-123",
    "assetId": "xyz-789",
    "totalTime": 300000,
    "attempts": 5,
    "result": { /* DAS asset data */ }
  }
}
```

### **indexingTimeout** - Таймаут индексации
```json
{
  "event": "indexingTimeout", 
  "timestamp": "2024-01-01T12:20:00Z",
  "data": {
    "operationId": "abc-123",
    "assetId": "xyz-789", 
    "totalTime": 1200000,
    "attempts": 40,
    "recommendation": "NFT может появиться в кошельке в течение 30-60 минут"
  }
}
```

### **indexingError** - Ошибка мониторинга
```json
{
  "event": "indexingError",
  "timestamp": "2024-01-01T12:05:00Z", 
  "data": {
    "operationId": "abc-123",
    "assetId": "xyz-789",
    "error": "DAS API unavailable",
    "attempts": 10
  }
}
```

---

## 📈 Мониторинг и статистика

### Статистика системы:
```json
{
  "success": true,
  "data": {
    "totalMonitored": 150,
    "successfullyIndexed": 142,
    "timeouts": 6,
    "errors": 2,
    "activeJobs": 3,
    "averageIndexingTimeMinutes": 8.5,
    "isRunning": true
  }
}
```

### Активные операции:
```json
{
  "success": true,
  "data": {
    "total": 3,
    "operations": [
      {
        "operationId": "op-123",
        "assetId": "asset-456", 
        "status": "monitoring",
        "attempts": 5,
        "elapsed": 150000,
        "metadata": {
          "collection": "My Collection",
          "nftName": "Cool NFT #123"
        }
      }
    ]
  }
}
```

---

## 🔧 Диагностика и отладка

### 1. Проверка статуса мониторинга:
```bash
curl GET /api/mint/monitoring/stats
```

### 2. Проверка логов:
```bash
# Поиск в логах сервера:
[Indexing Monitor] ✅ Начат мониторинг operation
[Indexing Monitor] 🔄 Проверяем 3 активных операций
[Indexing Monitor] ✅ op-123 успешно проиндексирован
```

### 3. Тестирование webhook:
```bash
curl -X POST /api/mint/webhooks/{webhook-id}/test
```

### 4. Проверка конкретной операции:
```bash
curl GET /api/mint/monitoring/{operation-id}
```

---

## 🛡️ Безопасность

### Webhook подписи:
- **HMAC SHA-256** подпись каждого webhook
- **Header**: `X-PEcoin-Signature: sha256=abc123...`
- **Верификация**: проверяйте подпись на вашей стороне

### Пример верификации:
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
    
  return `sha256=${expected}` === signature;
}
```

---

## 🎯 Результаты решения

### ✅ **Что достигнуто:**

1. **Автоматический мониторинг** - background проверки без участия пользователя
2. **Event-driven архитектура** - webhook уведомления в реальном времени  
3. **Полная observability** - детальная статистика и мониторинг
4. **Отказоустойчивость** - retry логика и graceful degradation
5. **Масштабируемость** - параллельный мониторинг множества операций

### 🔮 **Практический результат:**

**До решения:**
- ❌ Неизвестно когда NFT появится в кошельке
- ❌ Нет мониторинга процесса индексации  
- ❌ Пользователь не знает статуса операции

**После решения:**
- ✅ **Автоматический мониторинг** DAS индексации
- ✅ **Real-time уведомления** о статусе  
- ✅ **Webhook интеграция** для внешних систем
- ✅ **Детальная статистика** производительности
- ✅ **Пользователь получает** точную информацию о готовности NFT

---

## 📞 Поддержка

### Если система не работает:

1. **Проверьте DAS API настройки:**
```bash
echo $DAS_API_URL
echo $DAS_API_KEY
```

2. **Проверьте статус мониторинга:**
```bash
curl GET /api/mint/monitoring/stats
```

3. **Посмотрите логи сервера** на предмет ошибок DAS подключения

4. **Протестируйте webhook** если используете уведомления

---

**Статус:** ✅ Полностью реализовано и протестировано  
**Версия:** 1.0.0  
**Дата:** $(date)

🎉 **Проблема #3 полностью решена!** 