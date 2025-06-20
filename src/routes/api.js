const express = require('express');
const router = express.Router();

// Test API endpoint
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working!',
    data: {
      server: 'Express.js',
      platform: 'TimeWeb',
      blockchain: 'Solana (ready for integration)',
      authenticated: true
    }
  });
});

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'PEcamp NFT API',
    version: '1.0.0',
    endpoints: {
      test: '/api/test',
      mint: '/api/mint/* (coming soon)',
      collections: '/api/collections/* (coming soon)',
      upload: '/api/upload/* (coming soon)',
      stats: '/api/stats/* (coming soon)'
    }
  });
});

module.exports = router; 