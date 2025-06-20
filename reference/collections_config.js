// collections_config.js
// Мастер-конфигурация для управления множественными коллекциями

module.exports = {
  // --- Основные настройки ---
  defaultArchiveBaseDir: 'archive',
  defaultMaxMintAttemptsPerCopy: 3,
  defaultMintRetryDelayMs: 7000,
  defaultConsecutiveFailureLimit: 5,
  defaultMintSuccessDelayMs: 5000,
  
  // --- Конфигурации коллекций ---
  collections: {
    "pe_stickers": {
      // Идентификатор коллекции
      id: "pe_stickers",
      name: "PE Stickers",
      
      // Метаданные коллекции
      collectionBaseName: "PE Stickers",
      collectionSymbol: "PES", 
      collectionDescription: "Коллекция стикеров от PE School",
      externalUrl: "",
      
      // Настройки минтинга
      copiesPerNft: 1,
      sellerFeeBasisPoints: 0,
      receiverAddress: "A27VztuDLCA3FwnELbCnoGQW83Rk5xfrL7A79A8xbDTP",
      
      // Файлы адресов (относительно папки коллекции)
      treeAddressFile: "tree_address.txt",
      collectionAddressFile: "collection_address.txt",
      
      // Подпись для транзакций
      signerConfig: {
        type: "env_var", // "env_var" или "file" или "multiple"
        envVarName: "PRIVATE_KEY", // для type: "env_var"
        // filePath: "path/to/keypair.json", // для type: "file"
      },
      
      // Pinata настройки (если разные для коллекций)
      pinataConfig: {
        dedicatedGateway: "https://amber-accused-tortoise-973.mypinata.cloud",
        metadataFilterName: "",
        maxUploadAttempts: 3,
        retryDelayMs: 5000,
      },
      
      // Папки (относительно папки коллекции)
      directories: {
        inputImages: "input_images",
        archive: "archive", 
        batchState: "current_batch.json",
      },
    },
    
    "crypto_cats": {
      id: "crypto_cats",
      name: "Crypto Cats",
      
      collectionBaseName: "Crypto Cats",
      collectionSymbol: "CC",
      collectionDescription: "Коллекция криптокотов",
      externalUrl: "https://example.com/cats",
      
      copiesPerNft: 5, // Больше копий для котов
      sellerFeeBasisPoints: 500, // 5% роялти
      receiverAddress: "ДРУГОЙ_АДРЕС_ПОЛУЧАТЕЛЯ", // Другой кошелек для получения
      
      treeAddressFile: "tree_address.txt",
      collectionAddressFile: "collection_address.txt",
      
      // Другой кошелек для подписи
      signerConfig: {
        type: "env_var",
        envVarName: "CATS_PRIVATE_KEY", // Отдельная переменная
      },
      
      pinataConfig: {
        dedicatedGateway: "https://другой-gateway.mypinata.cloud",
        metadataFilterName: "Crypto Cats",
        maxUploadAttempts: 5,
        retryDelayMs: 3000,
      },
      
      directories: {
        inputImages: "input_images",
        archive: "archive",
        batchState: "current_batch.json",
      },
    },
    
    "pixel_art": {
      id: "pixel_art", 
      name: "Pixel Art Collection",
      
      collectionBaseName: "Pixel Art",
      collectionSymbol: "PIXEL",
      collectionDescription: "Коллекция пиксельных NFT",
      externalUrl: "https://pixelart.com",
      
      copiesPerNft: 1,
      sellerFeeBasisPoints: 1000, // 10% роялти
      receiverAddress: "ЕЩЕ_ОДИН_АДРЕС",
      
      treeAddressFile: "tree_address.txt", 
      collectionAddressFile: "collection_address.txt",
      
      // Файловый кошелек
      signerConfig: {
        type: "file",
        filePath: "./wallets/pixel_artist.json",
      },
      
      pinataConfig: {
        dedicatedGateway: "https://pixel-gateway.mypinata.cloud",
        metadataFilterName: "Pixel Art Batch",
        maxUploadAttempts: 3,
        retryDelayMs: 5000,
      },
      
      directories: {
        inputImages: "input_images",
        archive: "archive",
        batchState: "current_batch.json",
      },
    }
  },
  
  // --- Глобальные RPC настройки (общие для всех коллекций) ---
  rpcConfig: {
    mainRpcUrl: "https://api.mainnet-beta.solana.com",
    backupRpcUrls: [
      "https://solana-api.projectserum.com",
      "https://rpc.ankr.com/solana"
    ],
  },
  
  // --- Функция получения конфигурации коллекции ---
  getCollectionConfig: function(collectionId) {
    const collection = this.collections[collectionId];
    if (!collection) {
      throw new Error(`Коллекция с ID "${collectionId}" не найдена в конфигурации`);
    }
    
    // Возвращаем конфигурацию с применением глобальных настроек
    return {
      ...collection,
      // Добавляем глобальные настройки
      maxMintAttemptsPerCopy: collection.maxMintAttemptsPerCopy || this.defaultMaxMintAttemptsPerCopy,
      mintRetryDelayMs: collection.mintRetryDelayMs || this.defaultMintRetryDelayMs,
      consecutiveFailureLimit: collection.consecutiveFailureLimit || this.defaultConsecutiveFailureLimit,
      mintSuccessDelayMs: collection.mintSuccessDelayMs || this.defaultMintSuccessDelayMs,
      rpcConfig: this.rpcConfig,
    };
  },
  
  // --- Функция получения списка коллекций ---
  getAvailableCollections: function() {
    return Object.keys(this.collections).map(id => ({
      id,
      name: this.collections[id].name,
      description: this.collections[id].collectionDescription
    }));
  }
}; 