const express = require('express');
const router = express.Router();

// Базовая проверка здоровья
router.get('/', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Детальная проверка здоровья  
router.get('/detailed', (req, res) => {
  const memoryUsage = process.memoryUsage();
  
  // Проверка переменных окружения для Solana
  const solanaConfig = {
    hasPrivateKey: !!process.env.PRIVATE_KEY,
    hasRpcUrl: !!process.env.RPC_URL,
    hasTreeAddress: !!process.env.TREE_ADDRESS,
    hasCollectionAddress: !!process.env.COLLECTION_ADDRESS,
    hasDefaultRecipient: !!process.env.DEFAULT_RECIPIENT,
    rpcUrl: process.env.RPC_URL || 'not_set',
    treeAddress: process.env.TREE_ADDRESS || 'not_set',
    collectionAddress: process.env.COLLECTION_ADDRESS || 'not_set'
  };
  
  // Проверка IPFS конфигурации
  const ipfsConfig = {
    hasPinataKey: !!process.env.PINATA_API_KEY,
    hasGateway: !!process.env.DEDICATED_PINATA_GATEWAY,
    gateway: process.env.DEDICATED_PINATA_GATEWAY || 'not_set'
  };
  
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    memory: {
      rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB'
    },
    solana: solanaConfig,
    ipfs: ipfsConfig,
    ready: solanaConfig.hasPrivateKey && 
           solanaConfig.hasTreeAddress && 
           solanaConfig.hasCollectionAddress &&
           ipfsConfig.hasPinataKey
  });
});

module.exports = router; 