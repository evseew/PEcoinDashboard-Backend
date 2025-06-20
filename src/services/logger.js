class LoggerService {
  constructor() {
    this.databaseService = null;
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.enabledLoggers = {
      database: true,
      console: true,
      file: false // можно добавить файловое логирование
    };
  }

  // Ленивая инициализация DatabaseService
  getDatabaseService() {
    if (!this.databaseService) {
      const DatabaseService = require('./database');
      this.databaseService = new DatabaseService();
    }
    return this.databaseService;
  }

  // Основной метод логирования
  async log(level, category, message, data = {}, req = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      category,
      message,
      data,
      context: this.extractContext(req)
    };

    // Консольное логирование
    if (this.enabledLoggers.console) {
      this.logToConsole(logEntry);
    }

    // Логирование в базу данных для важных событий
    if (this.enabledLoggers.database && this.shouldLogToDatabase(level, category)) {
      try {
        const dbService = this.getDatabaseService();
        await dbService.logEvent({
          type: `${level}_${category}`,
          data: {
            message,
            ...data,
            context: logEntry.context
          },
          userId: req?.userId || null,
          ipAddress: req?.ip || null,
          userAgent: req?.get('User-Agent') || null
        });
      } catch (error) {
        console.error('[Logger] Ошибка записи в БД:', error.message);
      }
    }

    return logEntry;
  }

  // Извлечение контекста из запроса
  extractContext(req) {
    if (!req) return null;

    return {
      ip: req.ip,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      apiKey: req.headers['x-api-key'] ? 'present' : 'missing',
      timestamp: new Date().toISOString()
    };
  }

  // Определение нужно ли логировать в БД
  shouldLogToDatabase(level, category) {
    const criticalLevels = ['error', 'warn'];
    const importantCategories = ['mint', 'auth', 'upload', 'collection', 'security'];
    
    return criticalLevels.includes(level) || importantCategories.includes(category);
  }

  // Консольное логирование с цветами
  logToConsole(logEntry) {
    const { timestamp, level, category, message, data, context } = logEntry;
    
    // Цвета для разных уровней
    const colors = {
      error: '\x1b[31m',   // красный
      warn: '\x1b[33m',    // желтый
      info: '\x1b[36m',    // голубой
      debug: '\x1b[90m',   // серый
      success: '\x1b[32m'  // зеленый
    };
    
    const reset = '\x1b[0m';
    const color = colors[level] || colors.info;
    
    const prefix = `${color}[${timestamp.split('T')[1].split('.')[0]}] [${level.toUpperCase()}] [${category}]${reset}`;
    
    console.log(`${prefix} ${message}`);
    
    // Дополнительные данные
    if (Object.keys(data).length > 0) {
      console.log(`${color}  Data:${reset}`, JSON.stringify(data, null, 2));
    }
    
    // Контекст запроса для важных событий
    if (context && (level === 'error' || level === 'warn')) {
      console.log(`${color}  Context:${reset}`, JSON.stringify(context, null, 2));
    }
  }

  // Специализированные методы логирования

  // Логирование операций минтинга
  async logMint(action, operationId, data = {}, req = null) {
    return await this.log('info', 'mint', `Mint ${action}: ${operationId}`, {
      operationId,
      action,
      ...data
    }, req);
  }

  // Логирование аутентификации
  async logAuth(action, success, data = {}, req = null) {
    const level = success ? 'info' : 'warn';
    return await this.log(level, 'auth', `Auth ${action}: ${success ? 'success' : 'failed'}`, {
      action,
      success,
      ...data
    }, req);
  }

  // Логирование загрузок
  async logUpload(action, fileCount, data = {}, req = null) {
    return await this.log('info', 'upload', `Upload ${action}: ${fileCount} files`, {
      action,
      fileCount,
      ...data
    }, req);
  }

  // Логирование работы с коллекциями
  async logCollection(action, collectionId, data = {}, req = null) {
    return await this.log('info', 'collection', `Collection ${action}: ${collectionId}`, {
      action,
      collectionId,
      ...data
    }, req);
  }

  // Логирование ошибок
  async logError(error, context = '', data = {}, req = null) {
    return await this.log('error', 'error', `${context}: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      context,
      ...data
    }, req);
  }

  // Логирование безопасности
  async logSecurity(event, data = {}, req = null) {
    return await this.log('warn', 'security', `Security event: ${event}`, data, req);
  }

  // Логирование производительности
  async logPerformance(operation, duration, data = {}, req = null) {
    const level = duration > 5000 ? 'warn' : 'info'; // Предупреждение если операция > 5 сек
    return await this.log(level, 'performance', `${operation} took ${duration}ms`, {
      operation,
      duration,
      ...data
    }, req);
  }

  // Middleware для автоматического логирования запросов
  requestLogger() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Логируем начало запроса
      this.log('debug', 'request', `${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentLength: req.get('Content-Length') || 0
      }, req);
      
      // Перехватываем окончание ответа
      const originalSend = res.send;
      res.send = function(body) {
        const duration = Date.now() - startTime;
        const statusLevel = res.statusCode >= 400 ? 'warn' : 'info';
        
        // Логируем завершение запроса
        req.logger.log(statusLevel, 'response', `${req.method} ${req.url} - ${res.statusCode}`, {
          statusCode: res.statusCode,
          duration,
          responseSize: Buffer.byteLength(body || '', 'utf8')
        }, req);
        
        return originalSend.call(this, body);
      };
      
      // Добавляем logger в объект запроса для использования в роутах
      req.logger = this;
      
      next();
    };
  }

  // Получение статистики логирования
  getStats() {
    return {
      enabled: this.enabledLoggers,
      level: this.logLevel,
      timestamp: new Date().toISOString()
    };
  }
}

// Создаем единственный экземпляр
const loggerService = new LoggerService();

module.exports = loggerService; 