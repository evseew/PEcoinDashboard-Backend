// config.js
// Настройки пайплайна для создания сжатых NFT

module.exports = {
  // --- Базовая информация о коллекции/NFT ---
  collectionBaseName: "PE Stickers", // Будет использовано в имени NFT, например "PE Stickers #1"
  collectionSymbol: "PES", // Символ NFT (обычно 3-5 букв)
  collectionDescription: "Коллекция стикеров от PE School", // Описание для метаданных
  externalUrl: "", // Ссылка на ваш сайт или страницу коллекции (необязательно)

  // --- Настройки Минтинга ---
  copiesPerNft: 1, // Сколько копий каждого уникального NFT создавать
  // Адрес дерева Меркла (читается из файла)
  treeAddressFilePath: 'tree_address.txt',
  // Адрес коллекции NFT (стандарта Token Metadata, читается из файла)
  collectionAddressFilePath: 'collection_address.txt',
  // Адрес кошелька, НА который будут отправлены созданные NFT
  receiverAddress: "A27VztuDLCA3FwnELbCnoGQW83Rk5xfrL7A79A8xbDTP",
  // Роялти (sellerFeeBasisPoints): 500 = 5%
  sellerFeeBasisPoints: 0,

  // --- Настройки Pinata ---
  // Адрес ВАШЕГО выделенного шлюза Pinata (замени на свой!)
  dedicatedPinataGateway: "https://amber-accused-tortoise-973.mypinata.cloud",
  // Имя для фильтрации в Pinata API (полезно, если в аккаунте много всего)
  // Оставь пустым, если не нужно фильтровать по имени при запросе списка
  pinataMetadataFilterName: "", // Пример: "PE Sticker Batch"

  // --- Настройки Пайплайна и Обработки Ошибок ---
  // Папки
  inputImagesDir: 'input_images',
  archiveBaseDir: 'archive',
  // Файл состояния
  batchStateFile: 'current_batch.json',
  // Попытки и задержки
  maxPinataUploadAttempts: 3, // Макс. попыток загрузки на Pinata
  pinataRetryDelayMs: 5000,   // Пауза между попытками Pinata (мс)
  maxMintAttemptsPerCopy: 3,  // Макс. попыток минтинга одной копии
  mintRetryDelayMs: 7000,     // Пауза между стандартными попытками минтинга (мс)
  // Лимит последовательных ошибок для остановки
  consecutiveFailureLimit: 5,
  // Задержка между успешными транзакциями минтинга (для стабильности RPC)
  mintSuccessDelayMs: 5000,   // 5 секунд (увеличено для стабильности)

  // --- Настройки Solana RPC ---
  // Основной и резервные RPC (читаются из .env, но можно задать и здесь)
  // mainRpcUrl: "https://api.mainnet-beta.solana.com",
  // backupRpcUrls: ["https://solana-api.projectserum.com", "https://rpc.ankr.com/solana"],
}; 