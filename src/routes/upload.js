const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

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
    
    // Временная симуляция загрузки на IPFS (потом заменим на Pinata)
    const uploads = files.map(file => {
      const mockHash = `Qm${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
      
      return {
        filename: file.originalname,
        ipfsHash: mockHash,
        ipfsUri: `ipfs://${mockHash}`,
        gatewayUrl: `https://gateway.pinata.cloud/ipfs/${mockHash}`,
        size: file.size,
        mimetype: file.mimetype,
        uploadId: uuidv4()
      };
    });
    
    // Симуляция задержки загрузки
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    res.json({
      success: true,
      data: {
        uploads,
        totalFiles: uploads.length,
        totalSize: uploads.reduce((sum, upload) => sum + upload.size, 0),
        metadata: metadata || null
      },
      message: `Successfully uploaded ${uploads.length} file(s) to IPFS`
    });
    
  } catch (error) {
    console.error('IPFS upload error:', error);
    
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
    
    // Временная симуляция загрузки JSON на IPFS
    const mockHash = `Qm${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    const metadataFilename = filename || `metadata-${uuidv4()}.json`;
    
    // Симуляция задержки
    await new Promise(resolve => setTimeout(resolve, 500));
    
    res.json({
      success: true,
      data: {
        filename: metadataFilename,
        ipfsHash: mockHash,
        ipfsUri: `ipfs://${mockHash}`,
        gatewayUrl: `https://gateway.pinata.cloud/ipfs/${mockHash}`,
        metadata
      },
      message: 'Metadata uploaded to IPFS successfully'
    });
    
  } catch (error) {
    console.error('Metadata upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Metadata upload failed',
      message: error.message
    });
  }
});

// GET /api/upload/status - Статус загрузок (для будущих фич)
router.get('/status', async (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'IPFS Upload Service',
      provider: 'Pinata (simulated)',
      status: 'operational',
      limits: {
        maxFileSize: '10MB',
        maxFiles: 50,
        allowedTypes: ['jpeg', 'png', 'gif', 'webp', 'svg']
      }
    }
  });
});

module.exports = router; 