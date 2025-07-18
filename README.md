# PEcamp NFT Backend

Express.js backend для минтинга сжатых NFT в экосистеме PEcamp на блокчейне Solana с поддержкой **множественных коллекций**.

## 🚀 Возможности

- **Мульти-коллекции** - Поддержка множественных NFT коллекций
- **Минтинг одиночных NFT** - `/api/mint/single` 
- **Пакетный минтинг** - `/api/mint/batch` (до 50 NFT)  
- **Отслеживание операций** - `/api/mint/status/:id`
- **Управление коллекциями** - `/api/collections`
- **Загрузка на IPFS** - `/api/upload`
- **Мониторинг здоровья** - `/health`

## 🎯 Архитектура мульти-коллекций

**Flow для фронтенда:**
1. Получить активные коллекции: `GET /api/collections/active`
2. Пользователь выбирает коллекцию
3. Минтинг с collectionId: `POST /api/mint/single`

**Преимущества:**
- Гибкость в управлении коллекциями
- Централизованные настройки
- Простая интеграция с фронтендом

## 🔧 Настройка окружения

```bash
# API & Blockchain
NODE_ENV=production
PORT=8080
API_KEY=your_api_key_here
PRIVATE_KEY=your_base58_private_key_for_minting
RPC_URL=your_main_rpc_endpoint

# IPFS Storage  
PINATA_API_KEY=your_pinata_api_key
DEDICATED_PINATA_GATEWAY=https://your-gateway.mypinata.cloud

# Default Settings
DEFAULT_RECIPIENT=your_default_recipient_wallet
```

## 📡 API Endpoints

### Коллекции

**GET** `/api/collections` - Все коллекции с фильтрацией
**GET** `/api/collections/active` - Активные коллекции для минтинга  
**GET** `/api/collections/:id` - Конкретная коллекция
**GET** `/api/collections/:id/mint-check` - Проверка возможности минтинга
**POST** `/api/collections` - Создать коллекцию
**PUT** `/api/collections/:id` - Обновить коллекцию

### Минтинг NFT

**POST** `/api/mint/single` - Минт одного NFT
```json
{
  "collectionId": "pe-stickers",
  "recipient": "wallet_address",
  "metadata": {
    "name": "PE Sticker #1",
    "uri": "https://gateway.pinata.cloud/ipfs/QmXXX",
    "symbol": "PES"
  }
}
```

**POST** `/api/mint/batch` - Пакетный минт
```json
{
  "collectionId": "pe-stickers",
  "items": [
    {
      "recipient": "wallet1", 
      "metadata": {"name": "NFT #1", "uri": "ipfs://..."}
    },
    {
      "recipient": "wallet2",
      "metadata": {"name": "NFT #2", "uri": "ipfs://..."}
    }
  ]
}
```

**GET** `/api/mint/status/:operationId` - Статус операции
**GET** `/api/mint/operations?collectionId=pe-stickers` - Операции по коллекции

### Прочие API

**POST** `/api/upload/ipfs` - Загрузка файлов
**GET** `/health/detailed` - Проверка конфигурации Solana

## 🏗️ Архитектура

**Сервисы:**
- `SolanaService` - адаптация `reference/mint_nft_stable.js`
- `CollectionsService` - управление коллекциями
- Проверенная retry логика из reference

**Доступные коллекции:**
- **pe-stickers** ✅ (активная, готова к минтингу)
- **pe-badges** 🚧 (черновик)  
- **pe-certificates** ⏳ (настройка)

## 🔑 Аутентификация

Все `/api/*` endpoints требуют заголовок:
```
X-API-Key: your_api_key_here
```

## 🚀 Запуск

```bash
npm install
npm start
```

## 📦 Деплой на TimeWeb

1. Настройте переменные окружения (см. ENV_SETUP.md)
2. Проект использует PM2 (ecosystem.config.js)
3. Порт: 8080

**Статус:** ✅ Готов к мульти-коллекционному тестированию

## 🚀 Локальная разработка

### Быстрый старт

```bash
# Установка зависимостей
npm install

# Запуск в режиме разработки
npm run local

# Или с автоперезагрузкой (если установлен nodemon)
npm run dev
```

### Тестирование API

```bash
# Проверка health endpoint
npm run health

# Проверка collections API
npm run collections

# Ручные тесты с curl
curl http://localhost:8080/health
curl -H "x-api-key: test_api_key_2024" http://localhost:8080/api/collections
curl -H "x-api-key: test_api_key_2024" http://localhost:8080/api/collections/active
```

### Workflow разработки

1. **Локальная разработка** - все изменения тестируем на `localhost:8080`
2. **Тестирование** - проверяем endpoints через curl/Postman
3. **Коммит готовых изменений** - только после локального тестирования
4. **Деплой на TimeWeb** - финальная версия на продакшн

## 🔐 Безопасность и мониторинг

### Управление приватным ключом
- 🔒 **Выделенный кошелек** - создайте отдельный кошелек только для минтинга
- 💰 **Ограниченный баланс** - держите 10-50 SOL, пополняйте по необходимости  
- 🚫 **НЕ основной кошелек** - никогда не используйте основной кошелек с большими суммами

### Стоимость операций
- **Одиночный минт**: ~0.00025 SOL (~$0.005)
- **Пакет 10 NFT**: ~0.00125 SOL (~$0.025)
- **Пакет 50 NFT**: ~0.00525 SOL (~$0.10)

### Мониторинг баланса
```bash
# Проверка баланса кошелька
curl http://localhost:8080/health/wallet

# Детальная информация с оценкой стоимости
curl http://localhost:8080/health/detailed
```

### Rate Limiting защита
- **API запросы**: 100/15мин
- **Минтинг**: 5 операций/мин  
- **Загрузки**: 20 файлов/10мин
- **Создание коллекций**: 3/час

### Настройка в TimeWeb
1. **Environment Variables** → добавить `PRIVATE_KEY` (base58 формат)
2. **Мониторинг** → встроенный в панели управления
3. **SSL/HTTPS** → автоматический сертификат

**📋 Документация**: 
- `SECURITY.md` - подробное руководство по безопасности
- `ENV_SETUP.md` - настройка переменных окружения