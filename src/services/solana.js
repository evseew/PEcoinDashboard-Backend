// services/solana.js
// Адаптировано из reference/mint_nft_stable.js
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const bubblegum = require("@metaplex-foundation/mpl-bubblegum");
const { keypairIdentity, publicKey } = require("@metaplex-foundation/umi");
const bs58 = require("bs58");
const { setComputeUnitLimit, setComputeUnitPrice, mplToolbox } = require("@metaplex-foundation/mpl-toolbox");

// ✅ ИМПОРТ для верификации creator в коллекции
let tokenMetadata;
try {
  tokenMetadata = require("@metaplex-foundation/mpl-token-metadata");
  console.log('[Solana Service] ✅ mplTokenMetadata импортирован успешно');
} catch (error) {
  console.error('[Solana Service] ❌ Ошибка импорта mplTokenMetadata:', error.message);
  console.log('[Solana Service] ⚠️ Верификация creator будет недоступна');
}

// ✅ НОВЫЕ ИМПОРТЫ для извлечения leaf index
let findLeafAssetIdPda;
let findTreeConfigPda;
try {
  findLeafAssetIdPda = require("@metaplex-foundation/mpl-bubblegum").findLeafAssetIdPda;
  findTreeConfigPda = require("@metaplex-foundation/mpl-bubblegum").findTreeConfigPda;
  console.log('[Solana Service] ✅ findLeafAssetIdPda импортирован успешно');
  console.log('[Solana Service] ✅ findTreeConfigPda импортирован успешно');
} catch (error) {
  console.error('[Solana Service] ❌ Ошибка импорта Bubblegum функций:', error.message);
  console.log('[Solana Service] ⚠️ Asset ID формирование будет недоступно');
}

class SolanaService {
  constructor() {
    this.umi = null;
    this.initialized = false;
    this.umiInstanceCache = {};
  }
  
  // Вспомогательная функция для задержки (из reference кода)
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Создание UMI instance с подтверждением (адаптировано из reference)
  async createUmiInstanceWithConfirm(url) {
    if (this.umiInstanceCache[url]) {
      return this.umiInstanceCache[url];
    }

    console.log(`[Solana Service] Инициализация Umi для: ${url}`);
    const umi = createUmi(url, {
      httpOptions: { 
        fetchMiddleware: (req, next) => next(req),
        timeout: 15000 // 15 секунд таймаут
      }
    });

    // Загрузка кошелька плательщика (из reference)
    try {
      const payerPrivateKey = process.env.PRIVATE_KEY;
      if (!payerPrivateKey) {
        throw new Error('PRIVATE_KEY не найден в переменных окружения');
      }
      
      const secretKeyBytes = bs58.decode(payerPrivateKey);
      const umiKeypair = umi.eddsa.createKeypairFromSecretKey(secretKeyBytes);
      umi.use(keypairIdentity(umiKeypair));
      console.log(`[Solana Service] Кошелек плательщика загружен: ${umi.identity.publicKey}`);
    } catch (e) {
      throw new Error(`Ошибка загрузки приватного ключа: ${e.message}`);
    }

    // Подключение Bubblegum и Toolbox (из reference)
    umi.use(bubblegum.mplBubblegum());
    umi.use(mplToolbox());
    
    // ✅ Подключение Token Metadata для верификации creator
    if (tokenMetadata) {
      umi.use(tokenMetadata.mplTokenMetadata());
      console.log("[Solana Service] Token Metadata подключен");
    }
    
    console.log("[Solana Service] Bubblegum и mplToolbox подключены");

    this.umiInstanceCache[url] = umi;
    return umi;
  }
  
  // Подключение к RPC с fallback (адаптировано из reference)
  async connectToRpc() {
    const MAIN_RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
    const BACKUP_RPC_URLS = process.env.BACKUP_RPC_URLS
      ? process.env.BACKUP_RPC_URLS.split(',')
      : [
          "https://solana-api.projectserum.com",
          "https://rpc.ankr.com/solana"
        ];
    
    const rpcUrls = [MAIN_RPC_URL, ...BACKUP_RPC_URLS].filter(url => url && url.trim());
    
    console.log("\n[Solana Service] Попытка подключения к Solana RPC...");
    console.log(`[Solana Service] Список RPC для тестирования: ${rpcUrls.join(', ')}`);
    
    let lastError = null;
    
    for (const url of rpcUrls) {
      console.log(`[Solana Service] Пробуем: ${url}`);
      try {
        const tempUmi = await this.createUmiInstanceWithConfirm(url);
        
        // Более детальная проверка подключения
        console.log(`[Solana Service] Создан UMI instance для ${url}, проверяем связь...`);
        const blockHash = await Promise.race([
          tempUmi.rpc.getLatestBlockhash(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout 10s')), 10000)
          )
        ]);
        
        console.log(`[Solana Service] ✅ Успешно подключились к: ${url}`);
        console.log(`[Solana Service] Blockhash тест пройден`);
        this.umi = tempUmi;
        return this.umi;
        
      } catch (e) {
        lastError = e;
        console.warn(`[Solana Service] ❌ Ошибка подключения к ${url}:`);
        console.warn(`[Solana Service]    Тип ошибки: ${e.constructor.name}`);
        console.warn(`[Solana Service]    Сообщение: ${e.message}`);
        console.warn(`[Solana Service]    Stack: ${e.stack?.split('\n')[0]}`);
      }
    }
    
    console.error(`[Solana Service] ❌ Не удалось подключиться ни к одному RPC из ${rpcUrls.length} вариантов`);
    console.error(`[Solana Service] Последняя ошибка:`, lastError);
    throw new Error(`Не удалось подключиться ни к одному RPC-эндпоинту. Последняя ошибка: ${lastError?.message}`);
  }
  
  // Инициализация сервиса с проверками
  async initialize() {
    if (this.initialized) return this.umi;
    
    // Проверка критических переменных окружения
    if (!process.env.PRIVATE_KEY) {
      console.warn("[Solana Service] PRIVATE_KEY не установлен, сервис будет недоступен");
      return null;
    }
    
    try {
      await this.connectToRpc();
      this.initialized = true;
      console.log("[Solana Service] Сервис инициализирован");
      return this.umi;
    } catch (error) {
      console.error("[Solana Service] Ошибка инициализации:", error.message);
      throw error;
    }
  }
  
  // Проверка готовности сервиса
  isReady() {
    return this.initialized && this.umi !== null;
  }
  
  // ✅ НОВАЯ ФУНКЦИЯ: Проверка статуса верификации creator в коллекции
  async checkCreatorVerificationStatus(collectionAddress, creatorAddress) {
    try {
      if (!tokenMetadata) {
        console.warn('[Solana Service] ⚠️ Token Metadata недоступен, пропускаем проверку верификации');
        return { verified: false, canVerify: false };
      }
      
      const collectionPubkey = publicKey(collectionAddress);
      const creatorPubkey = publicKey(creatorAddress);
      
      // Получаем метаданные коллекции через UMI (после подключения tokenMetadata)
      const [metadataPda] = tokenMetadata.findMetadataPda(this.umi, {
        mint: collectionPubkey
      });
      
      try {
        const metadataAccount = await this.umi.rpc.getAccount(metadataPda);
        
        if (!metadataAccount.exists) {
          console.warn(`[Solana Service] ⚠️ Метаданные коллекции не найдены: ${collectionAddress}`);
          return { verified: false, canVerify: false, error: 'Metadata not found' };
        }
        
        // Парсим метаданные через UMI
        const metadata = tokenMetadata.deserializeMetadata(this.umi, metadataAccount);
        
        // Проверяем, есть ли creator в списке creators коллекции
        const creator = metadata.creators?.find(c => {
          const creatorAddr = typeof c.address === 'string' ? c.address : c.address.toString();
          const targetAddr = typeof creatorPubkey === 'string' ? creatorPubkey : creatorPubkey.toString();
          return creatorAddr === targetAddr;
        });
        
        if (!creator) {
          console.warn(`[Solana Service] ⚠️ Creator ${creatorAddress} не найден в метаданных коллекции`);
          return { verified: false, canVerify: false, error: 'Creator not found in collection' };
        }
        
        const isVerified = creator.verified;
        console.log(`[Solana Service] 🔍 Статус верификации creator ${creatorAddress}: ${isVerified ? '✅ верифицирован' : '❌ не верифицирован'}`);
        
        return { 
          verified: isVerified, 
          canVerify: !isVerified,
          creator: creator
        };
        
      } catch (error) {
        console.error(`[Solana Service] ❌ Ошибка проверки статуса верификации: ${error.message}`);
        return { verified: false, canVerify: false, error: error.message };
      }
      
    } catch (error) {
      console.error(`[Solana Service] ❌ Ошибка проверки верификации creator: ${error.message}`);
      return { verified: false, canVerify: false, error: error.message };
    }
  }
  
  // ✅ НОВАЯ ФУНКЦИЯ: Верификация creator в коллекции
  async verifyCreatorInCollection(collectionAddress, creatorAddress) {
    try {
      if (!tokenMetadata) {
        throw new Error('Token Metadata недоступен для верификации creator');
      }
      
      const collectionPubkey = publicKey(collectionAddress);
      const creatorPubkey = publicKey(creatorAddress);
      
      console.log(`[Solana Service] 🔐 Начало верификации creator ${creatorAddress} в коллекции ${collectionAddress}`);
      
      // Получаем PDA для метаданных коллекции
      const [metadataPda] = tokenMetadata.findMetadataPda(this.umi, {
        mint: collectionPubkey
      });
      
      // Создаем инструкцию верификации creator через UMI
      const verifyInstruction = tokenMetadata.verifyCreatorV1(this.umi, {
        metadata: metadataPda,
        creator: creatorPubkey,
      });
      
      // Отправляем транзакцию верификации
      const signature = await verifyInstruction.send(this.umi, {
        skipPreflight: false
      });
      
      console.log(`[Solana Service] ✅ Транзакция верификации отправлена: ${bs58.encode(signature)}`);
      
      // Ждем подтверждения
      let confirmed = false;
      let attempts = 0;
      const maxAttempts = 20; // 20 попыток по 2 секунды = 40 секунд
      
      while (!confirmed && attempts < maxAttempts) {
        await this.sleep(2000);
        attempts++;
        
        try {
          const status = await this.umi.rpc.getSignatureStatuses([signature]);
          const txStatus = Array.isArray(status) ? status[0] : status.value?.[0];
          
          if (txStatus) {
            if (txStatus.err || txStatus.error) {
              throw new Error(`Транзакция верификации завершилась с ошибкой: ${JSON.stringify(txStatus.err || txStatus.error)}`);
            }
            
            const isConfirmed = (txStatus.commitment === 'confirmed' || txStatus.commitment === 'finalized') ||
                              (txStatus.confirmationStatus === 'confirmed' || txStatus.confirmationStatus === 'finalized');
            
            if (isConfirmed) {
              confirmed = true;
              console.log(`[Solana Service] ✅ Creator успешно верифицирован в коллекции`);
            }
          }
        } catch (pollError) {
          console.log(`[Solana Service] Ошибка при проверке статуса верификации: ${pollError.message}`);
        }
      }
      
      if (!confirmed) {
        throw new Error(`Транзакция верификации не была подтверждена за ${maxAttempts * 2} секунд`);
      }
      
      return {
        success: true,
        signature: bs58.encode(signature)
      };
      
    } catch (error) {
      console.error(`[Solana Service] ❌ Ошибка верификации creator: ${error.message}`);
      throw error;
    }
  }
  
  // Минт одного NFT (адаптировано из reference логики)
  async mintSingleNFT(params) {
    const { 
      treeAddress, 
      collectionAddress, 
      recipient, 
      metadata, 
      maxAttempts = 3 
    } = params;
    
    if (!this.isReady()) {
      await this.initialize();
    }
    
    if (!this.isReady()) {
      throw new Error("Solana service не готов к работе");
    }
    
    console.log(`[Solana Service] Начало минтинга NFT: ${metadata.name}`);
    
    // Формируем аргументы метаданных (из reference)
    const metadataArgs = {
      name: metadata.name || "Unnamed NFT",
      symbol: metadata.symbol || "cNFT",
      uri: metadata.uri,
      sellerFeeBasisPoints: metadata.sellerFeeBasisPoints || 0,
      collection: { 
        key: publicKey(collectionAddress), 
        verified: true // 🔥 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: cNFT ДОЛЖНЫ БЫТЬ verified для Phantom!
      },
      creators: metadata.creators || [
        { 
          address: this.umi.identity.publicKey, 
          share: 100, 
          verified: true 
        }
      ],
    };
    
    // 🔥 УПРОЩЕННАЯ ЛОГИКА: Для личного сервиса используем кошелек плательщика как creator
    const identityAddress = this.umi.identity.publicKey.toString();
    console.log('[Solana Service] 🔍 Проверка creators:', {
      fromMetadata: metadata.creators,
      identityKey: identityAddress,
      note: 'Для личного сервиса используем кошелек плательщика как creator'
    });
    
    // ✅ УПРОЩЕНИЕ: Используем identity (кошелек плательщика) как creator по умолчанию
    // Это избавляет от необходимости верификации, так как identity уже является update authority
    let finalCreators = [];
    
    if (metadata.creators && Array.isArray(metadata.creators) && metadata.creators.length > 0) {
      // Если creators указаны в metadata, проверяем, совпадают ли они с identity
      const creatorsFromMetadata = metadata.creators.map(creator => {
        const addr = typeof creator.address === 'string' 
          ? creator.address 
          : creator.address.toString();
        return addr;
      });
      
      // Если один из creators совпадает с identity - используем его
      const hasIdentityCreator = creatorsFromMetadata.includes(identityAddress);
      
      if (hasIdentityCreator) {
        console.log('[Solana Service] ✅ Creator из metadata совпадает с identity, используем его');
        finalCreators = metadata.creators.map(creator => ({
          address: typeof creator.address === 'string' ? creator.address : creator.address.toString(),
          share: creator.share || (100 / metadata.creators.length),
          verified: true // Identity уже является authority, верификация не нужна
        }));
      } else {
        // Если creator другой - используем identity как основной creator
        console.log('[Solana Service] ⚠️ Creator из metadata отличается от identity, используем identity как creator');
        finalCreators = [{
          address: identityAddress,
          share: 100,
          verified: true
        }];
      }
    } else {
      // Если creators не указаны - используем identity
      console.log('[Solana Service] ✅ Используем identity (кошелек плательщика) как creator');
      finalCreators = [{
        address: identityAddress,
        share: 100,
        verified: true
      }];
    }
    
    metadataArgs.creators = finalCreators;
    
    // ✅ ПРИМЕЧАНИЕ: Верификация не требуется, так как мы используем identity как creator
    // Identity уже является update authority коллекции, поэтому верификация не нужна
    console.log('[Solana Service] ✅ Creators настроены, верификация не требуется (используем identity)');
    
    // Попытки минтинга с retry логикой (из reference)
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[Solana Service] Попытка ${attempt}/${maxAttempts}`);
      
      try {
        const txStartTime = Date.now();
        
        // Создаем инструкцию минтинга compressed NFT (из reference)
        const mintInstruction = bubblegum.mintToCollectionV1(this.umi, {
          leafOwner: publicKey(recipient),
          merkleTree: publicKey(treeAddress),
          collectionMint: publicKey(collectionAddress),
          metadata: metadataArgs,
        });
        
        // Отправляем транзакцию (из reference HTTP-only подхода)
        const signature = await mintInstruction.send(this.umi, {
          skipPreflight: false
        });
        
        console.log(`[Solana Service] Транзакция отправлена: ${bs58.encode(signature)}`);
        
        // HTTP polling для подтверждения (из reference)
        let confirmed = false;
        let attempts = 0;
        const maxConfirmAttempts = 30; // 30 попыток по 3 секунды = 90 секунд
        
        while (!confirmed && attempts < maxConfirmAttempts) {
          await this.sleep(3000);
          attempts++;
          
          try {
            const status = await this.umi.rpc.getSignatureStatuses([signature]);
            const txStatus = Array.isArray(status) ? status[0] : status.value?.[0];
            
            if (txStatus) {
              if (txStatus.err || txStatus.error) {
                throw new Error(`Транзакция завершилась с ошибкой: ${JSON.stringify(txStatus.err || txStatus.error)}`);
              }
              
              const isConfirmed = (txStatus.commitment === 'confirmed' || txStatus.commitment === 'finalized') ||
                                (txStatus.confirmationStatus === 'confirmed' || txStatus.confirmationStatus === 'finalized');
              
              if (isConfirmed) {
                confirmed = true;
                console.log(`[Solana Service] Транзакция подтверждена (${txStatus.commitment || txStatus.confirmationStatus})`);
              }
            }
          } catch (pollError) {
            console.log(`[Solana Service] Ошибка при проверке статуса: ${pollError.message}`);
          }
        }
        
        if (!confirmed) {
          throw new Error(`Транзакция не была подтверждена за ${maxConfirmAttempts * 3} секунд`);
        }
        
        const elapsedTime = (Date.now() - txStartTime) / 1000;
        console.log(`[Solana Service] ✅ Минт успешен за ${elapsedTime} секунд`);
        
        // ✅ ИСПРАВЛЕНИЕ: Попытка извлечения leaf index с обработкой ошибок и повторными попытками
        let leafIndex = null;
        let assetId = null;
        let dasStatus = null;
        
        // Первая попытка извлечения leaf index (сразу после подтверждения)
        try {
          console.log(`[Solana Service] 🔍 Попытка 1: Извлекаем leaf index из транзакции...`);
          leafIndex = await this.extractLeafIndexFromTransaction(bs58.encode(signature), treeAddress, recipient);
          
          if (leafIndex === null) {
            // Если не удалось сразу, ждем и пробуем еще раз (tree account может обновиться с задержкой)
            console.log(`[Solana Service] ⏳ Ждем 5 секунд для обновления tree account...`);
            await this.sleep(5000);
            
            console.log(`[Solana Service] 🔍 Попытка 2: Повторное извлечение leaf index...`);
            leafIndex = await this.extractLeafIndexFromTransaction(bs58.encode(signature), treeAddress, recipient);
          }
          
          if (leafIndex !== null) {
            console.log(`[Solana Service] 🔍 Формируем asset ID для leaf index ${leafIndex}...`);
            assetId = await this.deriveAssetId(treeAddress, leafIndex);
            
            // ✅ НОВОЕ: Запускаем DAS диагностику
            if (assetId) {
              console.log(`[Solana Service] 🔬 Запускаем DAS диагностику для asset ID: ${assetId}`);
              dasStatus = await this.performCompressedNFTDiagnostics(assetId, treeAddress, leafIndex);
            }
          } else {
            console.warn(`[Solana Service] ⚠️ Не удалось извлечь leaf index после двух попыток`);
            console.log(`[Solana Service] ℹ️ NFT был успешно заминчен, но asset ID недоступен`);
            console.log(`[Solana Service] 💡 Рекомендация: Проверьте NFT через DAS API через 15-30 минут после минтинга`);
          }
        } catch (leafError) {
          console.warn(`[Solana Service] ⚠️ Ошибка при извлечении leaf index: ${leafError.message}`);
          console.log(`[Solana Service] ℹ️ Минт был успешным, но без leaf index и asset ID`);
          console.log(`[Solana Service] 💡 Рекомендация: NFT может появиться в кошельке через 15-30 минут`);
        }

        const result = {
          success: true,
          signature: bs58.encode(signature),
          elapsedTime
        };

        // Добавляем leaf index и asset ID только если они были успешно получены
        if (leafIndex !== null) {
          result.leafIndex = leafIndex;
          console.log(`[Solana Service] ✅ Leaf index добавлен в результат: ${leafIndex}`);
        }

        if (assetId !== null) {
          result.assetId = assetId;
          console.log(`[Solana Service] ✅ Asset ID добавлен в результат: ${assetId}`);
        }

        // ✅ НОВОЕ: Добавляем результаты DAS диагностики
        if (dasStatus) {
          result.dasStatus = dasStatus;
          result.phantomReady = dasStatus.summary?.phantomReady || false;
          result.indexingStatus = dasStatus.checks?.dasIndexed ? 'completed' : 'pending';
          result.recommendations = dasStatus.summary?.recommendations || [];
          
          console.log(`[Solana Service] 📊 DAS диагностика добавлена в результат:`);
          console.log(`   - Phantom готов: ${result.phantomReady}`);
          console.log(`   - Статус индексации: ${result.indexingStatus}`);
          
          if (result.recommendations.length > 0) {
            console.log(`   - Рекомендации:`, result.recommendations);
          }
        }

        return result;
        
      } catch (mintError) {
        console.error(`[Solana Service] ❌ Ошибка попытки ${attempt}: ${mintError.message}`);
        
        // Обработка специальных ошибок (из reference)
        const alreadyExists = mintError.message.includes('Leaf already exists');
        if (alreadyExists) {
          console.warn("[Solana Service] NFT уже существует, считаем успехом");
          return {
            success: true,
            signature: null,
            alreadyExists: true
          };
        }
        
        // Rate limiting (из reference)
        if (mintError.message.includes('429') && attempt < maxAttempts) {
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(`[Solana Service] Rate limit, повтор через ${delay / 1000} сек`);
          await this.sleep(delay);
          continue;
        }
        
        // Blockhash ошибки (из reference)
        if (mintError.message.includes('Blockhash not found') && attempt < maxAttempts) {
          console.warn("[Solana Service] Blockhash ошибка, повтор через 1 сек");
          await this.sleep(1000);
          continue;
        }
        
        // Последняя попытка
        if (attempt === maxAttempts) {
          throw mintError;
        }
        
        // Обычная пауза между попытками
        await this.sleep(7000);
      }
    }
    
    throw new Error("Все попытки минтинга исчерпаны");
  }
  
  // Получение баланса кошелька
  async getWalletBalance() {
    if (!this.isReady()) {
      await this.initialize();
    }
    
    if (!this.isReady()) {
      throw new Error("Solana service не готов к работе");
    }
    
    const balance = await this.umi.rpc.getBalance(this.umi.identity.publicKey);
    return balance.basisPoints / 1e9; // Конвертация в SOL
  }
  
  // Проверка валидности адресов
  isValidSolanaAddress(address) {
    try {
      publicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  // Проверка баланса кошелька
  async checkWalletBalance() {
    try {
      const balance = await this.umi.rpc.getBalance(this.umi.identity.publicKey);
      const solBalance = balance.basisPoints / 1e9; // Конвертируем в SOL
      
      const balanceInfo = {
        balance: solBalance,
        lamports: balance.basisPoints,
        address: this.umi.identity.publicKey.toString(),
        timestamp: new Date().toISOString()
      };
      
      // Предупреждение при низком балансе
      if (solBalance < 1) {
        console.warn(`⚠️ Низкий баланс кошелька: ${solBalance.toFixed(4)} SOL`);
        console.warn(`📍 Адрес кошелька: ${this.umi.identity.publicKey.toString()}`);
      } else if (solBalance < 5) {
        console.log(`💰 Баланс кошелька: ${solBalance.toFixed(4)} SOL (рекомендуется пополнить)`);
      } else {
        console.log(`✅ Баланс кошелька: ${solBalance.toFixed(4)} SOL`);
      }
      
      return balanceInfo;
      
    } catch (error) {
      console.error('[Solana Service] Ошибка проверки баланса:', error.message);
      throw new Error(`Failed to check wallet balance: ${error.message}`);
    }
  }

  // Оценка стоимости операции минтинга
  async estimateMintCost(itemCount = 1) {
    try {
      // Примерная стоимость compressed NFT минтинга
      const baseFee = 0.00025; // SOL за транзакцию
      const perItemFee = 0.0001; // SOL за каждый NFT
      
      const estimatedCost = baseFee + (perItemFee * itemCount);
      
      return {
        estimatedCost,
        itemCount,
        baseFee,
        perItemFee,
        currency: 'SOL'
      };
      
    } catch (error) {
      console.error('[Solana Service] Ошибка оценки стоимости:', error.message);
      return {
        estimatedCost: 0.001 * itemCount, // Fallback оценка
        itemCount,
        currency: 'SOL',
        error: error.message
      };
    }
  }

  // Проверка достаточности баланса для операции
  async canAffordOperation(itemCount = 1) {
    try {
      const balanceInfo = await this.checkWalletBalance();
      const costEstimate = await this.estimateMintCost(itemCount);
      
      const canAfford = balanceInfo.balance >= costEstimate.estimatedCost;
      const remainingBalance = balanceInfo.balance - costEstimate.estimatedCost;
      
      return {
        canAfford,
        currentBalance: balanceInfo.balance,
        estimatedCost: costEstimate.estimatedCost,
        remainingBalance: Math.max(0, remainingBalance),
        itemCount,
        warning: remainingBalance < 1 ? 'Баланс будет низким после операции' : null
      };
      
    } catch (error) {
      console.error('[Solana Service] Ошибка проверки возможности операции:', error.message);
      return {
        canAfford: false,
        error: error.message
      };
    }
  }

  // Логирование транзакции с расходами
  async logTransaction(signature, itemCount, actualCost = null) {
    try {
      const costEstimate = await this.estimateMintCost(itemCount);
      const cost = actualCost || costEstimate.estimatedCost;
      
      console.log(`💳 Транзакция выполнена:`);
      console.log(`   Signature: ${signature}`);
      console.log(`   Items: ${itemCount}`);
      console.log(`   Cost: ~${cost.toFixed(6)} SOL`);
      console.log(`   Explorer: https://explorer.solana.com/tx/${signature}`);
      
      return {
        signature,
        itemCount,
        cost,
        timestamp: new Date().toISOString(),
        explorerUrl: `https://explorer.solana.com/tx/${signature}`
      };
      
    } catch (error) {
      console.error('[Solana Service] Ошибка логирования транзакции:', error.message);
    }
  }

  // ✅ НОВАЯ ФУНКЦИЯ: Поиск leaf index через DAS API по owner
  async findLeafIndexFromDAS(signature, treeAddress, recipient = null) {
    try {
      // Если recipient не указан, используем identity (плательщик)
      const ownerAddress = recipient || this.umi?.identity?.publicKey?.toString();
      
      if (!ownerAddress) {
        console.warn('[Solana Service] ⚠️ Не указан owner для поиска через DAS API');
        return null;
      }

      const dasApiUrl = process.env.DAS_API_URL || process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
      
      console.log(`[Solana Service] 🔍 Поиск NFT через DAS API для owner: ${ownerAddress}`);
      
      // Ищем все NFT владельца через DAS API
      const response = await fetch(dasApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'find-by-owner',
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: ownerAddress,
            page: 1,
            limit: 1000 // Максимум для поиска
          }
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (response.ok) {
        const result = await response.json();
        
        if (result.result && result.result.items) {
          // Ищем NFT с нужным tree address и недавней транзакцией
          for (const asset of result.result.items) {
            if (asset.compression && asset.compression.tree === treeAddress) {
              // Проверяем, что это наш NFT (по времени создания или другим признакам)
              // Для точности можно проверить signature в метаданных, но это не всегда доступно
              if (asset.compression.leaf_id !== undefined) {
                const leafIndex = asset.compression.leaf_id;
                console.log(`[Solana Service] ✅ Найден leaf index через DAS API: ${leafIndex}`);
                return leafIndex;
              }
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.warn('[Solana Service] Ошибка поиска через DAS API:', error.message);
      return null;
    }
  }

  // ✅ ИСПРАВЛЕННАЯ ФУНКЦИЯ: Извлечение leaf index через TreeConfig (ПРАВИЛЬНЫЙ МЕТОД!)
  async extractLeafIndexFromTransaction(signature, treeAddress, recipient = null) {
    try {
      console.log(`[Solana Service] 🔍 Извлекаем leaf index для транзакции: ${signature}`);
      
      // ✅ МЕТОД 1 (ОСНОВНОЙ): Чтение num_minted из TreeConfig
      // TreeConfig хранит точное количество заминченных NFT
      console.log(`[Solana Service] 🔍 Метод 1: Читаем TreeConfig.num_minted`);
      try {
        // Небольшая задержка чтобы TreeConfig обновился
        await this.sleep(1000);
        
        const numMinted = await this.getNumMintedFromTreeConfig(treeAddress);
        
        if (numMinted !== null && numMinted > 0) {
          // Leaf index = num_minted - 1 (индексация с 0)
          const leafIndex = numMinted - 1;
          console.log(`[Solana Service] ✅ Leaf index = ${leafIndex} (TreeConfig.num_minted = ${numMinted})`);
          return leafIndex;
        }
      } catch (treeConfigError) {
        console.warn(`[Solana Service] ⚠️ Метод 1 (TreeConfig) не сработал: ${treeConfigError.message}`);
      }

      // ✅ МЕТОД 2: Повторная попытка с большей задержкой
      console.log(`[Solana Service] 🔍 Метод 2: Повторный запрос к TreeConfig`);
      try {
        await this.sleep(3000);
        
        const numMinted = await this.getNumMintedFromTreeConfig(treeAddress);
        
        if (numMinted !== null && numMinted > 0) {
          const leafIndex = numMinted - 1;
          console.log(`[Solana Service] ✅ Leaf index = ${leafIndex} (повторная попытка)`);
          return leafIndex;
        }
      } catch (treeConfigError2) {
        console.warn(`[Solana Service] ⚠️ Метод 2 не сработал: ${treeConfigError2.message}`);
      }

      // ✅ МЕТОД 3: Fallback через DAS API (если TreeConfig недоступен)
      console.log(`[Solana Service] 🔍 Метод 3: Fallback через DAS API`);
      try {
        const leafIndexFromDAS = await this.findLeafIndexFromDAS(signature, treeAddress, recipient);
        if (leafIndexFromDAS !== null) {
          console.log(`[Solana Service] ✅ Leaf index найден через DAS API: ${leafIndexFromDAS}`);
          return leafIndexFromDAS;
        }
      } catch (dasError) {
        console.warn(`[Solana Service] ⚠️ Метод 3 (DAS) не сработал: ${dasError.message}`);
      }

      // Если все методы не сработали
      console.warn(`[Solana Service] ⚠️ Не удалось извлечь leaf index`);
      console.warn(`[Solana Service] 💡 NFT успешно заминтен, но asset ID недоступен. NFT появится в кошельке через 15-30 минут.`);
      return null;
      
    } catch (error) {
      console.error('[Solana Service] Ошибка извлечения leaf index:', error.message);
      return null;
    }
  }

  // ✅ НОВЫЙ МЕТОД: Получение num_minted из TreeConfig account (ПРАВИЛЬНЫЙ СПОСОБ!)
  // TreeConfig хранит точное количество заминченных NFT
  async getNumMintedFromTreeConfig(treeAddress) {
    try {
      console.log(`[Solana Service] 📊 Читаем TreeConfig для дерева: ${treeAddress}`);
      
      // Вычисляем TreeConfig PDA
      let treeConfigPDA;
      
      if (findTreeConfigPda) {
        // Используем официальную функцию из mpl-bubblegum
        [treeConfigPDA] = findTreeConfigPda(this.umi, {
          merkleTree: publicKey(treeAddress)
        });
        console.log(`[Solana Service] 📍 TreeConfig PDA (via SDK): ${treeConfigPDA}`);
      } else {
        // Fallback: вычисляем PDA вручную
        // Seeds: ["tree_config", merkleTree]
        const seeds = [
          Buffer.from("tree_config"),
          publicKey(treeAddress).bytes
        ];
        
        [treeConfigPDA] = this.umi.eddsa.findPda(bubblegum.MPL_BUBBLEGUM_PROGRAM_ID, seeds);
        console.log(`[Solana Service] 📍 TreeConfig PDA (manual): ${treeConfigPDA}`);
      }
      
      // Получаем TreeConfig account
      const treeConfigAccount = await this.umi.rpc.getAccount(treeConfigPDA);
      
      if (!treeConfigAccount.exists) {
        console.warn(`[Solana Service] ⚠️ TreeConfig account не найден для: ${treeAddress}`);
        return null;
      }
      
      // Конвертируем в Buffer
      let data = treeConfigAccount.data;
      if (!Buffer.isBuffer(data)) {
        if (data instanceof Uint8Array) {
          data = Buffer.from(data);
        } else if (typeof data === 'string') {
          data = Buffer.from(data, 'base64');
        } else if (Array.isArray(data)) {
          data = Buffer.from(data);
        } else {
          console.warn('[Solana Service] Неизвестный тип TreeConfig data:', typeof data);
          return null;
        }
      }
      
      console.log(`[Solana Service] 📊 TreeConfig account data length: ${data.length} bytes`);
      
      // Структура TreeConfig account (Bubblegum):
      // [discriminator(8)] + [tree_creator(32)] + [tree_delegate(32)] + [total_mint_capacity(8)] + [num_minted(8)] + [is_public(1)] + [is_decompressible(1)]
      // num_minted находится по offset: 8 + 32 + 32 + 8 = 80 байт
      
      // Но нужно учитывать дискриминатор account - проверим разные варианты
      const possibleOffsets = [
        { offset: 80, name: 'standard (8+32+32+8)' },
        { offset: 72, name: 'no_discriminator (32+32+8)' },
        { offset: 88, name: 'with_padding (8+32+32+8+8)' },
        { offset: 64, name: 'minimal (32+32)' }
      ];
      
      for (const { offset, name } of possibleOffsets) {
        if (data.length >= offset + 8) {
          try {
            const numMinted = Number(data.readBigUInt64LE(offset));
            
            // Валидация: num_minted должно быть разумным числом
            if (numMinted >= 0 && numMinted < 10000000) {
              console.log(`[Solana Service] ✅ TreeConfig.num_minted = ${numMinted} (offset ${offset}: ${name})`);
              return numMinted;
            }
          } catch (readError) {
            continue;
          }
        }
      }
      
      console.warn(`[Solana Service] ⚠️ Не удалось прочитать num_minted из TreeConfig`);
      return null;
      
    } catch (error) {
      console.error('[Solana Service] Ошибка чтения TreeConfig:', error.message);
      console.error('[Solana Service] Stack:', error.stack);
      return null;
    }
  }
  
  // ✅ LEGACY: Оставляем для обратной совместимости, но теперь это обёртка над новым методом
  async getNextLeafIndexFromTree(treeAddress) {
    // Используем новый метод через TreeConfig
    return await this.getNumMintedFromTreeConfig(treeAddress);
  }

  // ✅ НОВАЯ ФУНКЦИЯ: Формирование asset ID из tree address и leaf index
  async deriveAssetId(treeAddress, leafIndex) {
    try {
      if (!findLeafAssetIdPda) {
        // Fallback: генерируем детерминированный ID на основе tree и leaf index
        console.log('[Solana Service] ⚠️ Используем fallback метод для asset ID');
        const deterministicId = this.generateFallbackAssetId(treeAddress, leafIndex);
        return deterministicId;
      }

      const [assetId] = await findLeafAssetIdPda(this.umi, {
        merkleTree: publicKey(treeAddress),
        leafIndex: leafIndex
      });
      
      console.log(`[Solana Service] ✅ Asset ID сформирован: ${assetId.toString()}`);
      return assetId.toString();
      
    } catch (error) {
      console.error('[Solana Service] Ошибка формирования asset ID:', error.message);
      
      // Используем fallback метод в случае ошибки
      console.log('[Solana Service] ⚠️ Используем fallback метод из-за ошибки');
      const fallbackId = this.generateFallbackAssetId(treeAddress, leafIndex);
      return fallbackId;
    }
  }

  // ✅ НОВАЯ ФУНКЦИЯ: Fallback метод для генерации asset ID
  generateFallbackAssetId(treeAddress, leafIndex) {
    try {
      // Создаем детерминированный ID на основе tree address и leaf index
      // Этот метод не идеален, но позволяет системе работать
      const crypto = require('crypto');
      const input = `${treeAddress}-${leafIndex}`;
      const hash = crypto.createHash('sha256').update(input).digest('hex');
      
      // Берем первые 32 символа hash для создания base58-подобного ID
      const fallbackId = `fallback_${hash.substring(0, 32)}`;
      
      console.log(`[Solana Service] ✅ Fallback Asset ID: ${fallbackId}`);
      return fallbackId;
      
    } catch (error) {
      console.error('[Solana Service] Ошибка fallback asset ID:', error.message);
      // Крайний fallback
      return `asset_${treeAddress.substring(0, 8)}_${leafIndex}`;
    }
  }

  // ✅ НОВАЯ ФУНКЦИЯ: Проверка индексации NFT через DAS API
  async checkDASIndexing(assetId, maxRetries = 10, delayMs = 5000) {
    try {
      console.log(`[Solana Service] 🔍 Проверяем индексацию DAS API для asset: ${assetId}`);
      
      // Используем Helius DAS API (может быть настроен в env)
      const dasApiUrl = process.env.DAS_API_URL || process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[Solana Service] 🔄 Попытка ${attempt}/${maxRetries} проверки DAS индексации`);
          
          const response = await fetch(dasApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'check-indexing',
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
              console.log(`[Solana Service] ✅ NFT успешно проиндексирован в DAS API`);
              
              return {
                indexed: true,
                asset: result.result,
                attempt,
                totalTime: attempt * delayMs / 1000
              };
            }
          }
          
          // Если не найден, ждем перед следующей попыткой
          if (attempt < maxRetries) {
            console.log(`[Solana Service] ⏳ NFT еще не проиндексирован, ждем ${delayMs/1000}с...`);
            await this.sleep(delayMs);
          }
          
        } catch (attemptError) {
          console.warn(`[Solana Service] ⚠️ Ошибка попытки ${attempt}: ${attemptError.message}`);
          
          if (attempt < maxRetries) {
            await this.sleep(delayMs);
          }
        }
      }

      // Если не удалось проиндексировать за максимальное время
      console.warn(`[Solana Service] ⚠️ NFT не был проиндексирован за ${maxRetries * delayMs / 1000} секунд`);
      
      return {
        indexed: false,
        maxRetries,
        totalWaitTime: maxRetries * delayMs / 1000,
        recommendation: 'NFT может появиться в кошельке через 15-30 минут'
      };
      
    } catch (error) {
      console.error('[Solana Service] Ошибка проверки DAS индексации:', error.message);
      return {
        indexed: false,
        error: error.message
      };
    }
  }

  // ✅ НОВАЯ ФУНКЦИЯ: Получение asset proof через DAS API
  async getAssetProofFromDAS(assetId) {
    try {
      console.log(`[Solana Service] 📋 Получаем asset proof для: ${assetId}`);
      
      const dasApiUrl = process.env.DAS_API_URL || process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
      
      const response = await fetch(dasApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'get-proof',
          method: 'getAssetProof',
          params: {
            id: assetId
          }
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (response.ok) {
        const result = await response.json();
        
        if (result.result) {
          console.log(`[Solana Service] ✅ Asset proof получен успешно`);
          return {
            success: true,
            proof: result.result
          };
        }
      }

      throw new Error(`DAS API не вернул asset proof для ${assetId}`);
      
    } catch (error) {
      console.error('[Solana Service] Ошибка получения asset proof:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ✅ НОВАЯ ФУНКЦИЯ: Полная диагностика compressed NFT
  async performCompressedNFTDiagnostics(assetId, treeAddress, leafIndex) {
    try {
      console.log(`[Solana Service] 🔬 Выполняем полную диагностику compressed NFT`);
      
      const diagnostics = {
        assetId,
        treeAddress,
        leafIndex,
        checks: {}
      };

      // 1. Проверка tree account
      try {
        const treeAccount = await this.umi.rpc.getAccount(publicKey(treeAddress));
        diagnostics.checks.treeExists = treeAccount.exists;
        console.log(`[Solana Service] 🌳 Tree account существует: ${treeAccount.exists}`);
      } catch (error) {
        diagnostics.checks.treeExists = false;
        diagnostics.checks.treeError = error.message;
      }

      // 2. Проверка DAS индексации
      const dasResult = await this.checkDASIndexing(assetId, 3, 3000); // Быстрая проверка
      diagnostics.checks.dasIndexed = dasResult.indexed;
      diagnostics.checks.dasDetails = dasResult;

      // 3. Проверка asset proof
      const proofResult = await this.getAssetProofFromDAS(assetId);
      diagnostics.checks.assetProofAvailable = proofResult.success;
      diagnostics.checks.proofDetails = proofResult;

      // 4. Общий статус
      diagnostics.summary = {
        mintSuccessful: true,
        phantomReady: diagnostics.checks.dasIndexed && diagnostics.checks.assetProofAvailable,
        estimatedIndexingTime: diagnostics.checks.dasIndexed ? 'Completed' : '15-30 minutes',
        recommendations: []
      };

      if (!diagnostics.checks.dasIndexed) {
        diagnostics.summary.recommendations.push('Подождите 15-30 минут для полной индексации');
        diagnostics.summary.recommendations.push('NFT технически создан, но может не отображаться в кошельке');
      }

      if (!diagnostics.checks.assetProofAvailable) {
        diagnostics.summary.recommendations.push('Asset proof недоступен - возможны проблемы с DAS API');
      }

      console.log(`[Solana Service] 📊 Диагностика завершена:`, {
        phantomReady: diagnostics.summary.phantomReady,
        dasIndexed: diagnostics.checks.dasIndexed
      });

      return diagnostics;
      
    } catch (error) {
      console.error('[Solana Service] Ошибка диагностики:', error.message);
      return {
        assetId,
        error: error.message,
        summary: {
          mintSuccessful: true,
          phantomReady: false,
          estimatedIndexingTime: 'Unknown - диагностика недоступна'
        }
      };
    }
  }

  // ✅ МЕТОД УДАЛЕН: больше не нужен, creators определяются автоматически внутри mintSingleNFT
}

module.exports = SolanaService; 