const express = require('express');
const { 
  apiLimiter, 
  mintLimiter, 
  uploadLimiter, 
  createCollectionLimiter,
  rateLimitLogger,
  getRateLimitInfo 
} = require('../middleware/rateLimiter');

const router = express.Router();

// Применяем базовый rate limiter ко всем API запросам
router.use(apiLimiter);
router.use(rateLimitLogger);

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

// GET /api/rate-limits - информация о лимитах
router.get('/rate-limits', (req, res) => {
  try {
    const rateLimitInfo = getRateLimitInfo(req);
    
    res.json({
      success: true,
      data: rateLimitInfo,
      headers: {
        'X-RateLimit-Limit': res.get('X-RateLimit-Limit'),
        'X-RateLimit-Remaining': res.get('X-RateLimit-Remaining'),
        'X-RateLimit-Reset': res.get('X-RateLimit-Reset')
      }
    });
    
  } catch (error) {
    console.error('[API] Ошибка получения rate limit info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get rate limit info'
    });
  }
});

// Подключаем роутеры
const collectionsRouter = require('./collections');
const uploadRouter = require('./upload');
const mintRouter = require('./mint');

// Применяем специфичные лимитеры к роутам
router.use('/collections', collectionsRouter);
router.use('/mint', mintLimiter, mintRouter); // Строгий лимит для минтинга
router.use('/upload', uploadLimiter, uploadRouter); // Лимит для загрузок

// Дополнительный лимитер для создания коллекций
router.use('/collections', (req, res, next) => {
  if (req.method === 'POST') {
    return createCollectionLimiter(req, res, next);
  }
  next();
});

module.exports = router; 