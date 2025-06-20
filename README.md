# PEcamp NFT Backend

Express.js backend для минтинга сжатых NFT в экосистеме PEcamp на блокчейне Solana.

## 🚀 Возможности

- **Минтинг одиночных NFT** - `/api/mint/single`
- **Пакетный минтинг** - `/api/mint/batch` (до 50 NFT)  
- **Отслеживание операций** - `/api/mint/status/:id`
- **Управление коллекциями** - `/api/collections`
- **Загрузка на IPFS** - `/api/upload`
- **Мониторинг здоровья** - `/health`

## 🔧 Настройка окружения

Создайте файл `.env` с следующими переменными:

```bash
# API Configuration
NODE_ENV=production
PORT=8080
API_KEY=your_api_key_here

# Solana Blockchain (на основе reference/config.js)
PRIVATE_KEY=your_base58_private_key_for_minting
RPC_URL=your_main_rpc_endpoint
BACKUP_RPC_URLS=https://solana-api.projectserum.com,https://rpc.ankr.com/solana

# NFT Configuration (адреса из reference файлов)
TREE_ADDRESS=your_merkle_tree_address
COLLECTION_ADDRESS=your_collection_address  
DEFAULT_RECIPIENT=your_default_recipient_wallet

# IPFS Storage
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_API_KEY=your_pinata_secret_key
DEDICATED_PINATA_GATEWAY=https://your-gateway.mypinata.cloud

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 📡 API Endpoints

### Минтинг NFT

**POST** `/api/mint/single` - Минт одного NFT
```json
{
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

**GET** `/api/mint/operations` - Список операций

### Прочие API

**GET** `/api/collections` - Список коллекций
**POST** `/api/upload/ipfs` - Загрузка файлов
**GET** `/health` - Проверка работоспособности

## 🏗️ Архитектура

Проект основан на проверенном коде из папки `reference/`:
- `SolanaService` - адаптация `mint_nft_stable.js`
- Конфигурация из `config.js`
- Retry логика и обработка ошибок

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

Для разработки с перезагрузкой:
```bash
npm run dev
```

## 📦 Деплой на TimeWeb

1. Убедитесь что переменные окружения настроены
2. Проект использует PM2 (ecosystem.config.js)
3. Порт: 8080 (автоматически из TimeWeb)

Статус деплоя: **Готов к Stage 4 тестированию**