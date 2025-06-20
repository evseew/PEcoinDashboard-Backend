const express = require('express');
const router = express.Router();

// Ленивая инициализация сервисов для проверки
let ipfsService = null;
let databaseService = null;
let collectionsService = null;
let solanaService = null;

function getIPFSService() {
  if (!ipfsService) {
    const IPFSService = require('../services/ipfs');
    ipfsService = new IPFSService();
  }
  return ipfsService;
}

function getDatabaseService() {
  if (!databaseService) {
    const DatabaseService = require('../services/database');
    databaseService = new DatabaseService();
  }
  return databaseService;
}

function getCollectionsService() {
  if (!collectionsService) {
    const CollectionsService = require('../services/collections');
    collectionsService = new CollectionsService();
  }
  return collectionsService;
}

function getSolanaService() {
  if (!solanaService) {
    const SolanaService = require('../services/solana');
    solanaService = new SolanaService();
  }
  return solanaService;
}

// GET /health - Базовая проверка здоровья
router.get('/', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// GET /health/detailed - Детальная проверка всех компонентов
router.get('/detailed', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Проверяем основные переменные окружения
    const envCheck = {
      NODE_ENV: !!process.env.NODE_ENV,
      PORT: !!process.env.PORT,
      API_KEY: !!process.env.API_KEY,
      PRIVATE_KEY: !!process.env.PRIVATE_KEY,
      RPC_URL: !!process.env.RPC_URL,
      PINATA_API_KEY: !!process.env.PINATA_API_KEY,
      PINATA_SECRET_API_KEY: !!process.env.PINATA_SECRET_API_KEY,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY
    };

    // Проверяем сервисы
    const services = {};

    try {
      const ipfs = getIPFSService();
      services.ipfs = {
        status: 'operational',
        ...ipfs.getServiceStatus()
      };
    } catch (error) {
      services.ipfs = {
        status: 'error',
        error: error.message
      };
    }

    try {
      const database = getDatabaseService();
      services.database = {
        status: 'operational',
        ...database.getServiceStatus()
      };
    } catch (error) {
      services.database = {
        status: 'error',
        error: error.message
      };
    }

    try {
      const collections = getCollectionsService();
      const activeCollections = collections.getActiveCollections();
      services.collections = {
        status: 'operational',
        activeCollections: activeCollections.length,
        totalCollections: collections.getCollections().collections.length
      };
    } catch (error) {
      services.collections = {
        status: 'error',
        error: error.message
      };
    }

    try {
      const solana = getSolanaService();
      services.solana = {
        status: 'operational',
        network: process.env.RPC_URL ? 'configured' : 'default',
        ready: !!process.env.PRIVATE_KEY
      };
    } catch (error) {
      services.solana = {
        status: 'error',
        error: error.message
      };
    }

    // Общий статус
    const allServicesHealthy = Object.values(services).every(service => service.status === 'operational');
    const criticalEnvMissing = !envCheck.API_KEY;

    const healthStatus = criticalEnvMissing ? 'degraded' : (allServicesHealthy ? 'healthy' : 'partial');

    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      status: healthStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: `${responseTime}ms`,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks: {
        environment: {
          status: criticalEnvMissing ? 'error' : 'ok',
          variables: envCheck,
          missing: Object.entries(envCheck)
            .filter(([key, value]) => !value)
            .map(([key]) => key)
        },
        services: services
      },
      endpoints: {
        health: '/health',
        detailed: '/health/detailed',
        api: {
          collections: '/api/collections',
          mint: '/api/mint',
          upload: '/api/upload'
        }
      },
      warnings: criticalEnvMissing ? ['API_KEY не установлен - аутентификация отключена'] : []
    });

  } catch (error) {
    console.error('[Health] Ошибка детальной проверки:', error);
    res.status(500).json({
      success: false,
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// GET /health/rpc - Тестирование RPC подключения
router.get('/rpc', async (req, res) => {
  try {
    console.log('[Health] Начинаем тест RPC подключения...');
    
    const solana = getSolanaService();
    
    // Сбрасываем инициализацию для повторного теста
    solana.initialized = false;
    solana.umi = null;
    
    const startTime = Date.now();
    await solana.initialize();
    const duration = Date.now() - startTime;
    
    const balance = await solana.getWalletBalance();
    
    res.json({
      success: true,
      data: {
        rpcConnected: true,
        initializationTime: `${duration}ms`,
        walletBalance: balance,
        walletAddress: solana.umi?.identity?.publicKey?.toString(),
        rpcUrl: process.env.RPC_URL,
        backupRpcs: process.env.BACKUP_RPC_URLS?.split(',') || []
      },
      message: 'RPC подключение успешно'
    });
    
  } catch (error) {
    console.error('[Health] RPC test failed:', error);
    res.status(500).json({
      success: false,
      error: 'RPC connection failed',
      details: error.message,
      rpcUrl: process.env.RPC_URL,
      backupRpcs: process.env.BACKUP_RPC_URLS?.split(',') || []
    });
  }
});

// GET /health/services - Быстрая проверка только сервисов
router.get('/services', async (req, res) => {
  try {
    const services = {
      ipfs: 'checking',
      database: 'checking',
      collections: 'checking',
      solana: 'checking'
    };

    // Быстрая проверка без инициализации
    try {
      const ipfs = getIPFSService();
      services.ipfs = ipfs.getServiceStatus().connected ? 'connected' : 'mock';
    } catch (error) {
      services.ipfs = 'error';
    }

    try {
      const database = getDatabaseService();
      services.database = database.getServiceStatus().connected ? 'connected' : 'mock';
    } catch (error) {
      services.database = 'error';
    }

    try {
      const collections = getCollectionsService();
      services.collections = 'ready';
    } catch (error) {
      services.collections = 'error';
    }

    try {
      services.solana = process.env.PRIVATE_KEY ? 'ready' : 'mock';
    } catch (error) {
      services.solana = 'error';
    }

    res.json({
      success: true,
      services,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Health] Ошибка проверки сервисов:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /health/wallet - Проверка баланса кошелька для минтинга
router.get('/wallet', async (req, res) => {
  try {
    if (!process.env.PRIVATE_KEY) {
      return res.json({
        success: false,
        error: 'Private key not configured',
        message: 'Кошелек для минтинга не настроен'
      });
    }

    const solana = getSolanaService();
    
    // Проверяем баланс
    const balanceInfo = await solana.checkWalletBalance();
    
    // Оценка стоимости для разных операций
    const costs = {
      singleMint: await solana.estimateMintCost(1),
      batchMint10: await solana.estimateMintCost(10),
      batchMint50: await solana.estimateMintCost(50)
    };
    
    // Проверка возможности операций
    const affordability = {
      singleMint: await solana.canAffordOperation(1),
      batchMint10: await solana.canAffordOperation(10),
      batchMint50: await solana.canAffordOperation(50)
    };

    // Определяем статус кошелька
    let walletStatus = 'healthy';
    let warnings = [];
    
    if (balanceInfo.balance < 0.001) {
      walletStatus = 'critical';
      warnings.push('Критически низкий баланс - минтинг невозможен');
    } else if (balanceInfo.balance < 1) {
      walletStatus = 'warning';
      warnings.push('Низкий баланс - рекомендуется пополнение');
    } else if (balanceInfo.balance < 5) {
      walletStatus = 'low';
      warnings.push('Баланс ниже рекомендуемого уровня');
    }

    res.json({
      success: true,
      status: walletStatus,
      wallet: {
        address: balanceInfo.address,
        balance: balanceInfo.balance,
        balanceFormatted: `${balanceInfo.balance.toFixed(4)} SOL`,
        lastChecked: balanceInfo.timestamp
      },
      costs,
      affordability,
      warnings,
      recommendations: {
        minimumBalance: '1 SOL',
        recommendedBalance: '10-50 SOL',
        rechargeTrigger: '5 SOL'
      },
      links: {
        explorer: `https://explorer.solana.com/address/${balanceInfo.address}`,
        faucet: process.env.RPC_URL?.includes('devnet') ? 'https://faucet.solana.com' : null
      }
    });

  } catch (error) {
    console.error('[Health] Ошибка проверки кошелька:', error);
    res.status(500).json({
      success: false,
      error: 'Wallet check failed',
      message: error.message
    });
  }
});

module.exports = router; 