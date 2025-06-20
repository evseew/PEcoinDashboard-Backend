require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Логирование запросов
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

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
  } else {
    console.log('\n✅ Базовая конфигурация в порядке');
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
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

module.exports = app; 