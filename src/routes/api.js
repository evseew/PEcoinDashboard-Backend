const express = require('express');
const collectionsRouter = require('./collections');
const uploadRouter = require('./upload');
const mintRouter = require('./mint');

const router = express.Router();

// Health check для API
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'PEcamp NFT Backend API',
    version: '1.0.0',
    endpoints: {
      collections: '/api/collections',
      upload: '/api/upload',
      mint: '/api/mint'
    }
  });
});

// Test endpoint для проверки
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working!',
    data: {
      server: 'Express.js',
      platform: 'TimeWeb',
      blockchain: 'Solana',
      authenticated: true,
      multiCollections: true
    }
  });
});

// Подключаем роутеры
router.use('/collections', collectionsRouter);
router.use('/upload', uploadRouter);
router.use('/mint', mintRouter);

module.exports = router; 