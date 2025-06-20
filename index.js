#!/usr/bin/env node

/**
 * Точка входа для PM2 и TimeWeb
 * Импортирует и запускает основное Express приложение
 */

console.log('🚀 Starting PEcamp NFT Backend...');
console.log('📂 Entry point: index.js');
console.log('⚙️  Process manager: PM2');

// Импортируем основное приложение
const app = require('./app.js');

// Определяем порт
const PORT = process.env.PORT || process.env.VCAP_APP_PORT || 8080;

// Логирование для отладки
console.log('=== PORT DEBUG ===');
console.log('process.env.PORT:', process.env.PORT);
console.log('process.env.VCAP_APP_PORT:', process.env.VCAP_APP_PORT);
console.log('Final PORT:', PORT);
console.log('==================');

// Запускаем сервер
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 NFT Backend server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log(`🌐 Server address: http://0.0.0.0:${PORT}`);
  console.log('✅ Application bootstrapped successfully');
});

// Обработка ошибок сервера
server.on('error', (error) => {
  console.error('💥 SERVER ERROR!');
  console.error('Error code:', error.code);
  console.error('Error message:', error.message);
  
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  } else if (error.code === 'EACCES') {
    console.error(`Permission denied to bind to port ${PORT}`);
  }
  
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}); 