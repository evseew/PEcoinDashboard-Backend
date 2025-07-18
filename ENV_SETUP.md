# Environment Variables for PEcoin Dashboard Backend

## Core Configuration
NODE_ENV=production
PORT=8080

## Solana Configuration  
RPC_URL=https://api.mainnet-beta.solana.com
RPC_WS_URL=wss://api.mainnet-beta.solana.com

## ✅ НОВОЕ: DAS API Configuration для решения проблемы индексации NFT

# ✅ РЕКОМЕНДУЕМЫЕ ПРОВАЙДЕРЫ:

# 1. Alchemy (если у вас уже есть аккаунт) - ИСПОЛЬЗУЙТЕ ЭТОТ!
DAS_API_URL=https://solana-mainnet.g.alchemy.com/v2/YOUR-ALCHEMY-API-KEY
DAS_API_KEY=YOUR-ALCHEMY-API-KEY

# 2. Helius DAS API (альтернатива)
# DAS_API_URL=https://rpc.helius.xyz/?api-key=YOUR_HELIUS_API_KEY  
# DAS_API_KEY=YOUR_HELIUS_API_KEY

# 3. Другие провайдеры:
# - Triton: https://api.triton.one/rpc
# - QuickNode: https://your-endpoint.quiknode.pro/YOUR_API_KEY/
# - Metaplex: https://api.metaplex.solana.com

## Wallet Configuration
WALLET_PRIVATE_KEY=your_base58_private_key_here
MERKLE_TREE_AUTHORITY=your_tree_authority_public_key

## IPFS Configuration
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_API_KEY=your_pinata_secret_key
PINATA_JWT=your_pinata_jwt
DEDICATED_PINATA_GATEWAY=https://amber-accused-tortoise-973.mypinata.cloud

## Database (для будущей интеграции с Supabase)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

## Default Settings (fallback значения)
DEFAULT_RECIPIENT=A27VztuDLCA3FwnELbCnoGQW83Rk5xfrL7A79A8xbDTP

## ✅ Изменения в архитектуре:

1. **Убраны фиксированные адреса**: `TREE_ADDRESS` и `COLLECTION_ADDRESS` больше не нужны
2. **Мульти-коллекции**: Адреса коллекций хранятся в `CollectionsService`
3. **Выбор коллекции**: Фронтенд передает `collectionId` вместо адресов

## 📋 Доступные коллекции:

**pe-stickers** (активная из reference/)
- Tree: `DKHMY8Nn7xofN73wCiDBLZe3qzVyA2B8X1KCE2zsJRyH`
- Collection: `F1mKEFsnEz8bm4Ty2mTFrgsCcXmmMroQzRFEzc2s7B8e`
- Статус: `active`, минтинг разрешен

**pe-badges** (черновик)
- Статус: `draft`, минтинг заблокирован

**pe-certificates** (ожидание настройки)
- Статус: `pending`, минтинг заблокирован

## 🔗 Новый API Flow:

1. **Фронтенд запрашивает**: `GET /api/collections/active`
2. **Пользователь выбирает коллекцию**: например `pe-stickers`
3. **Фронтенд минтит**: `POST /api/mint/single` с `collectionId: "pe-stickers"`

## Что нужно обновить:

1. **PRIVATE_KEY** - ваш приватный ключ в формате base58 для минтинга
2. **PINATA ключи** - для IPFS загрузок
3. **DEDICATED_PINATA_GATEWAY** - ваш выделенный шлюз

## Проверка настройки:

```bash
# Проверка здоровья с Solana конфигурацией
curl -H "X-API-Key: test_api_key_2024" https://your-app.timeweb.cloud/health/detailed

# Проверка доступных коллекций
curl -H "X-API-Key: test_api_key_2024" https://your-app.timeweb.cloud/api/collections/active
```

Теперь система поддерживает множественные коллекции! 🎉 