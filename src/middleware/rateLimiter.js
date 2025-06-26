const rateLimit = require('express-rate-limit');

// Базовый лимитер для всех API запросов
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов с одного IP
  message: {
    success: false,
    error: 'Too many requests',
    message: 'Слишком много запросов с вашего IP. Попробуйте позже.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Возвращать rate limit info в headers
  legacyHeaders: false,
  // Кастомная функция для определения ключа (IP + User-Agent для более точного контроля)
  keyGenerator: (req) => {
    return req.ip + ':' + (req.get('User-Agent') || 'unknown');
  },
  // Пропускать запросы от локального хоста в development
  skip: (req) => {
    if (process.env.NODE_ENV === 'development' && 
        (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip.includes('192.168.'))) {
      return true;
    }
    return false;
  }
});

// Строгий лимитер для операций минтинга
const mintLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 50, // максимум 50 операций минтинга в минуту
  message: {
    success: false,
    error: 'Mint rate limit exceeded',
    message: 'Превышен лимит операций минтинга. Максимум 50 операций в минуту.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Используем API ключ если есть, иначе IP
    const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
    return apiKey ? `apikey:${apiKey}` : `ip:${req.ip}`;
  },
  skip: (req) => {
    if (process.env.NODE_ENV === 'development') {
      return true; // В разработке пропускаем лимиты
    }
    return false;
  }
});

// Лимитер для загрузки файлов
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 минут
  max: 20, // максимум 20 загрузок за 10 минут
  message: {
    success: false,
    error: 'Upload rate limit exceeded',
    message: 'Превышен лимит загрузок файлов. Максимум 20 загрузок за 10 минут.',
    retryAfter: '10 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
    return apiKey ? `upload:${apiKey}` : `upload:${req.ip}`;
  },
  skip: (req) => {
    if (process.env.NODE_ENV === 'development') {
      return true;
    }
    return false;
  }
});

// Очень строгий лимитер для создания коллекций
const createCollectionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 3, // максимум 3 коллекции в час
  message: {
    success: false,
    error: 'Collection creation limit exceeded',
    message: 'Превышен лимит создания коллекций. Максимум 3 коллекции в час.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
    return `collection:${apiKey || req.ip}`;
  },
  skip: (req) => {
    if (process.env.NODE_ENV === 'development') {
      return true;
    }
    return false;
  }
});

// Middleware для логирования превышения лимитов
const rateLimitLogger = (req, res, next) => {
  // Проверяем заголовки rate limit
  const remaining = res.get('X-RateLimit-Remaining');
  const limit = res.get('X-RateLimit-Limit');
  
  if (remaining !== undefined && parseInt(remaining) < parseInt(limit) * 0.1) {
    console.warn(`[Rate Limit] Пользователь ${req.ip} приближается к лимиту: ${remaining}/${limit}`);
  }
  
  next();
};

// Функция для получения информации о текущих лимитах
const getRateLimitInfo = (req) => {
  return {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    apiKey: req.headers['x-api-key'] ? 'present' : 'missing',
    limits: {
      api: {
        window: '15 minutes',
        max: 100,
        scope: 'per IP + User-Agent'
      },
      mint: {
        window: '1 minute', 
        max: 50,
        scope: 'per API key or IP'
      },
      upload: {
        window: '10 minutes',
        max: 20,
        scope: 'per API key or IP'
      },
      createCollection: {
        window: '1 hour',
        max: 3,
        scope: 'per API key or IP'
      }
    },
    development: process.env.NODE_ENV === 'development' ? 'limits disabled' : 'limits active'
  };
};

module.exports = {
  apiLimiter,
  mintLimiter,
  uploadLimiter,
  createCollectionLimiter,
  rateLimitLogger,
  getRateLimitInfo
}; 