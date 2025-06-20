const express = require('express');
const router = express.Router();

// Health check endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'NFT Backend is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    status: 'healthy'
  });
});

// Detailed health check
router.get('/detailed', (req, res) => {
  res.json({
    success: true,
    checks: {
      server: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid
    }
  });
});

module.exports = router; 