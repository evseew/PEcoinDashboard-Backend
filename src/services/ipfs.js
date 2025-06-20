const pinataSDK = require('@pinata/sdk');
const fs = require('fs').promises;
const path = require('path');

class IPFSService {
  constructor() {
    this.pinata = null;
    this.isConnected = false;
    this.initializePinata();
  }

  // Инициализация Pinata SDK
  async initializePinata() {
    try {
      const apiKey = process.env.PINATA_API_KEY;
      const secretApiKey = process.env.PINATA_SECRET_API_KEY;
      
      if (!apiKey || !secretApiKey) {
        console.log('[IPFS Service] Pinata credentials не найдены, используется мок-режим');
        return;
      }
      
      this.pinata = new pinataSDK(apiKey, secretApiKey);
      
      // Проверяем соединение
      const authResult = await this.pinata.testAuthentication();
      
      if (authResult.authenticated) {
        this.isConnected = true;
        console.log('[IPFS Service] ✅ Pinata подключен успешно');
      } else {
        console.log('[IPFS Service] ❌ Ошибка аутентификации Pinata');
      }
      
    } catch (error) {
      console.log('[IPFS Service] Ошибка подключения к Pinata:', error.message);
      console.log('[IPFS Service] Работаем в мок-режиме');
    }
  }

  // Загрузка файла на IPFS
  async uploadFile(filePath, options = {}) {
    try {
      if (!this.isConnected) {
        return this.mockUploadFile(filePath, options);
      }

      const readableStreamForFile = await fs.readFile(filePath);
      
      const pinataOptions = {
        pinataMetadata: {
          name: options.name || path.basename(filePath),
          keyvalues: options.metadata || {}
        },
        pinataOptions: {
          cidVersion: 0
        }
      };

      const result = await this.pinata.pinFileToIPFS(readableStreamForFile, pinataOptions);
      
      return {
        success: true,
        ipfsHash: result.IpfsHash,
        ipfsUri: `ipfs://${result.IpfsHash}`,
        gatewayUrl: this.getGatewayUrl(result.IpfsHash),
        size: result.PinSize,
        timestamp: result.Timestamp
      };
      
    } catch (error) {
      console.error('[IPFS Service] Ошибка загрузки файла:', error);
      throw new Error(`IPFS upload failed: ${error.message}`);
    }
  }

  // Загрузка JSON объекта на IPFS
  async uploadJSON(jsonObject, options = {}) {
    try {
      if (!this.isConnected) {
        return this.mockUploadJSON(jsonObject, options);
      }

      const pinataOptions = {
        pinataMetadata: {
          name: options.name || `metadata-${Date.now()}.json`,
          keyvalues: options.metadata || {}
        },
        pinataOptions: {
          cidVersion: 0
        }
      };

      const result = await this.pinata.pinJSONToIPFS(jsonObject, pinataOptions);
      
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
      provider: this.isConnected ? 'Pinata IPFS' : 'Mock IPFS',
      gateway: this.getGatewayUrl(''),
      authenticated: this.isConnected
    };
  }

  // Мок-функции для тестирования без реальных credentials

  mockUploadFile(filePath, options = {}) {
    const mockHash = `QmMock${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    
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
    const mockHash = `QmJSON${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    
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

  // Утилита для паузы
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Очистка временных файлов
  async cleanupTempFile(filePath) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.log(`[IPFS Service] Не удалось удалить временный файл ${filePath}:`, error.message);
    }
  }
}

module.exports = IPFSService; 