const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Ленивая инициализация IPFS сервиса
let ipfsService = null;

function getIPFSService() {
  if (!ipfsService) {
    const IPFSService = require('../services/ipfs');
    ipfsService = new IPFSService();
  }
  return ipfsService;
}

// Middleware для файлов
const upload = multer({ 
  dest: '/tmp/uploads/',
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 50 // максимум 50 файлов за раз
  },
  fileFilter: (req, file, cb) => {
    // Проверяем тип файла
    const allowedMimes = [
      'image/jpeg',
      'image/png', 
      'image/gif',
      'image/webp',
      'image/svg+xml'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
    }
  }
});

// POST /api/upload/ipfs - Загрузка на IPFS
router.post('/ipfs', upload.array('files', 50), async (req, res) => {
  let tempFiles = [];
  
  try {
    const files = req.files;
    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : null;
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files provided',
        message: 'Please provide files to upload'
      });
    }
    
    // Запоминаем временные файлы для очистки
    tempFiles = files.map(f => f.path);
    
    console.log(`[Upload API] Загрузка ${files.length} файлов на IPFS`);
    
    const ipfsService = getIPFSService();
    const batchId = uuidv4();
    
    // Загружаем файлы на IPFS
    const uploadResult = await ipfsService.uploadMultipleFiles(files, {
      batchId,
      metadata
    });
    
    // Очищаем временные файлы
    for (const filePath of tempFiles) {
      await ipfsService.cleanupTempFile(filePath);
    }
    
    // Формируем ответ
    const response = {
      success: true,
      data: {
        uploads: uploadResult.successful,
        totalFiles: uploadResult.totalFiles,
        successCount: uploadResult.successCount,
        errorCount: uploadResult.errorCount,
        totalSize: uploadResult.successful.reduce((sum, upload) => sum + upload.size, 0),
        batchId,
        metadata: metadata || null
      },
      message: `Successfully uploaded ${uploadResult.successCount}/${uploadResult.totalFiles} file(s) to IPFS`
    };
    
    // Добавляем информацию об ошибках, если есть
    if (uploadResult.errorCount > 0) {
      response.data.errors = uploadResult.failed;
      response.warnings = `${uploadResult.errorCount} files failed to upload`;
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('[Upload API] IPFS upload error:', error);
    
    // Очищаем временные файлы в случае ошибки
    for (const filePath of tempFiles) {
      try {
        const ipfsService = getIPFSService();
        await ipfsService.cleanupTempFile(filePath);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }
    
    // Специальная обработка multer ошибок
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large',
        message: 'File size must be less than 10MB'
      });
    }
    
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files',
        message: 'Maximum 50 files allowed per upload'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Upload failed',
      message: error.message
    });
  }
});

// POST /api/upload/metadata - Загрузка JSON метаданных
router.post('/metadata', async (req, res) => {
  try {
    const { metadata, filename } = req.body;
    
    if (!metadata) {
      return res.status(400).json({
        success: false,
        error: 'No metadata provided',
        message: 'Please provide metadata object'
      });
    }
    
    // Валидация NFT метаданных
    if (!metadata.name) {
      return res.status(400).json({
        success: false,
        error: 'Invalid metadata',
        message: 'Metadata must include name field'
      });
    }
    
    console.log('[Upload API] Загрузка JSON метаданных на IPFS');
    
    const ipfsService = getIPFSService();
    const metadataFilename = filename || `metadata-${uuidv4()}.json`;
    
    // Загружаем JSON на IPFS
    const result = await ipfsService.uploadJSON(metadata, {
      name: metadataFilename,
      metadata: {
        type: 'nft-metadata',
        uploadedAt: new Date().toISOString()
      }
    });
    
    res.json({
      success: true,
      data: {
        filename: metadataFilename,
        ipfsHash: result.ipfsHash,
        ipfsUri: result.ipfsUri,
        gatewayUrl: result.gatewayUrl,
        size: result.size,
        timestamp: result.timestamp,
        metadata,
        mock: result.mock || false
      },
      message: 'Metadata uploaded to IPFS successfully'
    });
    
  } catch (error) {
    console.error('[Upload API] Metadata upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Metadata upload failed',
      message: error.message
    });
  }
});

// GET /api/upload/status - Статус IPFS сервиса
router.get('/status', async (req, res) => {
  try {
    const ipfsService = getIPFSService();
    const serviceStatus = ipfsService.getServiceStatus();
    
    res.json({
      success: true,
      data: {
        service: 'IPFS Upload Service',
        ...serviceStatus,
        limits: {
          maxFileSize: '10MB',
          maxFiles: 50,
          allowedTypes: ['jpeg', 'png', 'gif', 'webp', 'svg']
        },
        endpoints: {
          upload: '/api/upload/ipfs',
          metadata: '/api/upload/metadata',
          status: '/api/upload/status'
        }
      }
    });
    
  } catch (error) {
    console.error('[Upload API] Status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service status',
      message: error.message
    });
  }
});

module.exports = router; 