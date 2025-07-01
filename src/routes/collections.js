const express = require('express');

const router = express.Router();

// Ленивая инициализация CollectionsService
let collectionsService = null;

function getCollectionsService() {
  if (!collectionsService) {
    const CollectionsService = require('../services/collections');
    collectionsService = new CollectionsService();
  }
  return collectionsService;
}

// GET /api/collections - Получить список коллекций
router.get('/', async (req, res) => {
  try {
    const { status, allowMinting, limit, offset } = req.query;
    
    const filters = {};
    if (status) filters.status = status;
    if (allowMinting !== undefined) filters.allowMinting = allowMinting === 'true';
    if (limit) filters.limit = parseInt(limit);
    if (offset) filters.offset = parseInt(offset);
    
    const collectionsService = getCollectionsService();
    const result = await collectionsService.getCollections(filters);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('[Collections API] Ошибка получения коллекций:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

// GET /api/collections/active - Получить только активные коллекции для минтинга
router.get('/active', async (req, res) => {
  try {
    const collectionsService = getCollectionsService();
    const activeCollections = await collectionsService.getActiveCollections();
    
    res.json({
      success: true,
      data: {
        collections: activeCollections,
        total: activeCollections.length
      }
    });
    
  } catch (error) {
    console.error('[Collections API] Ошибка получения активных коллекций:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

// GET /api/collections/:id - Получить конкретную коллекцию
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const collectionsService = getCollectionsService();
    const collection = await collectionsService.getCollection(id);
    
    if (!collection) {
      return res.status(404).json({
        success: false,
        error: 'Коллекция не найдена'
      });
    }
    
    res.json({
      success: true,
      data: collection
    });
    
  } catch (error) {
    console.error('[Collections API] Ошибка получения коллекции:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

// GET /api/collections/:id/mint-check - Проверить возможность минтинга
router.get('/:id/mint-check', async (req, res) => {
  try {
    const { id } = req.params;
    const collectionsService = getCollectionsService();
    const mintCheck = await collectionsService.canMintInCollection(id);
    
    res.json({
      success: true,
      data: mintCheck
    });
    
  } catch (error) {
    console.error('[Collections API] Ошибка проверки минтинга:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

// POST /api/collections - Создать новую коллекцию
router.post('/', async (req, res) => {
  try {
    const collectionData = req.body;
    
    // Валидация обязательных полей
    if (!collectionData.name || !collectionData.symbol) {
      return res.status(400).json({
        success: false,
        error: 'Обязательные поля: name, symbol'
      });
    }
    
    const collectionsService = getCollectionsService();
    const collection = await collectionsService.createCollection(collectionData);
    
    res.status(201).json({
      success: true,
      data: collection,
      message: 'Коллекция создана успешно'
    });
    
  } catch (error) {
    console.error('[Collections API] Ошибка создания коллекции:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

// PUT /api/collections/:id - Обновить коллекцию
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const collectionsService = getCollectionsService();
    const updatedCollection = await collectionsService.updateCollection(id, updates);
    
    if (!updatedCollection) {
      return res.status(404).json({
        success: false,
        error: 'Коллекция не найдена'
      });
    }
    
    res.json({
      success: true,
      data: updatedCollection,
      message: 'Коллекция обновлена успешно'
    });
    
  } catch (error) {
    console.error('[Collections API] Ошибка обновления коллекции:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

module.exports = router; 