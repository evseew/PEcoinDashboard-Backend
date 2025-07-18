const express = require('express');
const { v4: uuidv4 } = require('uuid');
const bs58 = require("bs58");

const router = express.Router();

// Хранилище операций минтинга (в продакшене используй Redis/DB)
const mintOperations = new Map();

// Ленивая инициализация сервисов
let solanaService = null;
let collectionsService = null;
let databaseService = null;
let indexingMonitor = null; // ✅ НОВОЕ

function getSolanaService() {
  if (!solanaService) {
    const SolanaService = require('../services/solana');
    solanaService = new SolanaService();
  }
  return solanaService;
}

function getCollectionsService() {
  if (!collectionsService) {
    const { CollectionsService } = require('../services/collections');
    collectionsService = new CollectionsService();
  }
  return collectionsService;
}

function getDatabaseService() {
  if (!databaseService) {
    const { DatabaseService } = require('../services/database');
    databaseService = new DatabaseService();
  }
  return databaseService;
}

// ✅ НОВАЯ ФУНКЦИЯ для получения indexing monitor
function getIndexingMonitor() {
  if (!indexingMonitor) {
    const { getIndexingMonitor: createMonitor } = require('../services/indexing-monitor');
    indexingMonitor = createMonitor();
  }
  return indexingMonitor;
}

// Конфигурация по умолчанию (из reference/config.js)
const DEFAULT_CONFIG = {
  treeAddress: process.env.TREE_ADDRESS || "",
  collectionAddress: process.env.COLLECTION_ADDRESS || "",
  defaultRecipient: process.env.DEFAULT_RECIPIENT || "",
  sellerFeeBasisPoints: 0,
  maxRetries: 3
};

// POST /api/mint/single - Минт одного NFT в выбранной коллекции
router.post('/single', async (req, res) => {
  try {
    console.log('[Mint API] Запрос одиночного минтинга:', req.body);
    
    const { 
      collection,    // 🔄 ИЗМЕНЕНИЕ: теперь принимаем полный объект коллекции
      recipient, 
      metadata
    } = req.body;
    
    // Валидация обязательных полей
    if (!collection || !collection.id || !collection.name) {
      return res.status(400).json({
        success: false,
        error: 'Обязательные поля: collection.id, collection.name'
      });
    }

    if (!metadata || !metadata.name || !metadata.uri) {
      return res.status(400).json({
        success: false,
        error: 'Отсутствуют обязательные поля: metadata.name и metadata.uri'
      });
    }

    // Валидация адресов блокчейна в коллекции
    if (!collection.treeAddress || !collection.collectionAddress) {
      return res.status(400).json({
        success: false,
        error: 'В коллекции отсутствуют обязательные адреса: treeAddress, collectionAddress'
      });
    }

    // Инициализируем только Solana сервис (Collections Service больше не нужен)
    const solanaService = getSolanaService();
    
    // Валидация адресов Solana
    if (!solanaService.isValidSolanaAddress(collection.treeAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Неверный формат treeAddress'
      });
    }

    if (!solanaService.isValidSolanaAddress(collection.collectionAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Неверный формат collectionAddress'
      });
    }
    
    // Получаем адреса из переданной коллекции
    const finalRecipient = recipient || process.env.DEFAULT_RECIPIENT;
    
    // Проверка адреса получателя
    if (!solanaService.isValidSolanaAddress(finalRecipient)) {
      return res.status(400).json({
        success: false,
        error: 'Неверный формат recipient адреса'
      });
    }
    
    // Генерируем ID операции
    const operationId = uuidv4();
    
    // Создаем запись операции с данными из переданной коллекции
    const operationData = {
      id: operationId,
      type: 'single',
      status: 'processing',
      createdAt: new Date().toISOString(),
      collectionId: collection.id,
      collection: {
        name: collection.name,
        symbol: collection.symbol || 'cNFT'
      },
      recipient: finalRecipient,
      metadata: metadata
    };
    
    mintOperations.set(operationId, operationData);
    
    // Сохраняем в базу данных для персистентности
    const databaseService = getDatabaseService();
    await databaseService.saveMintOperation(operationData);
    
    // Немедленно возвращаем ID операции (асинхронный процесс)
    res.json({
      success: true,
      data: {
        operationId,
        status: 'processing',
        collectionId: collection.id,
        collectionName: collection.name,
        message: 'Операция минтинга запущена'
      }
    });
    
    // Асинхронное выполнение минтинга
    setImmediate(async () => {
      try {
        const operation = mintOperations.get(operationId);
        
        // Собираем метаданные с учетом настроек коллекции
        const finalMetadata = {
          ...metadata,
          symbol: metadata.symbol || collection.symbol || 'cNFT',
          sellerFeeBasisPoints: metadata.sellerFeeBasisPoints !== undefined 
            ? metadata.sellerFeeBasisPoints 
            : (collection.sellerFeeBasisPoints || 0),
          // 🔥 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: используем creators из коллекции если не переданы
          creators: metadata.creators || metadata.properties?.creators || [
            {
              address: collection.creatorAddress || process.env.DEFAULT_CREATOR_ADDRESS || process.env.DEFAULT_RECIPIENT,
              share: 100,
              verified: true
            }
          ]
        };
        
        console.log('[Mint API] 🔍 ДИАГНОСТИКА метаданных:', {
          originalMetadata: metadata,
          finalMetadata,
          hasCreators: !!finalMetadata.creators,
          creatorsCount: finalMetadata.creators?.length || 0,
          collectionData: {
            id: collection.id,
            name: collection.name,
            treeAddress: collection.treeAddress,
            collectionAddress: collection.collectionAddress
          }
        });
        
        const result = await solanaService.mintSingleNFT({
          treeAddress: collection.treeAddress,
          collectionAddress: collection.collectionAddress,
          recipient: finalRecipient,
          metadata: finalMetadata,
          maxAttempts: 3
        });
        
        // 🔄 ИЗМЕНЕНИЕ: Если нужно, можем обновить статистику коллекции локально
        // Но не будем зависеть от Collections Service и Supabase
        console.log(`[Mint API] ✅ NFT успешно заминтен в коллекции ${collection.name}`);
        
        // Обновляем статус операции
        const updatedOperation = {
          ...operation,
          status: 'completed',
          completedAt: new Date().toISOString(),
          result: result
        };

        mintOperations.set(operationId, updatedOperation);

        // ✅ НОВОЕ: Автоматический запуск мониторинга DAS индексации
        if (result.success && result.assetId) {
          console.log(`[Mint API] 🔍 Запускаем автоматический мониторинг DAS индексации для ${result.assetId}`);
          
          const monitor = getIndexingMonitor();
          
          // Запускаем мониторинг с метаданными NFT
          monitor.startMonitoring(operationId, result.assetId, {
            treeAddress: collection.treeAddress,
            leafIndex: result.leafIndex,
            collection: collection.name,
            nftName: finalMetadata.name,
            signature: result.signature,
            recipient: finalRecipient
          });

          // Обновляем операцию с информацией о мониторинге
          updatedOperation.monitoringStarted = true;
          updatedOperation.monitoringStartedAt = new Date().toISOString();
          mintOperations.set(operationId, updatedOperation);
        } else {
          console.warn(`[Mint API] ⚠️ Мониторинг не запущен: ${!result.success ? 'минт неуспешен' : 'нет assetId'}`);
        }

        // Обновляем в базе данных
        const databaseService = getDatabaseService();
        await databaseService.updateMintOperation(operationId, {
          status: 'completed',
          completedAt: updatedOperation.completedAt,
          result: result,
          monitoringStarted: updatedOperation.monitoringStarted || false
        });
        
        console.log(`[Mint API] Операция ${operationId} завершена успешно`);
        
      } catch (error) {
        console.error(`[Mint API] Ошибка операции ${operationId}:`, error.message);
        
        const operation = mintOperations.get(operationId);
        const failedOperation = {
          ...operation,
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: error.message
        };
        
        mintOperations.set(operationId, failedOperation);
        
        // Обновляем в базе данных
        const databaseService = getDatabaseService();
        await databaseService.updateMintOperation(operationId, {
          status: 'failed',
          completedAt: failedOperation.completedAt,
          error: error.message
        });
      }
    });
    
  } catch (error) {
    console.error('[Mint API] Ошибка обработки запроса:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера',
      details: error.message
    });
  }
});

// POST /api/mint/batch - Пакетный минт NFT в коллекции
router.post('/batch', async (req, res) => {
  try {
    console.log('[Mint API] Запрос пакетного минтинга:', req.body);
    
    const { 
      collectionId,  // ID коллекции
      items
    } = req.body;
    
    // Валидация
    if (!collectionId) {
      return res.status(400).json({
        success: false,
        error: 'Обязательное поле: collectionId'
      });
    }
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Поле items должно быть непустым массивом'
      });
    }
    
    if (items.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Максимальное количество NFT в пакете: 50'
      });
    }
    
    // Инициализируем сервисы только при необходимости
    const collectionsService = getCollectionsService();
    const solanaService = getSolanaService();
    
    // Получаем данные коллекции
    const collection = await collectionsService.getCollection(collectionId);
    if (!collection) {
      return res.status(404).json({
        success: false,
        error: `Коллекция ${collectionId} не найдена`
      });
    }
    
    // Проверяем возможность минтинга
    const mintCheck = await collectionsService.canMintInCollection(collectionId);
    if (!mintCheck.canMint) {
      return res.status(400).json({
        success: false,
        error: `Минтинг невозможен: ${mintCheck.reason}`
      });
    }
    
    // Проверяем каждый элемент
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.metadata || !item.metadata.name || !item.metadata.uri) {
        return res.status(400).json({
          success: false,
          error: `Элемент ${i}: отсутствуют обязательные поля metadata.name и metadata.uri`
        });
      }
    }
    
    // Генерируем ID операции
    const operationId = uuidv4();
    
    // Создаем запись операции
    mintOperations.set(operationId, {
      id: operationId,
      type: 'batch',
      status: 'processing',
      createdAt: new Date().toISOString(),
      collectionId: collectionId,
      collection: {
        name: collection.name,
        symbol: collection.symbol
      },
      totalItems: items.length,
      processedItems: 0,
      successfulItems: 0,
      failedItems: 0,
      items: items.map((item, index) => ({
        index,
        recipient: item.recipient || process.env.DEFAULT_RECIPIENT,
        metadata: item.metadata,
        status: 'pending'
      }))
    });
    
    // Немедленно возвращаем ID операции
    res.json({
      success: true,
      data: {
        operationId,
        status: 'processing',
        collectionId,
        collectionName: collection.name,
        totalItems: items.length,
        message: 'Пакетная операция минтинга запущена'
      }
    });
    
    // Асинхронное выполнение пакетного минтинга
    setImmediate(async () => {
      let operation = mintOperations.get(operationId);
      let successCount = 0;
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const finalRecipient = item.recipient || process.env.DEFAULT_RECIPIENT;
        
        try {
          console.log(`[Mint API] Пакет ${operationId}: обработка элемента ${i + 1}/${items.length}`);
          
          // Собираем метаданные с учетом настроек коллекции
          const finalMetadata = {
            ...item.metadata,
            symbol: item.metadata.symbol || collection.symbol,
            sellerFeeBasisPoints: item.metadata.sellerFeeBasisPoints !== undefined 
              ? item.metadata.sellerFeeBasisPoints 
              : collection.metadata.sellerFeeBasisPoints,
            // 🔥 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: используем creators из коллекции если не переданы
            creators: item.metadata.creators || item.metadata.properties?.creators || [
              {
                address: process.env.DEFAULT_CREATOR_ADDRESS || process.env.DEFAULT_RECIPIENT,
                share: 100,
                verified: true
              }
            ]
          };
          
          const result = await solanaService.mintSingleNFT({
            treeAddress: collection.treeAddress,
            collectionAddress: collection.collectionAddress,
            recipient: finalRecipient,
            metadata: finalMetadata,
            maxAttempts: 3
          });
          
          // Обновляем статус элемента
          operation = mintOperations.get(operationId);
          operation.items[i].status = 'completed';
          operation.items[i].result = result;
          operation.successfulItems++;
          successCount++;
          
        } catch (error) {
          console.error(`[Mint API] Ошибка элемента ${i} в пакете ${operationId}:`, error.message);
          
          // Обновляем статус элемента
          operation = mintOperations.get(operationId);
          operation.items[i].status = 'failed';
          operation.items[i].error = error.message;
          operation.failedItems++;
        }
        
        // Обновляем общий прогресс
        operation.processedItems++;
        mintOperations.set(operationId, operation);
        
        // Пауза между минтами для стабильности (из reference)
        if (i < items.length - 1) {
          await solanaService.sleep(2000);
        }
      }
      
      // Обновляем статистику коллекции
      await collectionsService.updateMintStats(collectionId, successCount);
      
      // Финализируем операцию
      operation = mintOperations.get(operationId);
      operation.status = 'completed';
      operation.completedAt = new Date().toISOString();
      mintOperations.set(operationId, operation);
      
      console.log(`[Mint API] Пакетная операция ${operationId} завершена. Успешно: ${operation.successfulItems}, Ошибок: ${operation.failedItems}`);
    });
    
  } catch (error) {
    console.error('[Mint API] Ошибка пакетного запроса:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера',
      details: error.message
    });
  }
});

// GET /api/mint/status/:id - Проверка статуса операции
router.get('/status/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const operation = mintOperations.get(id);
    
    if (!operation) {
      return res.status(404).json({
        success: false,
        error: 'Операция не найдена'
      });
    }
    
    // Подготавливаем ответ в зависимости от типа операции
    if (operation.type === 'single') {
      res.json({
        success: true,
        data: {
          operationId: operation.id,
          type: operation.type,
          status: operation.status,
          createdAt: operation.createdAt,
          completedAt: operation.completedAt,
          collectionId: operation.collectionId,
          collection: operation.collection,
          recipient: operation.recipient,
          metadata: operation.metadata,
          result: operation.result,
          error: operation.error
        }
      });
    } else if (operation.type === 'batch') {
      res.json({
        success: true,
        data: {
          operationId: operation.id,
          type: operation.type,
          status: operation.status,
          createdAt: operation.createdAt,
          completedAt: operation.completedAt,
          collectionId: operation.collectionId,
          collection: operation.collection,
          totalItems: operation.totalItems,
          processedItems: operation.processedItems,
          successfulItems: operation.successfulItems,
          failedItems: operation.failedItems,
          progress: operation.totalItems > 0 ? (operation.processedItems / operation.totalItems * 100).toFixed(2) : 0,
          items: operation.items
        }
      });
    }
    
  } catch (error) {
    console.error('[Mint API] Ошибка получения статуса:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

// GET /api/mint/operations - Список всех операций
router.get('/operations', async (req, res) => {
  try {
    const { status, type, collectionId, limit = 50 } = req.query;
    
    const databaseService = getDatabaseService();
    
    // Пытаемся получить данные из базы данных
    const dbResult = await databaseService.getMintOperations({
      status,
      type,
      collectionId,
      limit: parseInt(limit)
    });
    
    let operations = [];
    let total = 0;
    
    if (dbResult.success && dbResult.data && dbResult.data.length > 0) {
      // Используем данные из базы
      operations = dbResult.data;
      total = dbResult.total || operations.length;
      console.log(`[Mint API] Загружено ${operations.length} операций из базы данных`);
    } else {
      // Fallback на данные из памяти
      operations = Array.from(mintOperations.values());
      
      // Фильтрация по статусу
      if (status) {
        operations = operations.filter(op => op.status === status);
      }
      
      // Фильтрация по типу
      if (type) {
        operations = operations.filter(op => op.type === type);
      }
      
      // Фильтрация по коллекции
      if (collectionId) {
        operations = operations.filter(op => op.collectionId === collectionId);
      }
      
      // Сортировка по дате создания (новые первыми)
      operations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      // Лимит
      operations = operations.slice(0, parseInt(limit));
      total = mintOperations.size;
      
      console.log(`[Mint API] Использованы данные из памяти: ${operations.length} операций`);
    }
    
    // Подготавливаем краткий список с основными данными
    const summary = operations.map(op => ({
      operationId: op.id,
      type: op.type,
      status: op.status,
      createdAt: op.createdAt,
      completedAt: op.completedAt,
      collectionId: op.collectionId,
      collection: op.collection,
      recipient: op.recipient || null,
      metadata: op.metadata || null,
      result: op.result || null,
      error: op.error || null,
      ...(op.type === 'batch' && {
        totalItems: op.totalItems,
        processedItems: op.processedItems,
        successfulItems: op.successfulItems,
        failedItems: op.failedItems
      })
    }));
    
    res.json({
      success: true,
      data: {
        operations: summary,
        total: total
      }
    });
    
  } catch (error) {
    console.error('[Mint API] Ошибка получения списка операций:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

// GET /api/mint/das-status/:assetId - Проверка DAS индексации NFT
router.get('/das-status/:assetId', async (req, res) => {
  try {
    const { assetId } = req.params;
    
    if (!assetId) {
      return res.status(400).json({
        success: false,
        error: 'Asset ID обязателен'
      });
    }

    console.log(`[Mint API] Проверка DAS статуса для asset: ${assetId}`);
    
    const solanaService = getSolanaService();
    
    // Выполняем DAS диагностику
    const dasStatus = await solanaService.checkDASIndexing(assetId, 3, 2000); // Быстрая проверка
    
    // Получаем asset proof
    const proofStatus = await solanaService.getAssetProofFromDAS(assetId);
    
    const response = {
      success: true,
      data: {
        assetId,
        indexed: dasStatus.indexed,
        phantomReady: dasStatus.indexed && proofStatus.success,
        indexingTime: dasStatus.totalTime || null,
        proofAvailable: proofStatus.success,
        recommendations: [],
        timestamp: new Date().toISOString()
      }
    };
    
    // Добавляем рекомендации
    if (!dasStatus.indexed) {
      response.data.recommendations.push('NFT еще индексируется, подождите 15-30 минут');
      response.data.recommendations.push('Техническая транзакция успешна, но NFT может не отображаться в кошельке');
    }
    
    if (!proofStatus.success && dasStatus.indexed) {
      response.data.recommendations.push('Asset проиндексирован, но proof недоступен - обратитесь к администратору');
    }
    
    if (dasStatus.indexed && proofStatus.success) {
      response.data.recommendations.push('NFT полностью готов и должен отображаться в Phantom Wallet');
    }
    
    console.log(`[Mint API] DAS статус для ${assetId}:`, {
      indexed: response.data.indexed,
      phantomReady: response.data.phantomReady
    });
    
    res.json(response);
    
  } catch (error) {
    console.error('[Mint API] Ошибка проверки DAS статуса:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка проверки DAS статуса',
      details: error.message
    });
  }
});

// POST /api/mint/recheck-indexing - Принудительная перепроверка индексации
router.post('/recheck-indexing', async (req, res) => {
  try {
    const { assetId, operationId } = req.body;
    
    if (!assetId) {
      return res.status(400).json({
        success: false,
        error: 'Asset ID обязателен'
      });
    }

    console.log(`[Mint API] Принудительная перепроверка индексации для: ${assetId}`);
    
    const solanaService = getSolanaService();
    
    // Полная диагностика с ожиданием
    const fullDiagnostics = await solanaService.performCompressedNFTDiagnostics(
      assetId, 
      req.body.treeAddress, 
      req.body.leafIndex
    );
    
    // Если есть operationId, обновляем операцию
    if (operationId && mintOperations.has(operationId)) {
      const operation = mintOperations.get(operationId);
      
      const updatedOperation = {
        ...operation,
        dasStatus: fullDiagnostics,
        phantomReady: fullDiagnostics.summary?.phantomReady || false,
        lastChecked: new Date().toISOString()
      };
      
      mintOperations.set(operationId, updatedOperation);
      
      // Обновляем в базе данных
      const databaseService = getDatabaseService();
      await databaseService.updateMintOperation(operationId, {
        dasStatus: fullDiagnostics,
        phantomReady: fullDiagnostics.summary?.phantomReady || false
      });
    }
    
    res.json({
      success: true,
      data: {
        assetId,
        diagnostics: fullDiagnostics,
        operationUpdated: !!operationId,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('[Mint API] Ошибка перепроверки индексации:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка перепроверки индексации',
      details: error.message
    });
  }
});

// ✅ НОВЫЕ ENDPOINTS для управления мониторингом

// GET /api/mint/monitoring/stats - Статистика мониторинга
router.get('/monitoring/stats', async (req, res) => {
  try {
    const monitor = getIndexingMonitor();
    const stats = monitor.getMonitoringStats();
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('[Mint API] Ошибка получения статистики мониторинга:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения статистики мониторинга',
      details: error.message
    });
  }
});

// GET /api/mint/monitoring/active - Все активные операции мониторинга
router.get('/monitoring/active', async (req, res) => {
  try {
    const monitor = getIndexingMonitor();
    const activeOperations = monitor.getActiveOperations();
    
    res.json({
      success: true,
      data: {
        total: activeOperations.length,
        operations: activeOperations
      }
    });
    
  } catch (error) {
    console.error('[Mint API] Ошибка получения активных операций:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения активных операций',
      details: error.message
    });
  }
});

// GET /api/mint/monitoring/:operationId - Статус мониторинга конкретной операции
router.get('/monitoring/:operationId', async (req, res) => {
  try {
    const { operationId } = req.params;
    const monitor = getIndexingMonitor();
    
    const status = monitor.getOperationStatus(operationId);
    
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Операция мониторинга не найдена'
      });
    }
    
    res.json({
      success: true,
      data: status
    });
    
  } catch (error) {
    console.error('[Mint API] Ошибка получения статуса мониторинга:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения статуса мониторинга',
      details: error.message
    });
  }
});

// POST /api/mint/monitoring/:operationId/stop - Остановка мониторинга операции
router.post('/monitoring/:operationId/stop', async (req, res) => {
  try {
    const { operationId } = req.params;
    const { reason = 'manual' } = req.body;
    
    const monitor = getIndexingMonitor();
    const stopped = monitor.stopMonitoring(operationId, reason);
    
    if (!stopped) {
      return res.status(404).json({
        success: false,
        error: 'Операция мониторинга не найдена или уже остановлена'
      });
    }
    
    res.json({
      success: true,
      data: {
        operationId,
        stopped: true,
        reason
      }
    });
    
  } catch (error) {
    console.error('[Mint API] Ошибка остановки мониторинга:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка остановки мониторинга',
      details: error.message
    });
  }
});

// ✅ НОВЫЕ WEBHOOK ENDPOINTS

// POST /api/mint/webhooks - Регистрация webhook
router.post('/webhooks', async (req, res) => {
  try {
    const { url, events, headers, secret } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL webhook обязателен'
      });
    }

    const monitor = getIndexingMonitor();
    const webhookNotifier = monitor.webhookNotifier;
    
    if (!webhookNotifier) {
      return res.status(503).json({
        success: false,
        error: 'Webhook система недоступна'
      });
    }

    const webhookId = require('crypto').randomUUID();
    const webhook = webhookNotifier.registerWebhook(webhookId, {
      url,
      events: events || ['indexingCompleted', 'indexingTimeout', 'indexingError'],
      headers: headers || {},
      secret
    });
    
    res.json({
      success: true,
      data: webhook
    });
    
  } catch (error) {
    console.error('[Mint API] Ошибка регистрации webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка регистрации webhook',
      details: error.message
    });
  }
});

// GET /api/mint/webhooks - Список webhooks
router.get('/webhooks', async (req, res) => {
  try {
    const monitor = getIndexingMonitor();
    const webhookNotifier = monitor.webhookNotifier;
    
    if (!webhookNotifier) {
      return res.status(503).json({
        success: false,
        error: 'Webhook система недоступна'
      });
    }

    const stats = webhookNotifier.getWebhookStats();
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('[Mint API] Ошибка получения webhooks:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения webhooks',
      details: error.message
    });
  }
});

// DELETE /api/mint/webhooks/:id - Удаление webhook
router.delete('/webhooks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const monitor = getIndexingMonitor();
    const webhookNotifier = monitor.webhookNotifier;
    
    if (!webhookNotifier) {
      return res.status(503).json({
        success: false,
        error: 'Webhook система недоступна'
      });
    }

    const removed = webhookNotifier.unregisterWebhook(id);
    
    if (!removed) {
      return res.status(404).json({
        success: false,
        error: 'Webhook не найден'
      });
    }
    
    res.json({
      success: true,
      data: {
        id,
        removed: true
      }
    });
    
  } catch (error) {
    console.error('[Mint API] Ошибка удаления webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка удаления webhook',
      details: error.message
    });
  }
});

// POST /api/mint/webhooks/:id/test - Тестирование webhook
router.post('/webhooks/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    
    const monitor = getIndexingMonitor();
    const webhookNotifier = monitor.webhookNotifier;
    
    if (!webhookNotifier) {
      return res.status(503).json({
        success: false,
        error: 'Webhook система недоступна'
      });
    }

    const result = await webhookNotifier.testWebhook(id);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('[Mint API] Ошибка тестирования webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка тестирования webhook',
      details: error.message
    });
  }
});

module.exports = router; 