const express = require('express');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Хранилище операций минтинга (в продакшене используй Redis/DB)
const mintOperations = new Map();

// Ленивая инициализация сервисов
let solanaService = null;
let collectionsService = null;

function getSolanaService() {
  if (!solanaService) {
    const SolanaService = require('../services/solana');
    solanaService = new SolanaService();
  }
  return solanaService;
}

function getCollectionsService() {
  if (!collectionsService) {
    const CollectionsService = require('../services/collections');
    collectionsService = new CollectionsService();
  }
  return collectionsService;
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
      collectionId,  // ID коллекции вместо адресов
      recipient, 
      metadata
    } = req.body;
    
    // Валидация обязательных полей
    if (!collectionId) {
      return res.status(400).json({
        success: false,
        error: 'Обязательное поле: collectionId'
      });
    }
    
    if (!metadata || !metadata.name || !metadata.uri) {
      return res.status(400).json({
        success: false,
        error: 'Отсутствуют обязательные поля: metadata.name и metadata.uri'
      });
    }
    
    // Инициализируем сервисы только при необходимости
    const collectionsService = getCollectionsService();
    const solanaService = getSolanaService();
    
    // Получаем данные коллекции
    const collection = collectionsService.getCollection(collectionId);
    if (!collection) {
      return res.status(404).json({
        success: false,
        error: `Коллекция ${collectionId} не найдена`
      });
    }
    
    // Проверяем возможность минтинга
    const mintCheck = collectionsService.canMintInCollection(collectionId);
    if (!mintCheck.canMint) {
      return res.status(400).json({
        success: false,
        error: `Минтинг невозможен: ${mintCheck.reason}`
      });
    }
    
    // Получаем адреса из коллекции
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
    
    // Создаем запись операции
    mintOperations.set(operationId, {
      id: operationId,
      type: 'single',
      status: 'processing',
      createdAt: new Date().toISOString(),
      collectionId: collectionId,
      collection: {
        name: collection.name,
        symbol: collection.symbol
      },
      recipient: finalRecipient,
      metadata: metadata
    });
    
    // Немедленно возвращаем ID операции (асинхронный процесс)
    res.json({
      success: true,
      data: {
        operationId,
        status: 'processing',
        collectionId,
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
          symbol: metadata.symbol || collection.symbol,
          sellerFeeBasisPoints: metadata.sellerFeeBasisPoints !== undefined 
            ? metadata.sellerFeeBasisPoints 
            : collection.metadata.sellerFeeBasisPoints
        };
        
        const result = await solanaService.mintSingleNFT({
          treeAddress: collection.treeAddress,
          collectionAddress: collection.collectionAddress,
          recipient: finalRecipient,
          metadata: finalMetadata,
          maxAttempts: 3
        });
        
        // Обновляем статистику коллекции
        collectionsService.updateMintStats(collectionId, 1);
        
        // Обновляем статус операции
        mintOperations.set(operationId, {
          ...operation,
          status: 'completed',
          completedAt: new Date().toISOString(),
          result: result
        });
        
        console.log(`[Mint API] Операция ${operationId} завершена успешно`);
        
      } catch (error) {
        console.error(`[Mint API] Ошибка операции ${operationId}:`, error.message);
        
        const operation = mintOperations.get(operationId);
        mintOperations.set(operationId, {
          ...operation,
          status: 'failed',
          completedAt: new Date().toISOString(),
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
    const collection = collectionsService.getCollection(collectionId);
    if (!collection) {
      return res.status(404).json({
        success: false,
        error: `Коллекция ${collectionId} не найдена`
      });
    }
    
    // Проверяем возможность минтинга
    const mintCheck = collectionsService.canMintInCollection(collectionId);
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
              : collection.metadata.sellerFeeBasisPoints
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
      collectionsService.updateMintStats(collectionId, successCount);
      
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
router.get('/operations', (req, res) => {
  try {
    const { status, type, collectionId, limit = 50 } = req.query;
    
    let operations = Array.from(mintOperations.values());
    
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
    
    // Убираем подробности для краткого списка
    const summary = operations.map(op => ({
      operationId: op.id,
      type: op.type,
      status: op.status,
      createdAt: op.createdAt,
      completedAt: op.completedAt,
      collectionId: op.collectionId,
      collection: op.collection,
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
        total: mintOperations.size
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

module.exports = router; 