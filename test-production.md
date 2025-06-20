# 🚀 Руководство по боевому тестированию NFT Backend

## Подготовка

### 1. Создание тестового кошелька
```bash
# Создайте новый кошелек через Phantom/Solflare
# Или используйте solana-keygen:
solana-keygen new --outfile test-wallet.json
solana-keygen pubkey test-wallet.json  # Получите адрес
```

### 2. Пополнение тестового кошелька
- Переведите 5-10 SOL на тестовый кошелек
- Это покроет ~20,000-40,000 минтов

### 3. Настройка .env
```bash
PRIVATE_KEY=ваш_base58_приватный_ключ
API_KEY=test_api_key_2024
RPC_URL=https://api.mainnet-beta.solana.com
NODE_ENV=production

# Опционально для реального IPFS:
PINATA_API_KEY=ваш_ключ_pinata
PINATA_SECRET_KEY=ваш_секрет_pinata

# Опционально для базы данных:
SUPABASE_URL=ваш_url_supabase
SUPABASE_ANON_KEY=ваш_ключ_supabase
```

## Этапы тестирования

### Этап 1: Проверка готовности системы

#### 1.1 Базовая проверка
```bash
curl -X GET "https://ваш-домен.com/health" | jq
```
**Ожидаемый результат:**
```json
{
  "success": true,
  "status": "healthy",
  "uptime": "число_секунд"
}
```

#### 1.2 Детальная проверка сервисов
```bash
curl -X GET "https://ваш-домен.com/health/detailed" | jq
```
**Проверьте:**
- `status: "healthy"`
- `checks.environment.variables.PRIVATE_KEY: true`
- `checks.services.solana.status: "operational"`

#### 1.3 Проверка кошелька
```bash
curl -X GET "https://ваш-домен.com/health/wallet" | jq
```
**Проверьте:**
- `status: "healthy"` (не "critical" или "warning")
- `wallet.balance > 1` SOL
- `affordability.singleMint.canAfford: true`

### Этап 2: Проверка коллекций

#### 2.1 Получение активных коллекций
```bash
curl -H "x-api-key: test_api_key_2024" \
     -X GET "https://ваш-домен.com/api/collections/active" | jq
```
**Ожидаемый результат:**
```json
{
  "success": true,
  "collections": [
    {
      "id": "pe-stickers",
      "name": "PE Stickers",
      "status": "active",
      "treeAddress": "адрес_дерева",
      "collectionAddress": "адрес_коллекции"
    }
  ]
}
```

#### 2.2 Проверка возможности минтинга
```bash
curl -H "x-api-key: test_api_key_2024" \
     -X GET "https://ваш-домен.com/api/collections/pe-stickers/mint-check" | jq
```
**Проверьте:**
- `canMint: true`
- `checks.wallet: true`
- `checks.collection: true`

### Этап 3: Тестирование загрузки файлов

#### 3.1 Подготовка тестового изображения
```bash
# Создайте простое изображение или скачайте:
curl -o test-nft.png "https://via.placeholder.com/512x512/0000FF/FFFFFF?text=Test+NFT"
```

#### 3.2 Загрузка на IPFS
```bash
curl -H "x-api-key: test_api_key_2024" \
     -F "file=@test-nft.png" \
     -X POST "https://ваш-домен.com/api/upload" | jq
```
**Ожидаемый результат:**
```json
{
  "success": true,
  "ipfsHash": "QmХХХХХХ",
  "url": "https://gateway.pinata.cloud/ipfs/QmХХХХХХ"
}
```

### Этап 4: Первый тестовый минт

#### 4.1 Минт одного NFT
```bash
curl -H "x-api-key: test_api_key_2024" \
     -H "Content-Type: application/json" \
     -X POST "https://ваш-домен.com/api/mint/single" \
     -d '{
       "collectionId": "pe-stickers",
       "recipient": "адрес_получателя_нфт",
       "metadata": {
         "name": "Test NFT #1",
         "description": "Первый тестовый NFT",
         "image": "https://gateway.pinata.cloud/ipfs/ваш_хеш",
         "attributes": [
           {"trait_type": "Type", "value": "Test"},
           {"trait_type": "Rarity", "value": "Common"}
         ]
       }
     }' | jq
```

**Ожидаемый результат:**
```json
{
  "success": true,
  "signature": "подпись_транзакции",
  "message": "NFT успешно заминчен",
  "nft": {
    "name": "Test NFT #1",
    "recipient": "адрес_получателя"
  },
  "transaction": {
    "signature": "подпись",
    "explorerUrl": "https://solscan.io/tx/подпись"
  }
}
```

#### 4.2 Проверка транзакции
- Откройте ссылку `explorerUrl` в браузере
- Убедитесь что транзакция успешна
- Проверьте что NFT появился в кошельке получателя

### Этап 5: Стресс-тестирование

#### 5.1 Проверка rate limiting
```bash
# Отправьте 10 запросов подряд быстро:
for i in {1..10}; do
  curl -H "x-api-key: test_api_key_2024" \
       -X GET "https://ваш-домен.com/api/collections" &
done
wait
```
**Ожидаемо:** последние запросы должны получить 429 статус

#### 5.2 Минт нескольких NFT подряд
```bash
# Минт 3 NFT с интервалом 30 секунд:
for i in {1..3}; do
  echo "Минт NFT #$i"
  curl -H "x-api-key: test_api_key_2024" \
       -H "Content-Type: application/json" \
       -X POST "https://ваш-домен.com/api/mint/single" \
       -d "{
         \"collectionId\": \"pe-stickers\",
         \"recipient\": \"адрес_получателя\",
         \"metadata\": {
           \"name\": \"Stress Test NFT #$i\",
           \"description\": \"Стресс-тест NFT номер $i\",
           \"image\": \"https://via.placeholder.com/512x512?text=NFT+$i\"
         }
       }" | jq '.success'
  
  echo "Ожидание 30 секунд..."
  sleep 30
done
```

### Этап 6: Мониторинг и логи

#### 6.1 Проверка баланса после тестов
```bash
curl -X GET "https://ваш-домен.com/health/wallet" | jq '.wallet.balance'
```

#### 6.2 Проверка логов на сервере
```bash
# На сервере:
pm2 logs nft-backend
```

## Критерии успеха

### ✅ Система готова к продакшну если:
1. **Health checks** - все зеленые
2. **Кошелек** - баланс > 1 SOL, статус "healthy"
3. **Коллекции** - pe-stickers активна и доступна
4. **IPFS** - файлы загружаются успешно
5. **Минтинг** - NFT создаются и подтверждаются
6. **Rate limiting** - срабатывает при превышении лимитов
7. **Транзакции** - видны в Solscan, NFT появляются в кошельках

### ❌ Проблемы требующие исправления:
1. Health status "critical" или "error"
2. Баланс кошелька < 0.1 SOL
3. Минтинг фейлится или висит > 2 минут
4. IPFS не загружает файлы
5. Rate limiting не работает
6. Транзакции не подтверждаются

## Команды для быстрой диагностики

```bash
# Полная проверка одной командой:
echo "=== HEALTH CHECK ===" && \
curl -s "https://ваш-домен.com/health" | jq '.status' && \
echo "=== WALLET BALANCE ===" && \
curl -s "https://ваш-домен.com/health/wallet" | jq '.wallet.balance' && \
echo "=== ACTIVE COLLECTIONS ===" && \
curl -s -H "x-api-key: test_api_key_2024" "https://ваш-домен.com/api/collections/active" | jq '.collections | length'
```

## Автоматизация тестирования

Можно создать простой скрипт для регулярных проверок:

```bash
#!/bin/bash
# test-production.sh

DOMAIN="https://ваш-домен.com"
API_KEY="test_api_key_2024"

echo "🚀 Тестирование продакшн среды..."

# Health check
HEALTH=$(curl -s "$DOMAIN/health" | jq -r '.status')
echo "Health: $HEALTH"

# Wallet balance
BALANCE=$(curl -s "$DOMAIN/health/wallet" | jq -r '.wallet.balance')
echo "Balance: $BALANCE SOL"

# Collections count
COLLECTIONS=$(curl -s -H "x-api-key: $API_KEY" "$DOMAIN/api/collections/active" | jq '.collections | length')
echo "Active collections: $COLLECTIONS"

if [ "$HEALTH" = "healthy" ] && [ $(echo "$BALANCE > 1" | bc) -eq 1 ] && [ "$COLLECTIONS" -gt 0 ]; then
  echo "✅ Система готова к работе"
else
  echo "❌ Обнаружены проблемы"
fi
``` 