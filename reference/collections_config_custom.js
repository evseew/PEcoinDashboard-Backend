// collections_config_custom.js
// Кастомизированная конфигурация для твоих коллекций

module.exports = {
  // --- Основные настройки ---
  defaultArchiveBaseDir: 'archive',
  defaultMaxMintAttemptsPerCopy: 3,
  defaultMintRetryDelayMs: 7000,
  defaultConsecutiveFailureLimit: 5,
  defaultMintSuccessDelayMs: 5000,
  
  // --- Конфигурации коллекций ---
  collections: {
    // СУЩЕСТВУЮЩАЯ КОЛЛЕКЦИЯ (уже работает)
    "pe_stickers": {
      id: "pe_stickers",
      name: "PE Stickers",
      
      // Используй существующие настройки
      collectionBaseName: "PE Stickers",
      collectionSymbol: "PES", 
      collectionDescription: "Коллекция стикеров от PE School",
      externalUrl: "",
      
      copiesPerNft: 1,
      sellerFeeBasisPoints: 0,
      receiverAddress: "A27VztuDLCA3FwnELbCnoGQW83Rk5xfrL7A79A8xbDTP", // Твой текущий адрес
      
      treeAddressFile: "tree_address.txt",
      collectionAddressFile: "collection_address.txt",
      
      signerConfig: {
        type: "env_var",
        envVarName: "PRIVATE_KEY", // Твой текущий ключ
      },
      
      pinataConfig: {
        dedicatedGateway: "https://amber-accused-tortoise-973.mypinata.cloud", // Твой gateway
        metadataFilterName: "",
        maxUploadAttempts: 3,
        retryDelayMs: 5000,
      },
      
      directories: {
        inputImages: "input_images",
        archive: "archive", 
        batchState: "current_batch.json",
      },
    },
    
    // НОВАЯ КОЛЛЕКЦИЯ #1 - например, премиум версия стикеров
    "pe_stickers_premium": {
      id: "pe_stickers_premium",
      name: "PE Stickers Premium",
      
      collectionBaseName: "PE Stickers Premium",
      collectionSymbol: "PESP",
      collectionDescription: "Премиум коллекция стикеров с особыми эффектами",
      externalUrl: "https://pe-school.com/premium",
      
      copiesPerNft: 1,
      sellerFeeBasisPoints: 250, // 2.5% роялти для премиум
      receiverAddress: "A27VztuDLCA3FwnELbCnoGQW83Rk5xfrL7A79A8xbDTP", // Тот же адрес или новый
      
      treeAddressFile: "tree_address.txt",
      collectionAddressFile: "collection_address.txt",
      
      signerConfig: {
        type: "env_var",
        envVarName: "PREMIUM_PRIVATE_KEY", // Новый кошелек для премиум
      },
      
      pinataConfig: {
        dedicatedGateway: "https://amber-accused-tortoise-973.mypinata.cloud",
        metadataFilterName: "PE Premium",
        maxUploadAttempts: 3,
        retryDelayMs: 5000,
      },
      
      directories: {
        inputImages: "input_images",
        archive: "archive",
        batchState: "current_batch.json",
      },
    },
    
    // НОВАЯ КОЛЛЕКЦИЯ #2 - например, коллекция персонажей
    "pe_characters": {
      id: "pe_characters",
      name: "PE Characters",
      
      collectionBaseName: "PE Characters",
      collectionSymbol: "PEC",
      collectionDescription: "Коллекция уникальных персонажей PE School",
      externalUrl: "https://pe-school.com/characters",
      
      copiesPerNft: 3, // Больше копий для персонажей
      sellerFeeBasisPoints: 500, // 5% роялти
      receiverAddress: "АДРЕС_ДЛЯ_ПЕРСОНАЖЕЙ", // Можешь использовать другой адрес
      
      treeAddressFile: "tree_address.txt",
      collectionAddressFile: "collection_address.txt",
      
      signerConfig: {
        type: "env_var",
        envVarName: "CHARACTERS_PRIVATE_KEY", // Отдельный кошелек
      },
      
      pinataConfig: {
        dedicatedGateway: "https://amber-accused-tortoise-973.mypinata.cloud",
        metadataFilterName: "PE Characters",
        maxUploadAttempts: 3,
        retryDelayMs: 5000,
      },
      
      directories: {
        inputImages: "input_images",
        archive: "archive",
        batchState: "current_batch.json",
      },
    },
    
    // НОВАЯ КОЛЛЕКЦИЯ #3 - например, лимитированная серия
    "pe_limited_edition": {
      id: "pe_limited_edition",
      name: "PE Limited Edition",
      
      collectionBaseName: "PE Limited Edition",
      collectionSymbol: "PELE",
      collectionDescription: "Лимитированная коллекция от PE School",
      externalUrl: "https://pe-school.com/limited",
      
      copiesPerNft: 1, // Уникальные NFT
      sellerFeeBasisPoints: 1000, // 10% роялти для лимитки
      receiverAddress: "АДРЕС_ДЛЯ_ЛИМИТКИ",
      
      treeAddressFile: "tree_address.txt",
      collectionAddressFile: "collection_address.txt",
      
      signerConfig: {
        type: "env_var",
        envVarName: "LIMITED_PRIVATE_KEY",
      },
      
      pinataConfig: {
        dedicatedGateway: "https://amber-accused-tortoise-973.mypinata.cloud",
        metadataFilterName: "PE Limited",
        maxUploadAttempts: 5, // Больше попыток для важной коллекции
        retryDelayMs: 3000,
      },
      
      directories: {
        inputImages: "input_images",
        archive: "archive",
        batchState: "current_batch.json",
      },
    }
  },
  
  // --- Глобальные RPC настройки ---
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
    
    return {
      ...collection,
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