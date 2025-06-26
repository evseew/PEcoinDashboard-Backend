# 🔧 Настройка Backend для NFT Minting

## 📋 Быстрый старт

### 1. Создайте файл `.env` в папке `PEcoinDashboard-Backend/`

```bash
# PEcoin Dashboard Backend Environment
NODE_ENV=development
PORT=8080
API_KEY=test_api_key_2024

# Solana Blockchain Configuration
# ВАЖНО: Замените на ваши реальные ключи
PRIVATE_KEY=your_base58_private_key_here
RPC_URL=https://solana-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY
BACKUP_RPC_URLS=https://api.mainnet-beta.solana.com,https://solana-api.projectserum.com

# Default recipient wallet (ваш тестовый кошелек)
DEFAULT_RECIPIENT=9zMiCfGLdyKoRiqj7AScLfBKGJPvriqrFemEi3zagUt7

# Pinata IPFS Configuration
# ВАЖНО: Замените на ваши реальные Pinata ключи
PINATA_API_KEY=your_pinata_api_key_here
PINATA_SECRET_API_KEY=your_pinata_secret_key_here
# PINATA_JWT не нужен для этого проекта (используется старый SDK)
DEDICATED_PINATA_GATEWAY=https://amber-accused-tortoise-973.mypinata.cloud

# Database Configuration (будущее)
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### 2. Установите зависимости

```bash
cd PEcoinDashboard-Backend
npm install
```

### 3. Запустите backend

```bash
# Development режим
npm run dev

# Production режим
npm start
```

Backend будет доступен на `http://localhost:8080`

## 🔑 Где взять ключи

### Pinata IPFS (для хранения изображений)
1. Зайдите на https://pinata.cloud
2. Создайте аккаунт
3. Перейдите в API Keys
4. Создайте новый API key с правами на загрузку
5. Скопируйте `API Key` → `PINATA_API_KEY`
6. Скопируйте `API Secret` → `PINATA_SECRET_API_KEY`
7. Создайте JWT token → `PINATA_JWT`

### Solana Wallet (для минтинга)
1. Создайте кошелек в Phantom/Solflare
2. Экспортируйте приватный ключ в base58 формате
3. Вставьте в `PRIVATE_KEY`

⚠️ **ВАЖНО**: Храните приватный ключ в безопасности!

### Alchemy RPC (рекомендуется)
1. Зайдите на https://alchemy.com
2. Создайте приложение для Solana Mainnet
3. Скопируйте RPC URL → `RPC_URL`

## 🧪 Тестирование

После запуска проверьте работу:

```bash
# Health check
curl http://localhost:8080/health

# API status with auth
curl -H "x-api-key: test_api_key_2024" http://localhost:8080/api

# Available collections
curl -H "x-api-key: test_api_key_2024" http://localhost:8080/api/collections

# IPFS service status
curl -H "x-api-key: test_api_key_2024" http://localhost:8080/api/upload/status
```

## 🔄 Интеграция с Frontend

Frontend уже настроен на использование backend через:
- External API URL в переменных окружения
- Гибридный API клиент с автоматическим fallback
- Загрузка изображений через `/api/upload/ipfs`
- Минтинг через `/api/mint/single`

## 📝 Логи

Backend выводит подробные логи для отладки:
- `[IPFS Service]` - загрузка файлов
- `[Mint API]` - процесс минтинга
- `[Collections API]` - управление коллекциями

## ❗ Troubleshooting

**Ошибка "Pinata credentials не найдены"**
→ Проверьте `.env` файл и ключи Pinata

**Ошибка "Private key not found"**
→ Добавьте `PRIVATE_KEY` в base58 формате

**Ошибка "Collection not found"**
→ Используйте доступные коллекции: `pe-stickers`, `pe-badges`, `pe-certificates` 