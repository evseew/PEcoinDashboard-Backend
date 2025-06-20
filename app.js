require('dotenv').config();
const express = require('express');
const cors = require('cors');
const logger = require('./src/services/logger');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Логирование запросов
app.use(logger.requestLogger());

// Простая проверка окружения (без остановки приложения)
function checkEnvironment() {
  const warnings = [];
  
  if (!process.env.API_KEY) {
    warnings.push('API_KEY не установлен');
  }
  
  if (!process.env.PRIVATE_KEY) {
    warnings.push('PRIVATE_KEY не установлен, минтинг недоступен');
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  Предупреждения:');
    warnings.forEach(warning => console.log(`   - ${warning}`));
    
    // Логируем предупреждения через систему логирования
    logger.log('warn', 'startup', 'Environment warnings detected', { warnings });
  } else {
    console.log('\n✅ Базовая конфигурация в порядке');
    logger.log('info', 'startup', 'Environment configuration OK');
  }
}

// Выполняем проверку без остановки
checkEnvironment();

// Import routes (без блокирующих инициализаций)
const healthRouter = require('./src/routes/health');
const apiRouter = require('./src/routes/api');
const authMiddleware = require('./src/middleware/auth');

// Routes
app.use('/health', healthRouter);
app.use('/api', authMiddleware, apiRouter);

// Root endpoint
app.get('/', (req, res) => {
  // Логируем обращение к корневому endpoint
  req.logger.log('info', 'request', 'Root endpoint accessed', {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  }, req);
  
  res.json({
    success: true,
    message: 'PEcamp NFT Backend',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/health',
      api: '/api',
      collections: '/api/collections',
      mint: '/api/mint',
      upload: '/api/upload'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  // Логируем 404 ошибки
  req.logger.log('warn', 'request', `404 Not Found: ${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  }, req);
  
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: {
      health: '/health',
      api: '/api'
    }
  });
});

// Error handler
app.use((error, req, res, next) => {
  // Логируем все необработанные ошибки
  req.logger.logError(error, 'Unhandled application error', {
    url: req.url,
    method: req.method,
    body: req.body
  }, req);
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

module.exports = app; 