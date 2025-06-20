// collection_manager.js
// Менеджер для работы с множественными коллекциями

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');
const collectionsConfig = require('./collections_config');

class CollectionManager {
  constructor() {
    this.baseDir = process.cwd();
    this.collectionsDir = path.join(this.baseDir, 'collections');
  }

  // Инициализация структуры папок для коллекций
  async initializeStructure() {
    console.log("[Менеджер] Инициализация структуры коллекций...");
    
    // Создаем базовую папку коллекций
    await fs.mkdir(this.collectionsDir, { recursive: true });
    
    // Создаем папки для каждой коллекции
    const collections = collectionsConfig.getAvailableCollections();
    
    for (const collection of collections) {
      const collectionPath = path.join(this.collectionsDir, collection.id);
      await fs.mkdir(collectionPath, { recursive: true });
      
      const config = collectionsConfig.getCollectionConfig(collection.id);
      
      // Создаем подпапки
      await fs.mkdir(path.join(collectionPath, config.directories.inputImages), { recursive: true });
      await fs.mkdir(path.join(collectionPath, config.directories.archive), { recursive: true });
      
      console.log(`[Менеджер] ✅ Структура для коллекции "${collection.name}" создана`);
    }
    
    console.log(`[Менеджер] Структура инициализирована в: ${this.collectionsDir}`);
  }

  // Список доступных коллекций
  listCollections() {
    const collections = collectionsConfig.getAvailableCollections();
    console.log("\n=== Доступные коллекции ===");
    collections.forEach((collection, index) => {
      console.log(`${index + 1}. ${collection.name} (${collection.id})`);
      console.log(`   Описание: ${collection.description}`);
    });
    return collections;
  }

  // Интерактивный выбор коллекции
  async selectCollectionInteractive() {
    const collections = this.listCollections();
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('\nВыберите коллекцию (введите номер): ', (answer) => {
        rl.close();
        const index = parseInt(answer) - 1;
        if (index >= 0 && index < collections.length) {
          resolve(collections[index].id);
        } else {
          console.error("Неверный номер коллекции");
          resolve(null);
        }
      });
    });
  }

  // Создание конфигурации для выбранной коллекции
  async generateConfigForCollection(collectionId) {
    const config = collectionsConfig.getCollectionConfig(collectionId);
    const collectionPath = path.join(this.collectionsDir, collectionId);
    
    // Формируем конфигурацию в формате старого config.js
    const legacyConfig = {
      // Метаданные коллекции
      collectionBaseName: config.collectionBaseName,
      collectionSymbol: config.collectionSymbol,
      collectionDescription: config.collectionDescription,
      externalUrl: config.externalUrl,
      
      // Настройки минтинга
      copiesPerNft: config.copiesPerNft,
      sellerFeeBasisPoints: config.sellerFeeBasisPoints,
      receiverAddress: config.receiverAddress,
      
      // Файлы адресов (абсолютные пути)
      treeAddressFilePath: path.join(collectionPath, config.treeAddressFile),
      collectionAddressFilePath: path.join(collectionPath, config.collectionAddressFile),
      
      // Pinata настройки
      dedicatedPinataGateway: config.pinataConfig.dedicatedGateway,
      pinataMetadataFilterName: config.pinataConfig.metadataFilterName,
      maxPinataUploadAttempts: config.pinataConfig.maxUploadAttempts,
      pinataRetryDelayMs: config.pinataConfig.retryDelayMs,
      
      // Папки (абсолютные пути)
      inputImagesDir: path.join(collectionPath, config.directories.inputImages),
      archiveBaseDir: path.join(collectionPath, config.directories.archive),
      batchStateFile: path.join(collectionPath, config.directories.batchState),
      
      // Настройки повторов и задержек
      maxMintAttemptsPerCopy: config.maxMintAttemptsPerCopy,
      mintRetryDelayMs: config.mintRetryDelayMs,
      consecutiveFailureLimit: config.consecutiveFailureLimit,
      mintSuccessDelayMs: config.mintSuccessDelayMs,
    };
    
    return { legacyConfig, collectionPath, signerConfig: config.signerConfig };
  }

  // Настройка переменных окружения для выбранной коллекции
  async setupEnvironmentForCollection(collectionId) {
    const config = collectionsConfig.getCollectionConfig(collectionId);
    const signerConfig = config.signerConfig;
    
    console.log(`[Менеджер] Настройка окружения для коллекции: ${config.name}`);
    
    // Настройка переменной для приватного ключа
    let privateKey;
    
    switch (signerConfig.type) {
      case 'env_var':
        privateKey = process.env[signerConfig.envVarName];
        if (!privateKey) {
          throw new Error(`Переменная окружения ${signerConfig.envVarName} не найдена для коллекции ${collectionId}`);
        }
        // Устанавливаем стандартное имя для совместимости
        process.env.PRIVATE_KEY = privateKey;
        console.log(`[Менеджер] ✅ Приватный ключ загружен из ${signerConfig.envVarName}`);
        break;
        
      case 'file':
        try {
          const keyData = await fs.readFile(signerConfig.filePath, 'utf8');
          const keyArray = JSON.parse(keyData);
          // Конвертируем в base58 если нужно
          const bs58 = require('bs58');
          privateKey = bs58.encode(Uint8Array.from(keyArray));
          process.env.PRIVATE_KEY = privateKey;
          console.log(`[Менеджер] ✅ Приватный ключ загружен из файла ${signerConfig.filePath}`);
        } catch (err) {
          throw new Error(`Ошибка загрузки ключа из файла ${signerConfig.filePath}: ${err.message}`);
        }
        break;
        
      default:
        throw new Error(`Неподдерживаемый тип подписи: ${signerConfig.type}`);
    }
    
    return true;
  }

  // Запуск пайплайна для выбранной коллекции
  async runPipelineForCollection(collectionId, resumeMode = false) {
    console.log(`\n[Менеджер] Запуск пайплайна для коллекции: ${collectionId}`);
    
    try {
      // 1. Настройка окружения
      await this.setupEnvironmentForCollection(collectionId);
      
      // 2. Генерация конфигурации
      const { legacyConfig, collectionPath } = await this.generateConfigForCollection(collectionId);
      
      // 3. Создание временного config.js
      const tempConfigPath = path.join(this.baseDir, 'temp_config.js');
      const configContent = `module.exports = ${JSON.stringify(legacyConfig, null, 2)};`;
      await fs.writeFile(tempConfigPath, configContent, 'utf8');
      
      // 4. Резервное копирование оригинального config.js
      const originalConfigPath = path.join(this.baseDir, 'config.js');
      const backupConfigPath = path.join(this.baseDir, 'config_backup.js');
      
      try {
        await fs.copyFile(originalConfigPath, backupConfigPath);
      } catch (err) {
        // Игнорируем если оригинального файла нет
      }
      
      // 5. Замена config.js
      await fs.rename(tempConfigPath, originalConfigPath);
      
      // 6. Смена рабочей директории (концептуально)
      const originalCwd = process.cwd();
      
      console.log(`[Менеджер] Конфигурация применена для коллекции ${collectionId}`);
      console.log(`[Менеджер] Рабочая папка коллекции: ${collectionPath}`);
      
      // 7. Запуск пайплайна
      let success = false;
      try {
        if (!resumeMode) {
          console.log("[Менеджер] Запуск этапа подготовки...");
          execSync('node prepare_batch.js', { stdio: 'inherit', cwd: this.baseDir });
        }
        
        console.log("[Менеджер] Запуск этапа минтинга...");
        execSync('node mint_nft_stable.js', { stdio: 'inherit', cwd: this.baseDir });
        
        success = true;
        console.log(`[Менеджер] ✅ Пайплайн для коллекции ${collectionId} завершен успешно`);
        
      } catch (error) {
        console.error(`[Менеджер] ❌ Ошибка в пайплайне для коллекции ${collectionId}`);
        throw error;
      } finally {
        // 8. Восстановление оригинального config.js
        try {
          await fs.rename(backupConfigPath, originalConfigPath);
          console.log("[Менеджер] Оригинальная конфигурация восстановлена");
        } catch (err) {
          console.warn("[Менеджер] Не удалось восстановить оригинальную конфигурацию:", err.message);
        }
      }
      
      return success;
      
    } catch (error) {
      console.error(`[Менеджер] Ошибка выполнения для коллекции ${collectionId}:`, error.message);
      throw error;
    }
  }

  // Создание новой коллекции
  async createCollection(collectionId) {
    const config = collectionsConfig.getCollectionConfig(collectionId);
    const collectionPath = path.join(this.collectionsDir, collectionId);
    
    console.log(`[Менеджер] Создание коллекции "${config.name}" на блокчейне...`);
    
    // Настраиваем окружение
    await this.setupEnvironmentForCollection(collectionId);
    
    // Модифицируем скрипт создания коллекции для конкретной коллекции
    // Здесь можно адаптировать create_collection.js под конкретную коллекцию
    
    console.log(`[Менеджер] Запуск создания коллекции...`);
    try {
      execSync('node create_collection.js', { stdio: 'inherit', cwd: this.baseDir });
      
      // Перемещаем созданный collection_address.txt в папку коллекции
      const sourceFile = path.join(this.baseDir, 'collection_address.txt');
      const targetFile = path.join(collectionPath, 'collection_address.txt');
      await fs.rename(sourceFile, targetFile);
      
      console.log(`[Менеджер] ✅ Коллекция создана, адрес сохранен в ${targetFile}`);
      
    } catch (error) {
      console.error(`[Менеджер] ❌ Ошибка создания коллекции:`, error.message);
      throw error;
    }
  }

  // Статус коллекций
  async getCollectionsStatus() {
    const collections = collectionsConfig.getAvailableCollections();
    const status = [];
    
    for (const collection of collections) {
      const collectionPath = path.join(this.collectionsDir, collection.id);
      const config = collectionsConfig.getCollectionConfig(collection.id);
      
      const collectionAddressFile = path.join(collectionPath, config.collectionAddressFile);
      const treeAddressFile = path.join(collectionPath, config.treeAddressFile);
      const batchStateFile = path.join(collectionPath, config.directories.batchState);
      
      let collectionExists = false;
      let treeExists = false;
      let hasActiveBatch = false;
      
      try {
        await fs.access(collectionAddressFile);
        collectionExists = true;
      } catch {}
      
      try {
        await fs.access(treeAddressFile);
        treeExists = true;
      } catch {}
      
      try {
        await fs.access(batchStateFile);
        hasActiveBatch = true;
      } catch {}
      
      status.push({
        id: collection.id,
        name: collection.name,
        collectionExists,
        treeExists,
        hasActiveBatch,
        path: collectionPath
      });
    }
    
    return status;
  }
}

module.exports = CollectionManager; 