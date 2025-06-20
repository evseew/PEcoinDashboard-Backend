const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Routes
const healthRoutes = require('./src/routes/health');
const apiRoutes = require('./src/routes/api');

// Middleware
const authMiddleware = require('./src/middleware/auth');

const app = express();
const PORT = process.env.PORT || process.env.VCAP_APP_PORT || 8080;

// Log all environment variables for debugging
console.log('=== ENVIRONMENT DEBUG ===');
console.log('PORT:', process.env.PORT);
console.log('VCAP_APP_PORT:', process.env.VCAP_APP_PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('All env keys:', Object.keys(process.env).filter(k => k.includes('PORT')));
console.log('========================');

// Trust proxy (для TimeWeb)
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes (без авторизации)
app.use('/health', healthRoutes);

// Basic info endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'PEcamp NFT Backend',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      api: '/api (requires X-API-Key header)',
      docs: 'See PRD.md for API documentation'
    }
  });
});

// API routes (с авторизацией)
app.use('/api', authMiddleware, apiRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: ['/', '/health', '/api/test']
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error('Error:', error.name, error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  process.exit(1);
});

// Start server with error handling
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 NFT Backend server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log(`🌐 Server address: http://0.0.0.0:${PORT}`);
});

// Handle server errors
server.on('error', (error) => {
  console.error('SERVER ERROR! 💥');
  console.error('Error code:', error.code);
  console.error('Error message:', error.message);
  
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  } else if (error.code === 'EACCES') {
    console.error(`Permission denied to bind to port ${PORT}`);
  }
  
  process.exit(1);
});

module.exports = app; 