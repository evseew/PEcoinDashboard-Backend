const express = require('express');
const router = express.Router();

// GET /api/collections - Список коллекций
router.get('/', async (req, res) => {
  try {
    const { status, allowMinting, page = 1, limit = 10 } = req.query;
    
    // Временные данные для тестирования (потом заменим на Supabase)
    const mockCollections = [
      {
        id: "test-collection-1",
        name: "PEcamp Genesis",
        description: "First NFT collection from PEcamp ecosystem",
        symbol: "PEGEN",
        treeAddress: "11111111111111111111111111111111",
        collectionAddress: "22222222222222222222222222222222",
        creatorAddress: "33333333333333333333333333333333",
        capacity: 1000,
        minted: 0,
        imageUrl: "https://example.com/collection.png",
        externalUrl: "https://pecamp.ru",
        hasValidTree: true,
        supportsDAS: true,
        status: "active",
        isPublic: true,
        allowMinting: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    
    // Фильтрация по параметрам
    let filteredCollections = mockCollections;
    
    if (status) {
      filteredCollections = filteredCollections.filter(c => c.status === status);
    }
    
    if (allowMinting !== undefined) {
      const allowMintingBool = allowMinting === 'true';
      filteredCollections = filteredCollections.filter(c => c.allowMinting === allowMintingBool);
    }
    
    // Пагинация
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedCollections = filteredCollections.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: {
        collections: paginatedCollections,
        pagination: {
          total: filteredCollections.length,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(filteredCollections.length / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('Collections list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch collections',
      message: error.message
    });
  }
});

// GET /api/collections/:id - Получить коллекцию по ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Временные данные (потом заменим на Supabase запрос)
    if (id === 'test-collection-1') {
      const collection = {
        id: "test-collection-1",
        name: "PEcamp Genesis",
        description: "First NFT collection from PEcamp ecosystem",
        symbol: "PEGEN",
        treeAddress: "11111111111111111111111111111111",
        collectionAddress: "22222222222222222222222222222222",
        creatorAddress: "33333333333333333333333333333333",
        capacity: 1000,
        minted: 0,
        imageUrl: "https://example.com/collection.png",
        externalUrl: "https://pecamp.ru",
        hasValidTree: true,
        supportsDAS: true,
        status: "active",
        isPublic: true,
        allowMinting: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      return res.json({
        success: true,
        data: { collection }
      });
    }
    
    res.status(404).json({
      success: false,
      error: 'Collection not found'
    });
    
  } catch (error) {
    console.error('Collection get error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch collection',
      message: error.message
    });
  }
});

module.exports = router; 