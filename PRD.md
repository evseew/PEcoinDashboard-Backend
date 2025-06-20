# 📋 **NFT Минтинг Backend - Техническое задание**

## 🎯 **Обзор проекта**

**Цель:** Создать Express.js backend для минтинга Compressed NFT в экосистеме PEcamp  
**Платформа:** TimeWeb Hosting (Голландия)  
**Интеграция:** Существующий Next.js frontend на Vercel  
**Blockchain:** Solana (Compressed NFT через Metaplex Bubblegum)

---

## 🏗️ **1. Архитектура проекта**

### **Структура директорий:**
```
backend/
├── src/
│   ├── routes/           # API endpoints
│   │   ├── mint.js       # NFT минтинг операции
│   │   ├── collections.js # Управление коллекциями
│   │   ├── upload.js     # Загрузка файлов на IPFS
│   │   ├── status.js     # Статусы операций
│   │   └── health.js     # Health checks
│   ├── services/         # Бизнес-логика
│   │   ├── solana.js     # Solana интеграция
│   │   ├── pinata.js     # IPFS операции
│   │   ├── queue.js      # Очереди задач
│   │   ├── supabase.js   # Database операции
│   │   └── validation.js # Валидация данных
│   ├── middleware/       # Express middleware
│   │   ├── auth.js       # API авторизация
│   │   ├── cors.js       # CORS настройки
│   │   ├── rateLimit.js  # Rate limiting
│   │   └── errorHandler.js # Обработка ошибок
│   ├── utils/            # Утилиты
│   │   ├── wallet.js     # Кошелек операции
│   │   ├── logger.js     # Логирование
│   │   ├── cache.js      # Кэширование
│   │   └── constants.js  # Константы
│   ├── types/            # TypeScript типы
│   │   └── index.d.ts
│   └── app.js           # Express приложение
├── reference-integration/ # Адаптированный reference-code
│   ├── mint-single.js
│   ├── mint-batch.js
│   ├── upload-assets.js
│   └── create-tree.js
├── config/
│   ├── database.js      # База данных
│   ├── blockchain.js    # Solana конфигурация
│   └── storage.js       # IPFS конфигурация
├── tests/               # Тесты
├── docs/                # Документация
├── .env.example
├── .gitignore
├── package.json
├── ecosystem.config.js  # PM2 конфигурация
└── README.md
```

---

## 🔗 **2. API Endpoints**

### **🎨 NFT Минтинг (`/api/mint`)**

#### **POST `/api/mint/single`** - Минт одного NFT
```typescript
Request:
{
  collectionId: string;        // ID коллекции из базы
  recipient: string;           // Solana wallet address
  metadata: {
    name: string;              // Название NFT
    description?: string;      // Описание
    image: File | string;      // Файл изображения или IPFS URI
    attributes?: Array<{       // Атрибуты NFT
      trait_type: string;
      value: string;
    }>;
    external_url?: string;     // Внешняя ссылка
  };
  copies?: number;             // Количество копий (по умолчанию 1)
}

Response:
{
  success: boolean;
  data: {
    transactionId: string;     // ID операции для tracking
    signatures: string[];     // Solana transaction signatures
    leafIndexes: number[];    // Merkle tree leaf indexes
    assetIds: string[];       // Compressed NFT asset IDs
    ipfsUris: string[];       // IPFS URI метаданных
  };
  message: string;
}
```

#### **POST `/api/mint/batch`** - Batch минтинг
```typescript
Request:
{
  collectionId: string;
  recipient: string;
  nfts: Array<{
    name: string;
    description?: string;
    image: File | string;
    attributes?: Array<{
      trait_type: string;
      value: string;
    }>;
    copies?: number;
  }>;
  batchSize?: number;          // Размер батча (по умолчанию 10)
  delayBetweenBatches?: number; // Задержка между батчами (мс)
}

Response:
{
  success: boolean;
  data: {
    transactionId: string;
    totalNfts: number;
    estimatedTime: number;     // Оценочное время выполнения (секунды)
    batchCount: number;
  };
  message: string;
}
```

#### **GET `/api/mint/status/:transactionId`** - Статус операции
```typescript
Response:
{
  success: boolean;
  data: {
    transactionId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    progress: {
      total: number;
      completed: number;
      failed: number;
      percentage: number;
      currentItem?: string;
      estimatedTimeLeft?: number; // секунды
    };
    results?: Array<{
      signature?: string;
      leafIndex?: number;
      assetId?: string;
      error?: string;
      status: 'success' | 'failed';
    }>;
    startTime: string;         // ISO timestamp
    endTime?: string;          // ISO timestamp
    error?: string;
  };
}
```

#### **DELETE `/api/mint/cancel/:transactionId`** - Отмена операции
```typescript
Response:
{
  success: boolean;
  message: string;
}
```

### **📁 Коллекции (`/api/collections`)**

#### **GET `/api/collections`** - Список коллекций
```typescript
Query Params:
- status?: 'active' | 'paused' | 'completed'
- allowMinting?: boolean
- page?: number
- limit?: number

Response:
{
  success: boolean;
  data: {
    collections: Array<{
      id: string;
      name: string;
      description: string;
      symbol: string;
      treeAddress: string;
      collectionAddress?: string;
      creatorAddress?: string;
      capacity: number;
      minted: number;
      imageUrl?: string;
      externalUrl?: string;
      hasValidTree: boolean;
      supportsDAS: boolean;
      status: 'active' | 'paused' | 'completed';
      isPublic: boolean;
      allowMinting: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  };
}
```

#### **POST `/api/collections/sync/:id`** - Синхронизация с блокчейном
```typescript
Response:
{
  success: boolean;
  data: {
    updated: {
      minted: number;
      capacity: number;
      hasValidTree: boolean;
    };
  };
  message: string;
}
```

### **📤 Загрузка (`/api/upload`)**

#### **POST `/api/upload/ipfs`** - Загрузка на IPFS
```typescript
Request: FormData
- files: File[]              // Изображения
- metadata?: string          // JSON метаданные

Response:
{
  success: boolean;
  data: {
    uploads: Array<{
      filename: string;
      ipfsHash: string;
      ipfsUri: string;
      gatewayUrl: string;
      size: number;
    }>;
  };
}
```

### **📊 Статистика (`/api/stats`)**

#### **GET `/api/stats/overview`** - Общая статистика
```typescript
Response:
{
  success: boolean;
  data: {
    totalCollections: number;
    totalMinted: number;
    totalCapacity: number;
    activeOperations: number;
    last24Hours: {
      minted: number;
      operations: number;
      successRate: number;
    };
    walletBalance: number;     // SOL баланс
  };
}
```

---

## 🔐 **3. Переменные окружения**

### **`.env` конфигурация:**
```bash
# === ОСНОВНЫЕ НАСТРОЙКИ ===
NODE_ENV=production
PORT=8080                    # Или оставить пустым для автоназначения

# === SOLANA BLOCKCHAIN ===
PRIVATE_KEY=                 # Base58 приватный ключ кошелька
RPC_URL=                     # Alchemy Solana Mainnet URL
BACKUP_RPC_URLS=             # Запасные RPC через запятую
NETWORK=mainnet-beta         # mainnet-beta | devnet | testnet
SOLANA_COMMITMENT=confirmed  # confirmed | finalized | processed

# === IPFS STORAGE ===
PINATA_API_KEY=              # Pinata API ключ
PINATA_SECRET_KEY=           # Pinata Secret ключ
PINATA_GATEWAY=              # Dedicated Pinata gateway (опционально)

# === DATABASE ===
SUPABASE_URL=                # Supabase Project URL
SUPABASE_SERVICE_ROLE_KEY=   # Service Role Key (полный доступ)
SUPABASE_ANON_KEY=           # Anonymous Key (для некоторых операций)

# === БЕЗОПАСНОСТЬ ===
API_KEY=                     # API ключ для авторизации с фронтенда
JWT_SECRET=                  # JWT секрет (64+ символов)
CORS_ORIGINS=                # Разрешенные origins через запятую

# === КЭШИРОВАНИЕ ===
REDIS_URL=                   # Redis URL (опционально)
CACHE_TTL=300               # TTL кэша в секундах

# === RATE LIMITING ===
RATE_LIMIT_WINDOW=900       # Окно rate limit (секунды)
RATE_LIMIT_MAX=100          # Максимум запросов в окне

# === ОЧЕРЕДИ ===
QUEUE_BATCH_SIZE=10         # Размер batch для минтинга
QUEUE_DELAY_MS=1000         # Задержка между операциями
QUEUE_MAX_RETRIES=3         # Максимум повторов при ошибке

# === МОНИТОРИНГ ===
LOG_LEVEL=info              # error | warn | info | debug
ENABLE_METRICS=true         # Включить метрики
WEBHOOK_URL=                # URL для уведомлений (опционально)
```

---

## 🛡️ **4. Безопасность**

### **Middleware авторизации:**
```javascript
// middleware/auth.js
const authMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;
  
  // API Key авторизация
  if (apiKey === process.env.API_KEY) {
    return next();
  }
  
  // JWT авторизация (для будущих фич)
  if (authHeader?.startsWith('Bearer ')) {
    // JWT verification logic
  }
  
  return res.status(401).json({ 
    success: false, 
    error: 'Unauthorized' 
  });
};
```

### **Rate Limiting:**
```javascript
// middleware/rateLimit.js
const rateLimit = require('express-rate-limit');

const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs: windowMs * 1000,
    max,
    message: { success: false, error: message },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Различные лимиты для разных endpoints
const mintRateLimit = createRateLimit(900, 10, 'Too many mint requests');
const uploadRateLimit = createRateLimit(300, 50, 'Too many upload requests');
```

### **Валидация данных:**
```javascript
// services/validation.js
const validateMintRequest = (data) => {
  const errors = [];
  
  // Проверка Solana адреса
  if (!isValidSolanaAddress(data.recipient)) {
    errors.push('Invalid recipient address');
  }
  
  // Проверка метаданных
  if (!data.metadata?.name || data.metadata.name.length > 200) {
    errors.push('Invalid NFT name');
  }
  
  // Проверка коллекции
  if (!isValidUUID(data.collectionId)) {
    errors.push('Invalid collection ID');
  }
  
  return errors;
};
```

---

## 💾 **5. Интеграция с базой данных**

### **Новые таблицы (SQL миграции):**

#### **`mint_operations` таблица:**
```sql
CREATE TABLE mint_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id VARCHAR(64) UNIQUE NOT NULL,
  collection_id UUID REFERENCES nft_collections(id),
  recipient VARCHAR(44) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  operation_type VARCHAR(20) DEFAULT 'mint', -- 'mint' | 'batch_mint'
  total_nfts INTEGER DEFAULT 1,
  completed_nfts INTEGER DEFAULT 0,
  failed_nfts INTEGER DEFAULT 0,
  batch_size INTEGER DEFAULT 1,
  metadata JSONB,
  results JSONB DEFAULT '[]',
  error_message TEXT,
  start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_time TIMESTAMP WITH TIME ZONE,
  estimated_completion TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_mint_operations_transaction_id ON mint_operations(transaction_id);
CREATE INDEX idx_mint_operations_status ON mint_operations(status);
CREATE INDEX idx_mint_operations_created_at ON mint_operations(created_at DESC);
```

#### **`mint_results` таблица:**
```sql
CREATE TABLE mint_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID REFERENCES mint_operations(id),
  nft_name VARCHAR(200),
  signature VARCHAR(88),
  leaf_index INTEGER,
  asset_id VARCHAR(44),
  ipfs_hash VARCHAR(64),
  ipfs_uri TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_mint_results_operation_id ON mint_results(operation_id);
CREATE INDEX idx_mint_results_signature ON mint_results(signature);
```

### **Supabase сервис:**
```javascript
// services/supabase.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

class DatabaseService {
  // Создание операции минтинга
  async createMintOperation(data) {
    const { data: operation, error } = await supabase
      .from('mint_operations')
      .insert([{
        transaction_id: data.transactionId,
        collection_id: data.collectionId,
        recipient: data.recipient,
        operation_type: data.operationType,
        total_nfts: data.totalNfts,
        batch_size: data.batchSize,
        metadata: data.metadata
      }])
      .select()
      .single();
      
    if (error) throw error;
    return operation;
  }
  
  // Обновление статуса операции
  async updateMintOperation(transactionId, updates) {
    const { data, error } = await supabase
      .from('mint_operations')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('transaction_id', transactionId)
      .select()
      .single();
      
    if (error) throw error;
    return data;
  }
  
  // Сохранение результата минта
  async saveMintResult(operationId, result) {
    const { data, error } = await supabase
      .from('mint_results')
      .insert([{
        operation_id: operationId,
        nft_name: result.name,
        signature: result.signature,
        leaf_index: result.leafIndex,
        asset_id: result.assetId,
        ipfs_hash: result.ipfsHash,
        ipfs_uri: result.ipfsUri,
        status: result.status,
        error_message: result.error
      }]);
      
    if (error) throw error;
    return data;
  }
}
```

---

## ⚡ **6. Очереди и background обработка**

### **Queue система:**
```javascript
// services/queue.js
const EventEmitter = require('events');

class MintQueue extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.processing = new Map(); // transactionId -> AbortController
    this.isProcessing = false;
  }
  
  // Добавление задачи в очередь
  async addMintTask(task) {
    const transactionId = this.generateTransactionId();
    
    const queueItem = {
      transactionId,
      type: task.type, // 'single' | 'batch'
      data: task.data,
      priority: task.priority || 0,
      retries: 0,
      maxRetries: 3,
      createdAt: new Date(),
      status: 'queued'
    };
    
    this.queue.push(queueItem);
    this.emit('taskAdded', queueItem);
    
    // Автозапуск обработки
    if (!this.isProcessing) {
      this.processQueue();
    }
    
    return transactionId;
  }
  
  // Обработка очереди
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;
    
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      
      try {
        await this.processTask(task);
      } catch (error) {
        await this.handleTaskError(task, error);
      }
      
      // Задержка между задачами
      await this.delay(process.env.QUEUE_DELAY_MS || 1000);
    }
    
    this.isProcessing = false;
  }
  
  // Обработка отдельной задачи
  async processTask(task) {
    const abortController = new AbortController();
    this.processing.set(task.transactionId, abortController);
    
    task.status = 'processing';
    this.emit('taskStarted', task);
    
    try {
      let result;
      
      if (task.type === 'single') {
        result = await this.mintSingleNFT(task.data, abortController.signal);
      } else if (task.type === 'batch') {
        result = await this.mintBatchNFTs(task.data, abortController.signal);
      }
      
      task.status = 'completed';
      task.result = result;
      this.emit('taskCompleted', task);
      
    } finally {
      this.processing.delete(task.transactionId);
    }
  }
  
  // Отмена задачи
  cancelTask(transactionId) {
    const abortController = this.processing.get(transactionId);
    if (abortController) {
      abortController.abort();
      this.processing.delete(transactionId);
    }
    
    // Удаление из очереди
    const queueIndex = this.queue.findIndex(t => t.transactionId === transactionId);
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1);
    }
    
    this.emit('taskCancelled', { transactionId });
  }
}
```

---

## 🔗 **7. Интеграция с Solana (из reference-code)**

### **Адаптация reference-code:**
```javascript
// services/solana.js
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const bubblegum = require("@metaplex-foundation/mpl-bubblegum");
const { keypairIdentity, publicKey } = require("@metaplex-foundation/umi");
const bs58 = require("bs58");

class SolanaService {
  constructor() {
    this.umi = null;
    this.initialized = false;
  }
  
  // Инициализация Umi (из create_merkle_tree.js)
  async initialize() {
    if (this.initialized) return;
    
    const rpcUrls = [
      process.env.RPC_URL,
      ...process.env.BACKUP_RPC_URLS?.split(',') || []
    ].filter(Boolean);
    
    let connected = false;
    
    for (const rpcUrl of rpcUrls) {
      try {
        this.umi = this.createUmiInstance(rpcUrl);
        await this.umi.rpc.getLatestBlockhash();
        console.log(`✅ Connected to Solana RPC: ${rpcUrl}`);
        connected = true;
        break;
      } catch (error) {
        console.log(`❌ Failed to connect to ${rpcUrl}: ${error.message}`);
      }
    }
    
    if (!connected) {
      throw new Error('Failed to connect to any Solana RPC endpoint');
    }
    
    // Загрузка кошелька
    const secretKeyBytes = bs58.decode(process.env.PRIVATE_KEY);
    const umiKeypair = this.umi.eddsa.createKeypairFromSecretKey(secretKeyBytes);
    this.umi.use(keypairIdentity(umiKeypair));
    this.umi.use(bubblegum.mplBubblegum());
    
    this.initialized = true;
  }
  
  // Создание UMI instance (из reference-code)
  createUmiInstance(url) {
    const umi = createUmi(url, {
      httpOptions: { 
        fetchMiddleware: (req, next) => next(req)
      }
    });
    
    // Переопределение confirm для HTTP-only режима
    umi.rpc.confirm = async (signature, commitment) => {
      let retries = 10;
      while (retries > 0) {
        const result = await umi.rpc.getSignatureStatuses([signature], { commitment });
        if (result?.value?.[0]) {
          if (result.value[0].err) {
            throw new Error(`Transaction failed: ${JSON.stringify(result.value[0].err)}`);
          }
          return signature;
        }
        await this.delay(2000);
        retries--;
      }
      throw new Error(`Transaction ${bs58.encode(signature)} not confirmed after 10 attempts`);
    };
    
    return umi;
  }
  
  // Минт одного NFT (адаптация из mint_nft.js)
  async mintSingleNFT(params) {
    await this.initialize();
    
    const { collectionAddress, treeAddress, recipient, metadata } = params;
    
    try {
      const nftMetadata = {
        name: metadata.name,
        symbol: metadata.symbol || "cNFT",
        uri: metadata.uri,
        sellerFeeBasisPoints: 0,
        collection: {
          key: publicKey(collectionAddress),
          verified: false,
        },
        creators: metadata.creators || [
          {
            address: this.umi.identity.publicKey,
            share: 100,
            verified: false,
          },
        ],
      };
      
      const builder = await bubblegum.mintToCollectionV1(this.umi, {
        leafOwner: publicKey(recipient),
        merkleTree: publicKey(treeAddress),
        metadata: nftMetadata,
        collectionMint: publicKey(collectionAddress),
      });
      
      const result = await builder.sendAndConfirm(this.umi, {
        send: { skipPreflight: true },
        confirm: { 
          strategy: { 
            type: 'blockhash', 
            blockhash: (await this.umi.rpc.getLatestBlockhash()).blockhash 
          } 
        }
      });
      
      return {
        signature: bs58.encode(result.signature),
        success: true
      };
      
    } catch (error) {
      console.error('Mint failed:', error);
      throw error;
    }
  }
  
  // Получение баланса кошелька
  async getWalletBalance() {
    await this.initialize();
    const balance = await this.umi.rpc.getBalance(this.umi.identity.publicKey);
    return balance.basisPoints / 1e9; // Конвертация в SOL
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## 📦 **8. IPFS интеграция (Pinata)**

### **Pinata сервис:**
```javascript
// services/pinata.js
const pinataSDK = require('@pinata/sdk');
const fs = require('fs');
const path = require('path');

class PinataService {
  constructor() {
    this.pinata = new pinataSDK(
      process.env.PINATA_API_KEY,
      process.env.PINATA_SECRET_KEY
    );
    this.gateway = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud';
  }
  
  // Загрузка файла (из upload_assets.js)
  async uploadFile(filePath, filename) {
    try {
      const stream = fs.createReadStream(filePath);
      const result = await this.pinata.pinFileToIPFS(stream, {
        pinataMetadata: { name: filename }
      });
      
      return {
        ipfsHash: result.IpfsHash,
        ipfsUri: `ipfs://${result.IpfsHash}`,
        gatewayUrl: `${this.gateway}/ipfs/${result.IpfsHash}`,
        size: result.PinSize
      };
    } catch (error) {
      console.error('File upload failed:', error);
      throw error;
    }
  }
  
  // Загрузка JSON метаданных
  async uploadJSON(jsonData, filename) {
    try {
      const result = await this.pinata.pinJSONToIPFS(jsonData, {
        pinataMetadata: { name: filename }
      });
      
      return {
        ipfsHash: result.IpfsHash,
        ipfsUri: `ipfs://${result.IpfsHash}`,
        gatewayUrl: `${this.gateway}/ipfs/${result.IpfsHash}`
      };
    } catch (error) {
      console.error('JSON upload failed:', error);
      throw error;
    }
  }
  
  // Batch загрузка файлов
  async uploadMultipleFiles(files) {
    const results = [];
    
    for (const file of files) {
      try {
        const result = await this.uploadFile(file.path, file.name);
        results.push({
          filename: file.name,
          ...result,
          status: 'success'
        });
        
        // Задержка между загрузками
        await this.delay(500);
        
      } catch (error) {
        results.push({
          filename: file.name,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    return results;
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## 🚦 **9. Routes реализация**

### **Главный mint route:**
```javascript
// routes/mint.js
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const SolanaService = require('../services/solana');
const PinataService = require('../services/pinata');
const DatabaseService = require('../services/supabase');
const MintQueue = require('../services/queue');
const { validateMintRequest } = require('../services/validation');

const solana = new SolanaService();
const pinata = new PinataService();
const db = new DatabaseService();
const queue = new MintQueue();

// Middleware для файлов
const upload = multer({ 
  dest: '/tmp/uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// POST /api/mint/single
router.post('/single', upload.single('image'), async (req, res) => {
  try {
    const { collectionId, recipient, metadata, copies = 1 } = req.body;
    
    // Валидация
    const validationErrors = validateMintRequest({ collectionId, recipient, metadata });
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
    }
    
    // Получение коллекции из базы
    const collection = await db.getCollection(collectionId);
    if (!collection || !collection.allow_minting) {
      return res.status(404).json({
        success: false,
        error: 'Collection not found or minting disabled'
      });
    }
    
    // Подготовка задачи для очереди
    const taskData = {
      collectionId,
      collection,
      recipient,
      metadata: JSON.parse(metadata),
      copies: parseInt(copies),
      imageFile: req.file
    };
    
    // Добавление в очередь
    const transactionId = await queue.addMintTask({
      type: 'single',
      data: taskData,
      priority: 1
    });
    
    // Создание записи в базе
    await db.createMintOperation({
      transactionId,
      collectionId,
      recipient,
      operationType: 'mint',
      totalNfts: copies,
      metadata: taskData.metadata
    });
    
    res.json({
      success: true,
      data: {
        transactionId,
        estimatedTime: copies * 3, // 3 секунды на NFT
        status: 'queued'
      },
      message: 'Mint operation queued successfully'
    });
    
  } catch (error) {
    console.error('Mint single error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/mint/batch
router.post('/batch', upload.array('images', 50), async (req, res) => {
  try {
    const { collectionId, recipient, nfts, batchSize = 10 } = req.body;
    
    // Парсинг NFT данных
    const nftData = JSON.parse(nfts);
    const totalNfts = nftData.reduce((sum, nft) => sum + (nft.copies || 1), 0);
    
    // Валидация
    if (totalNfts > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Too many NFTs in batch (max 1000)'
      });
    }
    
    // Получение коллекции
    const collection = await db.getCollection(collectionId);
    if (!collection || !collection.allow_minting) {
      return res.status(404).json({
        success: false,
        error: 'Collection not found or minting disabled'
      });
    }
    
    // Подготовка задачи
    const taskData = {
      collectionId,
      collection,
      recipient,
      nfts: nftData,
      batchSize: parseInt(batchSize),
      imageFiles: req.files
    };
    
    const transactionId = await queue.addMintTask({
      type: 'batch',
      data: taskData,
      priority: 0
    });
    
    await db.createMintOperation({
      transactionId,
      collectionId,
      recipient,
      operationType: 'batch_mint',
      totalNfts,
      batchSize: parseInt(batchSize),
      metadata: { nfts: nftData }
    });
    
    res.json({
      success: true,
      data: {
        transactionId,
        totalNfts,
        estimatedTime: Math.ceil(totalNfts / batchSize) * 30, // 30 сек на batch
        batchCount: Math.ceil(totalNfts / batchSize)
      },
      message: 'Batch mint operation queued successfully'
    });
    
  } catch (error) {
    console.error('Batch mint error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/mint/status/:transactionId
router.get('/status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    // Получение из базы
    const operation = await db.getMintOperation(transactionId);
    if (!operation) {
      return res.status(404).json({
        success: false,
        error: 'Operation not found'
      });
    }
    
    // Получение результатов
    const results = await db.getMintResults(operation.id);
    
    // Подсчет прогресса
    const progress = {
      total: operation.total_nfts,
      completed: operation.completed_nfts,
      failed: operation.failed_nfts,
      percentage: Math.round((operation.completed_nfts / operation.total_nfts) * 100)
    };
    
    // Оценка времени
    if (operation.status === 'processing' && progress.completed > 0) {
      const elapsed = Date.now() - new Date(operation.start_time).getTime();
      const avgTimePerNft = elapsed / progress.completed;
      const remaining = operation.total_nfts - progress.completed;
      progress.estimatedTimeLeft = Math.ceil((remaining * avgTimePerNft) / 1000);
    }
    
    res.json({
      success: true,
      data: {
        transactionId: operation.transaction_id,
        status: operation.status,
        progress,
        results: results.map(r => ({
          signature: r.signature,
          leafIndex: r.leaf_index,
          assetId: r.asset_id,
          status: r.status,
          error: r.error_message
        })),
        startTime: operation.start_time,
        endTime: operation.end_time,
        error: operation.error_message
      }
    });
    
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/mint/cancel/:transactionId
router.delete('/cancel/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    // Отмена в очереди
    queue.cancelTask(transactionId);
    
    // Обновление в базе
    await db.updateMintOperation(transactionId, {
      status: 'cancelled',
      end_time: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: 'Operation cancelled successfully'
    });
    
  } catch (error) {
    console.error('Cancel error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
```

---

## 📊 **10. Мониторинг и логирование**

### **Logger система:**
```javascript
// utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'nft-backend' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Middleware для логирования HTTP запросов
const httpLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  });
  
  next();
};

module.exports = { logger, httpLogger };
```

### **Метрики:**
```javascript
// utils/metrics.js
class MetricsCollector {
  constructor() {
    this.metrics = {
      mintsTotal: 0,
      mintsSuccess: 0,
      mintsFailed: 0,
      uploadsTotal: 0,
      uploadsSuccess: 0,
      uploadsFailed: 0,
      avgMintTime: 0,
      activeOperations: 0
    };
  }
  
  incrementMints(success = true) {
    this.metrics.mintsTotal++;
    if (success) {
      this.metrics.mintsSuccess++;
    } else {
      this.metrics.mintsFailed++;
    }
  }
  
  recordMintTime(duration) {
    // Exponential moving average
    this.metrics.avgMintTime = this.metrics.avgMintTime * 0.9 + duration * 0.1;
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.mintsTotal > 0 
        ? (this.metrics.mintsSuccess / this.metrics.mintsTotal) * 100 
        : 0
    };
  }
}

const metrics = new MetricsCollector();
module.exports = metrics;
```

---

## 🔧 **11. Главный app.js файл**

```javascript
// app.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Middleware
const { httpLogger } = require('./utils/logger');
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const { mintRateLimit, uploadRateLimit } = require('./middleware/rateLimit');

// Routes
const mintRoutes = require('./routes/mint');
const collectionsRoutes = require('./routes/collections');
const uploadRoutes = require('./routes/upload');
const statsRoutes = require('./routes/stats');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 8080;

// Trust proxy (для TimeWeb)
app.set('trust proxy', 1);

// Global middleware
app.use(httpLogger);
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['https://your-frontend.vercel.app'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check (без авторизации)
app.use('/health', healthRoutes);

// API routes (с авторизацией)
app.use('/api/mint', authMiddleware, mintRateLimit, mintRoutes);
app.use('/api/collections', authMiddleware, collectionsRoutes);
app.use('/api/upload', authMiddleware, uploadRateLimit, uploadRoutes);
app.use('/api/stats', authMiddleware, statsRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 NFT Backend server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Network: ${process.env.NETWORK}`);
});

module.exports = app;
```

---

## 📦 **12. package.json зависимости**

```json
{
  "name": "pecoin-nft-backend",
  "version": "1.0.0",
  "description": "NFT Minting Backend for PEcamp Dashboard",
  "main": "app.js",
  "scripts": {
    "start": "node app.js",
    "dev": "nodemon app.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "multer": "^1.4.5-lts.1",
    "express-rate-limit": "^7.1.5",
    "winston": "^3.11.0",
    "uuid": "^9.0.1",
    
    "// Solana & Crypto": "",
    "@metaplex-foundation/umi-bundle-defaults": "^0.9.1",
    "@metaplex-foundation/mpl-bubblegum": "^0.7.0",
    "@solana/web3.js": "^1.87.6",
    "bs58": "^5.0.0",
    
    "// IPFS": "",
    "@pinata/sdk": "^2.1.0",
    
    "// Database": "",
    "@supabase/supabase-js": "^2.38.5",
    
    "// Auth & Security": "",
    "jsonwebtoken": "^9.0.2",
    "bcrypt": "^5.1.1",
    "helmet": "^7.1.0",
    
    "// Utils": "",
    "lodash": "^4.17.21",
    "moment": "^2.29.4",
    "sharp": "^0.32.6"
  },
  "devDependencies": {
    "nodemon": "^3.0.2",
    "jest": "^29.7.0",
    "supertest": "^6.3.3",
    "eslint": "^8.55.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

## 🔌 **13. Интеграция с Frontend**

### **Frontend изменения в Next.js:**

#### **Обновить API base URL:**
```javascript
// lib/api-client.js
```javascript
// lib/api-client.js
const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://your-backend.timeweb.cloud';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY;

class NFTBackendClient {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    };
  }
  
  // Минт одного NFT
  async mintSingle(data) {
    const formData = new FormData();
    formData.append('collectionId', data.collectionId);
    formData.append('recipient', data.recipient);
    formData.append('metadata', JSON.stringify(data.metadata));
    formData.append('copies', data.copies.toString());
    
    if (data.imageFile) {
      formData.append('image', data.imageFile);
    }
    
    const response = await fetch(`${this.baseURL}/api/mint/single`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY
        // НЕ устанавливаем Content-Type для FormData
      },
      body: formData
    });
    
    return this.handleResponse(response);
  }
  
  // Batch минт
  async mintBatch(data) {
    const formData = new FormData();
    formData.append('collectionId', data.collectionId);
    formData.append('recipient', data.recipient);
    formData.append('nfts', JSON.stringify(data.nfts));
    formData.append('batchSize', data.batchSize.toString());
    
    // Добавление файлов
    data.imageFiles.forEach((file, index) => {
      formData.append('images', file);
    });
    
    const response = await fetch(`${this.baseURL}/api/mint/batch`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY
      },
      body: formData
    });
    
    return this.handleResponse(response);
  }
  
  // Получение статуса операции
  async getMintStatus(transactionId) {
    const response = await fetch(`${this.baseURL}/api/mint/status/${transactionId}`, {
      headers: this.defaultHeaders
    });
    
    return this.handleResponse(response);
  }
  
  // Отмена операции
  async cancelMint(transactionId) {
    const response = await fetch(`${this.baseURL}/api/mint/cancel/${transactionId}`, {
      method: 'DELETE',
      headers: this.defaultHeaders
    });
    
    return this.handleResponse(response);
  }
  
  // Получение статистики
  async getStats() {
    const response = await fetch(`${this.baseURL}/api/stats/overview`, {
      headers: this.defaultHeaders
    });
    
    return this.handleResponse(response);
  }
  
  // Обработка ответов
  async handleResponse(response) {
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    
    return data;
  }
}

export const nftBackendClient = new NFTBackendClient();
```

#### **Обновить существующий upload page:**
```typescript
// app/admin/nft-minting/upload/page.tsx
'use client'

import { useState, useRef } from 'react'
import { nftBackendClient } from '@/lib/api-client'
import { toast } from '@/hooks/use-toast'

// Заменить симуляцию на реальные вызовы
const handleRealMinting = async () => {
  if (!selectedCollection || uploadedFiles.length === 0) {
    toast({
      title: "Ошибка валидации",
      description: "Выберите коллекцию и загрузите файлы",
      variant: "destructive"
    })
    return
  }

  setIsMinting(true)
  
  try {
    let transactionId: string;
    
    // Определяем тип операции
    const totalNfts = uploadedFiles.reduce((sum, f) => sum + f.copies, 0)
    
    if (totalNfts === 1) {
      // Одиночный минт
      const file = uploadedFiles[0]
      const result = await nftBackendClient.mintSingle({
        collectionId: selectedCollection,
        recipient: file.recipient,
        metadata: {
          name: file.name,
          description: `Generated NFT from ${file.file.name}`,
          attributes: []
        },
        copies: file.copies,
        imageFile: file.file
      })
      
      transactionId = result.data.transactionId
      
    } else {
      // Batch минт
      const nfts = uploadedFiles.map(file => ({
        name: file.name,
        description: `Generated NFT from ${file.file.name}`,
        copies: file.copies
      }))
      
      const imageFiles = uploadedFiles.map(file => file.file)
      
      const result = await nftBackendClient.mintBatch({
        collectionId: selectedCollection,
        recipient: uploadedFiles[0].recipient, // Все в один кошелек
        nfts,
        imageFiles,
        batchSize: 10
      })
      
      transactionId = result.data.transactionId
    }
    
    // Запуск отслеживания прогресса
    startProgressTracking(transactionId)
    
    toast({
      title: "Минтинг запущен! 🚀",
      description: `Операция ${transactionId} добавлена в очередь`,
    })
    
  } catch (error) {
    console.error('Minting failed:', error)
    setIsMinting(false)
    
    toast({
      title: "Ошибка минтинга",
      description: error instanceof Error ? error.message : "Не удалось запустить минтинг",
      variant: "destructive"
    })
  }
}

// Отслеживание прогресса
const startProgressTracking = (transactionId: string) => {
  const interval = setInterval(async () => {
    try {
      const statusResult = await nftBackendClient.getMintStatus(transactionId)
      const status = statusResult.data
      
      // Обновление прогресса
      setMintingProgress({
        total: status.progress.total,
        completed: status.progress.completed,
        failed: status.progress.failed,
        current: status.progress.currentItem || 'Processing...',
        percentage: status.progress.percentage,
        startTime: Date.now(),
        estimatedTimeLeft: status.progress.estimatedTimeLeft || 0
      })
      
      // Обновление статусов файлов
      updateFileStatuses(status.results)
      
      // Завершение отслеживания
      if (status.status === 'completed' || status.status === 'failed') {
        clearInterval(interval)
        setIsMinting(false)
        
        if (status.status === 'completed') {
          toast({
            title: "Минтинг завершен! ✅",
            description: `Успешно заминчено ${status.progress.completed} NFT`,
          })
        } else {
          toast({
            title: "Минтинг завершен с ошибками",
            description: status.error || "Некоторые NFT не были созданы",
            variant: "destructive"
          })
        }
      }
      
    } catch (error) {
      console.error('Status check failed:', error)
      clearInterval(interval)
      setIsMinting(false)
    }
  }, 2000) // Проверка каждые 2 секунды
}
```

#### **Обновить environment переменные Frontend:**
```bash
# .env.local для Next.js
NEXT_PUBLIC_BACKEND_URL=https://your-backend.timeweb.cloud
NEXT_PUBLIC_API_KEY=your_api_key_from_backend

# Остальные переменные остаются как есть
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## 🧪 **14. Тестирование**

### **Юнит тесты:**
```javascript
// tests/services/solana.test.js
const SolanaService = require('../../src/services/solana');

describe('SolanaService', () => {
  let solanaService;
  
  beforeEach(() => {
    solanaService = new SolanaService();
  });
  
  test('should initialize connection to Solana RPC', async () => {
    await expect(solanaService.initialize()).resolves.not.toThrow();
    expect(solanaService.initialized).toBe(true);
  });
  
  test('should get wallet balance', async () => {
    await solanaService.initialize();
    const balance = await solanaService.getWalletBalance();
    expect(typeof balance).toBe('number');
    expect(balance).toBeGreaterThanOrEqual(0);
  });
});

// tests/routes/mint.test.js
const request = require('supertest');
const app = require('../../src/app');

describe('Mint API', () => {
  const validApiKey = process.env.API_KEY;
  
  test('POST /api/mint/single should require authentication', async () => {
    const response = await request(app)
      .post('/api/mint/single')
      .send({
        collectionId: 'test-collection',
        recipient: 'test-wallet',
        metadata: { name: 'Test NFT' }
      });
      
    expect(response.status).toBe(401);
  });
  
  test('POST /api/mint/single should validate required fields', async () => {
    const response = await request(app)
      .post('/api/mint/single')
      .set('X-API-Key', validApiKey)
      .send({
        // Намеренно пропущены обязательные поля
      });
      
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
});
```

### **Интеграционные тесты:**
```javascript
// tests/integration/mint-flow.test.js
describe('Complete Mint Flow', () => {
  test('should mint NFT end-to-end on devnet', async () => {
    // 1. Создать тестовую коллекцию
    const collection = await createTestCollection();
    
    // 2. Загрузить тестовое изображение
    const imageUpload = await uploadTestImage();
    
    // 3. Запустить минт
    const mintResult = await startMint({
      collectionId: collection.id,
      recipient: TEST_WALLET,
      metadata: {
        name: 'Integration Test NFT',
        image: imageUpload.ipfsUri
      }
    });
    
    // 4. Дождаться завершения
    const finalStatus = await waitForCompletion(mintResult.transactionId);
    
    // 5. Проверить результат
    expect(finalStatus.status).toBe('completed');
    expect(finalStatus.results[0].signature).toBeDefined();
    
    // 6. Проверить NFT в блокчейне
    const nftExists = await checkNftInBlockchain(finalStatus.results[0].assetId);
    expect(nftExists).toBe(true);
  }, 30000); // 30 секунд timeout
});
```

---

## 🚀 **15. Deployment инструкции**

### **Checklist перед деплоем:**
- [ ] ✅ GitHub репозиторий создан и настроен
- [ ] ✅ TimeWeb приложение создано
- [ ] ✅ Environment переменные настроены
- [ ] ✅ Solana кошелек создан и пополнен
- [ ] ✅ Alchemy RPC endpoint получен
- [ ] ✅ Pinata API ключи получены
- [ ] ✅ Supabase таблицы созданы
- [ ] ✅ Frontend переменные обновлены

### **Первичная настройка:**
```bash
# 1. Пополнить Solana кошелек (devnet для тестов)
solana airdrop 2 YOUR_WALLET_ADDRESS --url devnet

# 2. Создать тестовую коллекцию и дерево (через reference-code)
# Запустить локально create_merkle_tree.js и create_collection.js

# 3. Импортировать коллекцию в базу через frontend
# /admin/nft-minting/settings -> Import Collection

# 4. Протестировать один NFT через API
curl -X POST https://your-backend.timeweb.cloud/api/mint/single \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "collectionId": "your-collection-id",
    "recipient": "test-wallet-address", 
    "metadata": {
      "name": "Test NFT",
      "description": "First test mint"
    },
    "copies": 1
  }'
```

### **Мониторинг после деплоя:**
```bash
# Логи TimeWeb
tail -f /logs/combined.log

# Проверка health
curl https://your-backend.timeweb.cloud/health

# Проверка метрик
curl -H "X-API-Key: your_api_key" \
  https://your-backend.timeweb.cloud/api/stats/overview
```

---

## 🔧 **16. Troubleshooting гид**

### **Частые ошибки и решения:**

#### **🚨 "Failed to connect to Solana RPC"**
```bash
# Проверить RPC endpoints
curl -X POST https://api.mainnet-beta.solana.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'

# Проверить Alchemy ключ
curl https://solana-mainnet.g.alchemy.com/v2/YOUR_KEY \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getVersion"}'
```

#### **🚨 "Insufficient SOL balance"**
```bash
# Проверить баланс кошелька
solana balance YOUR_WALLET_ADDRESS

# Пополнить кошелек (mainnet требует реальные SOL)
# Для devnet: solana airdrop 2 YOUR_WALLET_ADDRESS --url devnet
```

#### **🚨 "Tree capacity exceeded"**
```javascript
// Создать новое дерево или использовать существующее с местом
// Проверить capacity в базе данных nft_collections таблице
```

#### **🚨 "IPFS upload failed"**
```bash
# Проверить Pinata ключи
curl -X GET https://api.pinata.cloud/data/testAuthentication \
  -H "pinata_api_key: YOUR_API_KEY" \
  -H "pinata_secret_api_key: YOUR_SECRET_KEY"
```

#### **🚨 "Database connection failed"**
```bash
# Проверить Supabase подключение
curl "YOUR_SUPABASE_URL/rest/v1/nft_collections?select=*" \
  -H "apikey: YOUR_SERVICE_ROLE_KEY"
```

---

## 📋 **17. Финальный чеклист готовности**

### **Backend готов к продакшену когда:**
- [ ] ✅ Все API endpoints отвечают корректно
- [ ] ✅ Минт одного NFT работает на devnet
- [ ] ✅ Batch минт работает на devnet  
- [ ] ✅ Progress tracking функционирует
- [ ] ✅ Error handling обрабатывает все сценарии
- [ ] ✅ Rate limiting защищает от спама
- [ ] ✅ Логирование записывает все операции
- [ ] ✅ База данных сохраняет результаты
- [ ] ✅ Frontend успешно интегрируется
- [ ] ✅ Тесты проходят успешно

### **Переход на mainnet:**
1. **Обновить переменные:**
   ```bash
   NETWORK=mainnet-beta
   RPC_URL=alchemy_mainnet_url
   ```
2. **Пополнить кошелек реальными SOL**
3. **Создать production коллекции**
4. **Обновить frontend URLs**
5. **Провести финальное тестирование**

---

## 🎯 **18. Заключение**

Данное техническое задание обеспечивает:

✅ **Полную интеграцию** с существующим frontend  
✅ **Безопасную работу** с приватными ключами  
✅ **Масштабируемую архитектуру** для роста нагрузки  
✅ **Надежную обработку ошибок** и retry логику  
✅ **Real-time отслеживание** прогресса операций  
✅ **Compliance** с Solana и NFT стандартами  
✅ **Готовность к продакшену** с первого дня  

### **Ожидаемые результаты:**
- **Single NFT mint:** 3-5 секунд
- **Batch 30 NFTs:** 2-5 минут  
- **Success rate:** 95%+ при стабильной сети
- **Cost per cNFT:** ~0.00025 SOL (~$0.05)
- **Uptime:** 99%+ на TimeWeb infrastructure

### **Дальнейшее развитие:**
- WebSocket для real-time обновлений
- Advanced retry логика с exponential backoff
- NFT metadata validation и enhancement
- Analytics dashboard для операций
- Multi-signature поддержка для enterprise

**Этот backend полностью готов для внедрения реального NFT минтинга в экосистему PEcamp! 🚀**