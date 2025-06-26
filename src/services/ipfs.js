const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class IPFSService {
  constructor() {
    this.isConnected = false;
    this.pinataApiUrl = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
    this.pinataJsonUrl = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
    // Запускаем асинхронную инициализацию и сохраняем Promise,
    // чтобы в последующих вызовах можно было дождаться готовности.
    this.ready = this.initializePinata();
  }

  // Инициализация Pinata
  async initializePinata() {
    try {
      // Используем те же названия переменных что в reference коде
      const apiKey = process.env.PINATA_API_KEY;
      const secretKey = process.env.PINATA_SECRET_KEY || process.env.PINATA_SECRET_API_KEY; // Поддерживаем оба варианта
      
      if (!apiKey || !secretKey) {
        console.log('[IPFS Service] Pinata credentials не найдены, используется мок-режим');
        console.log('[IPFS Service] Нужны: PINATA_API_KEY и PINATA_SECRET_API_KEY');
        return;
      }
      
      // Создаем SDK клиент один раз
      const PinataSDK = require('@pinata/sdk');
      this.pinata = new PinataSDK({ pinataApiKey: apiKey, pinataSecretApiKey: secretKey });
      
      // Проверяем соединение простым запросом к API
      try {
        const testResponse = await fetch('https://api.pinata.cloud/data/testAuthentication', {
          method: 'GET',
          headers: {
            'pinata_api_key': apiKey,
            'pinata_secret_api_key': secretKey,
          }
        });
        
        if (testResponse.ok) {
          this.isConnected = true;
          console.log('[IPFS Service] ✅ Pinata подключен успешно (HTTP API)');
        } else {
          console.log('[IPFS Service] ❌ Ошибка аутентификации Pinata:', testResponse.status);
        }
      } catch (testError) {
        console.log('[IPFS Service] ❌ Ошибка тестирования Pinata:', testError.message);
      }
      
    } catch (error) {
      console.log('[IPFS Service] Ошибка подключения к Pinata:', error.message);
      console.log('[IPFS Service] Работаем в мок-режиме');
    }
  }

  // Загрузка файла на IPFS (HTTP API как в reference коде)
  async uploadFile(filePath, options = {}) {
    // Дожидаемся окончания инициализации Pinata (важно после перезапуска сервера)
    await this.ready;
    try {
      if (!this.isConnected) {
        return this.mockUploadFile(filePath, options);
      }

      const fileName = options.name || path.basename(filePath);

      // Формируем метаданные (SDK принимает pinataMetadata отдельным объектом)
      const pinataMetadata = {
        name: fileName,
        keyvalues: {
          uploadTimestamp: new Date().toISOString(),
          originalName: fileName,
          ...options.metadata || {}
        }
      };

      // Загружаем файл через Pinata SDK (надёжнее, чем raw HTTP)
      const readableStream = require('fs').createReadStream(filePath);

      const result = await this.pinata.pinFileToIPFS(readableStream, {
        pinataMetadata
      });

      console.log(`[IPFS Service] ✅ Файл загружен: ${fileName}, CID: ${result.IpfsHash}`);

      return {
        success: true,
        ipfsHash: result.IpfsHash,
        ipfsUri: `ipfs://${result.IpfsHash}`,
        gatewayUrl: this.getGatewayUrl(result.IpfsHash),
        size: result.PinSize || null,
        timestamp: result.Timestamp || new Date().toISOString()
      };
      
    } catch (error) {
      console.error('[IPFS Service] Ошибка загрузки файла:', error);
      throw new Error(`IPFS upload failed: ${error.message}`);
    }
  }

  // Загрузка JSON объекта на IPFS
  async uploadJSON(jsonObject, options = {}) {
    // Дожидаемся окончания инициализации Pinata
    await this.ready;
    try {
      if (!this.isConnected) {
        return this.mockUploadJSON(jsonObject, options);
      }

      const pinataMetadata = {
        name: options.name || `metadata-${Date.now()}.json`,
        keyvalues: {
          uploadTimestamp: new Date().toISOString(),
          type: 'metadata',
          ...options.metadata || {}
        }
      };

      const result = await this.pinata.pinJSONToIPFS(jsonObject, {
        pinataMetadata,
        pinataOptions: { cidVersion: 0 }
      });

      console.log(`[IPFS Service] ✅ JSON загружен, CID: ${result.IpfsHash}`);
      
      return {
        success: true,
        ipfsHash: result.IpfsHash,
        ipfsUri: `ipfs://${result.IpfsHash}`,
        gatewayUrl: this.getGatewayUrl(result.IpfsHash),
        size: result.PinSize,
        timestamp: result.Timestamp
      };
      
    } catch (error) {
      console.error('[IPFS Service] Ошибка загрузки JSON:', error);
      throw new Error(`IPFS JSON upload failed: ${error.message}`);
    }
  }

  // Получение URL gateway
  getGatewayUrl(ipfsHash) {
    const gateway = process.env.DEDICATED_PINATA_GATEWAY;
    
    if (gateway) {
      return `${gateway}/ipfs/${ipfsHash}`;
    }
    
    return `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
  }

  // Проверка статуса сервиса
  getServiceStatus() {
    return {
      connected: this.isConnected,
      provider: this.isConnected ? 'Pinata IPFS (HTTP API)' : 'Mock IPFS',
      gateway: this.getGatewayUrl(''),
      authenticated: this.isConnected
    };
  }

  // Пакетная загрузка файлов
  async uploadMultipleFiles(files, options = {}) {
    const results = [];
    const errors = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      try {
        console.log(`[IPFS Service] Загрузка файла ${i + 1}/${files.length}: ${file.originalname}`);
        
        const fileOptions = {
          name: file.originalname,
          metadata: {
            originalName: file.originalname,
            mimetype: file.mimetype,
            uploadBatch: options.batchId || Date.now()
          }
        };
        
        const result = await this.uploadFile(file.path, fileOptions);
        
        results.push({
          filename: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          ...result
        });
        
        // Пауза между загрузками для стабильности
        if (i < files.length - 1) {
          await this.sleep(500);
        }
        
      } catch (error) {
        console.error(`[IPFS Service] Ошибка загрузки ${file.originalname}:`, error.message);
        
        errors.push({
          filename: file.originalname,
          error: error.message
        });
      }
    }

    return {
      successful: results,
      failed: errors,
      totalFiles: files.length,
      successCount: results.length,
      errorCount: errors.length
    };
  }

  // Мок-функции для тестирования без реальных credentials
  mockUploadFile(filePath, options = {}) {
    const mockHash = `QmMock${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    
    console.log(`[IPFS Service] 🔄 Mock upload: ${path.basename(filePath)} -> ${mockHash}`);
    
    return {
      success: true,
      ipfsHash: mockHash,
      ipfsUri: `ipfs://${mockHash}`,
      gatewayUrl: this.getGatewayUrl(mockHash),
      size: Math.floor(Math.random() * 1000000), // Случайный размер
      timestamp: new Date().toISOString(),
      mock: true
    };
  }

  mockUploadJSON(jsonObject, options = {}) {
    const mockHash = `QmMockJSON${Math.random().toString(36).substring(2, 12)}`;
    
    console.log(`[IPFS Service] 🔄 Mock JSON upload -> ${mockHash}`);
    
    return {
      success: true,
      ipfsHash: mockHash,
      ipfsUri: `ipfs://${mockHash}`,
      gatewayUrl: this.getGatewayUrl(mockHash),
      size: JSON.stringify(jsonObject).length,
      timestamp: new Date().toISOString(),
      mock: true
    };
  }

  // Вспомогательная функция задержки
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Очистка временных файлов
  async cleanupTempFile(filePath) {
    try {
      await fs.unlink(filePath);
      console.log(`[IPFS Service] 🗑️ Временный файл удален: ${filePath}`);
    } catch (error) {
      console.warn(`[IPFS Service] ⚠️ Не удалось удалить временный файл ${filePath}:`, error.message);
    }
  }
}

module.exports = IPFSService; 