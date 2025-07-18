// services/indexing-monitor.js
// ✅ ПОЛНАЯ СИСТЕМА МОНИТОРИНГА DAS ИНДЕКСАЦИИ

const EventEmitter = require('events');

class IndexingMonitorService extends EventEmitter {
  constructor() {
    super();
    this.monitoringJobs = new Map(); // operationId -> job details
    this.completedOperations = new Map(); // cache завершенных операций
    this.isRunning = false;
    this.intervalMs = 30000; // 30 секунд между проверками
    this.maxRetries = 40; // 20 минут мониторинга максимум
    this.dasApiUrl = process.env.DAS_API_URL || process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
    
    // ✅ НОВОЕ: Webhook интеграция
    this.webhookNotifier = null;
    
    // Статистика
    this.stats = {
      totalMonitored: 0,
      successfullyIndexed: 0,
      timeouts: 0,
      errors: 0,
      averageIndexingTime: 0
    };

    // ✅ НОВОЕ: Настройка webhook уведомлений
    this.setupWebhookIntegration();
  }

  // ✅ НОВАЯ ФУНКЦИЯ: Настройка webhook интеграции
  setupWebhookIntegration() {
    try {
      const { getWebhookNotifier } = require('./webhook-notifier');
      this.webhookNotifier = getWebhookNotifier();

      // Регистрируем обработчики событий для webhook уведомлений
      this.on('indexingCompleted', async (data) => {
        if (this.webhookNotifier) {
          await this.webhookNotifier.notifyEvent('indexingCompleted', data);
        }
      });

      this.on('indexingTimeout', async (data) => {
        if (this.webhookNotifier) {
          await this.webhookNotifier.notifyEvent('indexingTimeout', data);
        }
      });

      this.on('indexingError', async (data) => {
        if (this.webhookNotifier) {
          await this.webhookNotifier.notifyEvent('indexingError', data);
        }
      });

      this.on('monitoringStarted', async (data) => {
        if (this.webhookNotifier) {
          await this.webhookNotifier.notifyEvent('monitoringStarted', data);
        }
      });

      console.log('[Indexing Monitor] ✅ Webhook интеграция настроена');

    } catch (error) {
      console.warn('[Indexing Monitor] ⚠️ Webhook интеграция недоступна:', error.message);
    }
  }

  // ✅ Запуск мониторинга operation
  startMonitoring(operationId, assetId, metadata = {}) {
    if (this.monitoringJobs.has(operationId)) {
      console.log(`[Indexing Monitor] Operation ${operationId} уже отслеживается`);
      return;
    }

    const job = {
      operationId,
      assetId,
      startTime: Date.now(),
      attempts: 0,
      status: 'monitoring',
      metadata: {
        treeAddress: metadata.treeAddress,
        leafIndex: metadata.leafIndex,
        collection: metadata.collection,
        nftName: metadata.nftName,
        ...metadata
      },
      history: []
    };

    this.monitoringJobs.set(operationId, job);
    this.stats.totalMonitored++;

    console.log(`[Indexing Monitor] ✅ Начат мониторинг operation ${operationId} для asset ${assetId}`);
    
    // Запускаем автоматический мониторинг если еще не запущен
    if (!this.isRunning) {
      this.startAutomaticMonitoring();
    }

    // Emit событие начала мониторинга
    this.emit('monitoringStarted', {
      operationId,
      assetId,
      timestamp: new Date().toISOString()
    });

    return job;
  }

  // ✅ Остановка мониторинга конкретной операции
  stopMonitoring(operationId, reason = 'manual') {
    const job = this.monitoringJobs.get(operationId);
    if (!job) {
      return false;
    }

    job.status = 'stopped';
    job.stopReason = reason;
    job.endTime = Date.now();
    job.totalTime = job.endTime - job.startTime;

    // Перемещаем в completed cache
    this.completedOperations.set(operationId, job);
    this.monitoringJobs.delete(operationId);

    console.log(`[Indexing Monitor] 🛑 Остановлен мониторинг ${operationId}: ${reason}`);

    this.emit('monitoringStopped', {
      operationId,
      reason,
      job
    });

    return true;
  }

  // ✅ Автоматический мониторинг цикл
  async startAutomaticMonitoring() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log(`[Indexing Monitor] 🚀 Запуск автоматического мониторинга (интервал: ${this.intervalMs}ms)`);

    this.monitoringInterval = setInterval(async () => {
      await this.performMonitoringCycle();
    }, this.intervalMs);
  }

  // ✅ Остановка автоматического мониторинга
  stopAutomaticMonitoring() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log(`[Indexing Monitor] 🛑 Остановлен автоматический мониторинг`);
  }

  // ✅ Цикл проверки всех активных jobs
  async performMonitoringCycle() {
    const activeJobs = Array.from(this.monitoringJobs.values());
    
    if (activeJobs.length === 0) {
      // Останавливаем мониторинг если нет активных jobs
      this.stopAutomaticMonitoring();
      return;
    }

    console.log(`[Indexing Monitor] 🔄 Проверяем ${activeJobs.length} активных операций`);

    const promises = activeJobs.map(job => this.checkJobIndexing(job));
    await Promise.allSettled(promises);
  }

  // ✅ Проверка индексации конкретного job
  async checkJobIndexing(job) {
    try {
      job.attempts++;
      const attemptStartTime = Date.now();

      console.log(`[Indexing Monitor] 🔍 Проверка ${job.operationId} (попытка ${job.attempts}/${this.maxRetries})`);

      // Проверяем DAS индексацию
      const dasResult = await this.checkDASIndexing(job.assetId);
      
      const attemptResult = {
        attempt: job.attempts,
        timestamp: new Date().toISOString(),
        indexed: dasResult.indexed,
        responseTime: Date.now() - attemptStartTime,
        details: dasResult
      };

      job.history.push(attemptResult);

      if (dasResult.indexed) {
        // ✅ Успешно проиндексировано!
        await this.handleSuccessfulIndexing(job, dasResult);
      } else if (job.attempts >= this.maxRetries) {
        // ❌ Превышено максимальное количество попыток
        await this.handleIndexingTimeout(job);
      } else {
        // ⏳ Продолжаем мониторинг
        console.log(`[Indexing Monitor] ⏳ ${job.operationId} еще не проиндексирован (${job.attempts}/${this.maxRetries})`);
      }

    } catch (error) {
      console.error(`[Indexing Monitor] ❌ Ошибка проверки ${job.operationId}:`, error.message);
      
      job.history.push({
        attempt: job.attempts,
        timestamp: new Date().toISOString(),
        error: error.message,
        indexed: false
      });

      if (job.attempts >= this.maxRetries) {
        await this.handleIndexingError(job, error);
      }
    }
  }

  // ✅ Проверка DAS индексации через API
  async checkDASIndexing(assetId) {
    try {
      const response = await fetch(this.dasApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'indexing-check',
          method: 'getAsset',
          params: {
            id: assetId
          }
        }),
        signal: AbortSignal.timeout(10000) // 10 секунд таймаут
      });

      if (response.ok) {
        const result = await response.json();
        
        if (result.result && result.result.id === assetId) {
          return {
            indexed: true,
            asset: result.result,
            compression: result.result.compression,
            ownership: result.result.ownership
          };
        }
      }

      return {
        indexed: false,
        httpStatus: response.status,
        error: response.statusText
      };

    } catch (error) {
      return {
        indexed: false,
        error: error.message
      };
    }
  }

  // ✅ Обработка успешной индексации
  async handleSuccessfulIndexing(job, dasResult) {
    job.status = 'indexed';
    job.endTime = Date.now();
    job.totalTime = job.endTime - job.startTime;
    job.indexingResult = dasResult;

    // Обновляем статистику
    this.stats.successfullyIndexed++;
    this.updateAverageIndexingTime(job.totalTime);

    console.log(`[Indexing Monitor] ✅ ${job.operationId} успешно проиндексирован за ${job.totalTime / 1000}с`);

    // Уведомляем систему
    this.emit('indexingCompleted', {
      operationId: job.operationId,
      assetId: job.assetId,
      totalTime: job.totalTime,
      attempts: job.attempts,
      result: dasResult
    });

    // Остановить мониторинг этой операции
    this.stopMonitoring(job.operationId, 'indexed');

    // Обновляем операцию в базе данных
    await this.updateOperationInDatabase(job);
  }

  // ✅ Обработка таймаута индексации
  async handleIndexingTimeout(job) {
    job.status = 'timeout';
    job.endTime = Date.now();
    job.totalTime = job.endTime - job.startTime;

    this.stats.timeouts++;

    console.warn(`[Indexing Monitor] ⏰ ${job.operationId} не проиндексирован за ${this.maxRetries} попыток`);

    this.emit('indexingTimeout', {
      operationId: job.operationId,
      assetId: job.assetId,
      totalTime: job.totalTime,
      attempts: job.attempts,
      recommendation: 'NFT может появиться в кошельке в течение 30-60 минут'
    });

    this.stopMonitoring(job.operationId, 'timeout');
    await this.updateOperationInDatabase(job);
  }

  // ✅ Обработка ошибки индексации
  async handleIndexingError(job, error) {
    job.status = 'error';
    job.endTime = Date.now();
    job.totalTime = job.endTime - job.startTime;
    job.error = error.message;

    this.stats.errors++;

    console.error(`[Indexing Monitor] ❌ ${job.operationId} ошибка мониторинга: ${error.message}`);

    this.emit('indexingError', {
      operationId: job.operationId,
      assetId: job.assetId,
      error: error.message,
      attempts: job.attempts
    });

    this.stopMonitoring(job.operationId, 'error');
    await this.updateOperationInDatabase(job);
  }

  // ✅ Обновление операции в базе данных
  async updateOperationInDatabase(job) {
    try {
      // Предполагаем что у нас есть database service
      const { getDatabaseService } = require('./database');
      const databaseService = getDatabaseService();

      await databaseService.updateMintOperation(job.operationId, {
        indexingStatus: job.status,
        indexingHistory: job.history,
        indexingResult: job.indexingResult || null,
        phantomReady: job.status === 'indexed',
        totalIndexingTime: job.totalTime,
        lastChecked: new Date().toISOString()
      });

    } catch (error) {
      console.error(`[Indexing Monitor] Ошибка обновления БД для ${job.operationId}:`, error.message);
    }
  }

  // ✅ Обновление средней статистики
  updateAverageIndexingTime(newTime) {
    const totalOperations = this.stats.successfullyIndexed;
    const currentAverage = this.stats.averageIndexingTime;
    
    this.stats.averageIndexingTime = ((currentAverage * (totalOperations - 1)) + newTime) / totalOperations;
  }

  // ✅ Получение статистики мониторинга
  getMonitoringStats() {
    return {
      ...this.stats,
      activeJobs: this.monitoringJobs.size,
      completedJobs: this.completedOperations.size,
      isRunning: this.isRunning,
      averageIndexingTimeMinutes: Math.round(this.stats.averageIndexingTime / 60000 * 100) / 100
    };
  }

  // ✅ Получение статуса конкретной операции
  getOperationStatus(operationId) {
    // Проверяем в активных
    const activeJob = this.monitoringJobs.get(operationId);
    if (activeJob) {
      return {
        status: 'monitoring',
        ...activeJob,
        elapsed: Date.now() - activeJob.startTime
      };
    }

    // Проверяем в завершенных
    const completedJob = this.completedOperations.get(operationId);
    if (completedJob) {
      return {
        status: 'completed',
        ...completedJob
      };
    }

    return null;
  }

  // ✅ Получение всех активных операций
  getActiveOperations() {
    return Array.from(this.monitoringJobs.values()).map(job => ({
      operationId: job.operationId,
      assetId: job.assetId,
      status: job.status,
      attempts: job.attempts,
      elapsed: Date.now() - job.startTime,
      metadata: job.metadata
    }));
  }

  // ✅ Graceful shutdown
  async shutdown() {
    console.log(`[Indexing Monitor] 🔄 Graceful shutdown...`);
    
    this.stopAutomaticMonitoring();
    
    // Финализируем все активные jobs
    const activeJobs = Array.from(this.monitoringJobs.values());
    for (const job of activeJobs) {
      this.stopMonitoring(job.operationId, 'shutdown');
    }

    console.log(`[Indexing Monitor] ✅ Shutdown завершен`);
  }
}

// Singleton instance
let monitorInstance = null;

function getIndexingMonitor() {
  if (!monitorInstance) {
    monitorInstance = new IndexingMonitorService();
  }
  return monitorInstance;
}

module.exports = {
  IndexingMonitorService,
  getIndexingMonitor
}; 