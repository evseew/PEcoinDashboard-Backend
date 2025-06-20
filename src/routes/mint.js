const express = require('express');
const { v4: uuidv4 } = require('uuid');
const SolanaService = require('../services/solana');

const router = express.Router();

// Инициализируем Solana service
const solanaService = new SolanaService();

// Хранилище операций минтинга (в продакшене используй Redis/DB)
const mintOperations = new Map();

// Конфигурация по умолчанию (из reference/config.js)
const DEFAULT_CONFIG = {
  treeAddress: process.env.TREE_ADDRESS || "",
  collectionAddress: process.env.COLLECTION_ADDRESS || "",
  defaultRecipient: process.env.DEFAULT_RECIPIENT || "",
  sellerFeeBasisPoints: 0,
  maxRetries: 3
};

// POST /api/mint/single - Минт одного NFT
router.post('/single', async (req, res) => {
  try {
    console.log('[Mint API] Запрос одиночного минтинга:', req.body);
    
    const { 
      recipient, 
      metadata, 
      treeAddress, 
      collectionAddress 
    } = req.body;
    
    // Валидация обязательных полей
    if (!metadata || !metadata.name || !metadata.uri) {
      return res.status(400).json({
        success: false,
        error: 'Отсутствуют обязательные поля: metadata.name и metadata.uri'
      });
    }
    
    // Используем адреса из запроса или дефолтные
    const finalTreeAddress = treeAddress || DEFAULT_CONFIG.treeAddress;
    const finalCollectionAddress = collectionAddress || DEFAULT_CONFIG.collectionAddress;
    const finalRecipient = recipient || DEFAULT_CONFIG.defaultRecipient;
    
    // Проверка адресов Solana
    if (!solanaService.isValidSolanaAddress(finalTreeAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Неверный формат treeAddress'
      });
    }
    
    if (!solanaService.isValidSolanaAddress(finalCollectionAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Неверный формат collectionAddress'
      });
    }
    
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
      recipient: finalRecipient,
      metadata: metadata,
      treeAddress: finalTreeAddress,
      collectionAddress: finalCollectionAddress
    });
    
    // Немедленно возвращаем ID операции (асинхронный процесс)
    res.json({
      success: true,
      data: {
        operationId,
        status: 'processing',
        message: 'Операция минтинга запущена'
      }
    });
    
    // Асинхронное выполнение минтинга
    setImmediate(async () => {
      try {
        const operation = mintOperations.get(operationId);
        
        const result = await solanaService.mintSingleNFT({
          treeAddress: finalTreeAddress,
          collectionAddress: finalCollectionAddress,
          recipient: finalRecipient,
          metadata: {
            ...metadata,
            sellerFeeBasisPoints: metadata.sellerFeeBasisPoints || DEFAULT_CONFIG.sellerFeeBasisPoints
          },
          maxAttempts: DEFAULT_CONFIG.maxRetries
        });
        
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

// POST /api/mint/batch - Пакетный минт NFT
router.post('/batch', async (req, res) => {
  try {
    console.log('[Mint API] Запрос пакетного минтинга:', req.body);
    
    const { 
      items, 
      treeAddress, 
      collectionAddress 
    } = req.body;
    
    // Валидация
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
    
    // Используем адреса из запроса или дефолтные
    const finalTreeAddress = treeAddress || DEFAULT_CONFIG.treeAddress;
    const finalCollectionAddress = collectionAddress || DEFAULT_CONFIG.collectionAddress;
    
    // Проверка адресов
    if (!solanaService.isValidSolanaAddress(finalTreeAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Неверный формат treeAddress'
      });
    }
    
    if (!solanaService.isValidSolanaAddress(finalCollectionAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Неверный формат collectionAddress'
      });
    }
    
    // Генерируем ID операции
    const operationId = uuidv4();
    
    // Создаем запись операции
    mintOperations.set(operationId, {
      id: operationId,
      type: 'batch',
      status: 'processing',
      createdAt: new Date().toISOString(),
      totalItems: items.length,
      processedItems: 0,
      successfulItems: 0,
      failedItems: 0,
      items: items.map((item, index) => ({
        index,
        recipient: item.recipient || DEFAULT_CONFIG.defaultRecipient,
        metadata: item.metadata,
        status: 'pending'
      })),
      treeAddress: finalTreeAddress,
      collectionAddress: finalCollectionAddress
    });
    
    // Немедленно возвращаем ID операции
    res.json({
      success: true,
      data: {
        operationId,
        status: 'processing',
        totalItems: items.length,
        message: 'Пакетная операция минтинга запущена'
      }
    });
    
    // Асинхронное выполнение пакетного минтинга
    setImmediate(async () => {
      let operation = mintOperations.get(operationId);
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const finalRecipient = item.recipient || DEFAULT_CONFIG.defaultRecipient;
        
        try {
          console.log(`[Mint API] Пакет ${operationId}: обработка элемента ${i + 1}/${items.length}`);
          
          const result = await solanaService.mintSingleNFT({
            treeAddress: finalTreeAddress,
            collectionAddress: finalCollectionAddress,
            recipient: finalRecipient,
            metadata: {
              ...item.metadata,
              sellerFeeBasisPoints: item.metadata.sellerFeeBasisPoints || DEFAULT_CONFIG.sellerFeeBasisPoints
            },
            maxAttempts: DEFAULT_CONFIG.maxRetries
          });
          
          // Обновляем статус элемента
          operation = mintOperations.get(operationId);
          operation.items[i].status = 'completed';
          operation.items[i].result = result;
          operation.successfulItems++;
          
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
    const { status, type, limit = 50 } = req.query;
    
    let operations = Array.from(mintOperations.values());
    
    // Фильтрация по статусу
    if (status) {
      operations = operations.filter(op => op.status === status);
    }
    
    // Фильтрация по типу
    if (type) {
      operations = operations.filter(op => op.type === type);
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