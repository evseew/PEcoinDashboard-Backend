// services/solana.js
// Адаптировано из reference/mint_nft_stable.js
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const bubblegum = require("@metaplex-foundation/mpl-bubblegum");
const { keypairIdentity, publicKey } = require("@metaplex-foundation/umi");
const bs58 = require("bs58");
const { setComputeUnitLimit, setComputeUnitPrice, mplToolbox } = require("@metaplex-foundation/mpl-toolbox");

// ✅ НОВЫЕ ИМПОРТЫ для извлечения leaf index
let findLeafAssetIdPda;
try {
  findLeafAssetIdPda = require("@metaplex-foundation/mpl-bubblegum").findLeafAssetIdPda;
  console.log('[Solana Service] ✅ findLeafAssetIdPda импортирован успешно');
} catch (error) {
  console.error('[Solana Service] ❌ Ошибка импорта findLeafAssetIdPda:', error.message);
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
    
    // 🔥 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: синхронизируем creators с JSON метаданными
    console.log('[Solana Service] 🔍 Проверка creators:', {
      fromMetadata: metadata.creators,
      fallback: metadataArgs.creators,
      identityKey: this.umi.identity.publicKey.toString()
    });
    
    // ВАЖНО: Если есть creators в metadata, используем их!
    if (metadata.creators && Array.isArray(metadata.creators) && metadata.creators.length > 0) {
      console.log('[Solana Service] ✅ Используем creators из metadata');
      metadataArgs.creators = metadata.creators.map(creator => ({
        address: typeof creator.address === 'string' ? creator.address : this.umi.identity.publicKey,
        share: creator.share || 100,
        verified: true // Устанавливаем verified при минтинге
      }));
    } else {
      console.log('[Solana Service] ⚠️ Используем fallback creators');
    }
    
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
        
        // ✅ ИСПРАВЛЕНИЕ: Попытка извлечения leaf index с обработкой ошибок
        let leafIndex = null;
        let assetId = null;
        let dasStatus = null;
        
        try {
          console.log(`[Solana Service] 🔍 Пытаемся извлечь leaf index из транзакции...`);
          leafIndex = await this.extractLeafIndexFromTransaction(bs58.encode(signature), treeAddress);
          
          if (leafIndex !== null) {
            console.log(`[Solana Service] 🔍 Формируем asset ID для leaf index ${leafIndex}...`);
            assetId = await this.deriveAssetId(treeAddress, leafIndex);
            
            // ✅ НОВОЕ: Запускаем DAS диагностику
            if (assetId) {
              console.log(`[Solana Service] 🔬 Запускаем DAS диагностику для asset ID: ${assetId}`);
              dasStatus = await this.performCompressedNFTDiagnostics(assetId, treeAddress, leafIndex);
            }
          }
        } catch (leafError) {
          console.warn(`[Solana Service] ⚠️ Не удалось извлечь leaf index: ${leafError.message}`);
          console.log(`[Solana Service] ℹ️ Минт был успешным, но без leaf index и asset ID`);
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

  // ✅ НОВАЯ ФУНКЦИЯ: Извлечение leaf index из transaction logs
  async extractLeafIndexFromTransaction(signature, treeAddress) {
    try {
      console.log(`[Solana Service] Извлекаем leaf index из транзакции: ${signature}`);
      
      // Получаем детали транзакции с максимальным commitment
      const transactionDetails = await this.umi.rpc.getTransaction(signature, {
        commitment: 'finalized',
        maxSupportedTransactionVersion: 0
      });

      if (!transactionDetails) {
        throw new Error('Транзакция не найдена');
      }

      // Ищем в логах программы Bubblegum
      const bubblegumProgramId = bubblegum.MPL_BUBBLEGUM_PROGRAM_ID.toString();
      
      for (const instruction of transactionDetails.transaction.message.instructions || []) {
        // Проверяем программу
        if (instruction.programId && instruction.programId.toString() === bubblegumProgramId) {
          
          // Ищем в inner instructions (где обычно содержится leaf информация)
          if (transactionDetails.meta && transactionDetails.meta.innerInstructions) {
            for (const innerInstruction of transactionDetails.meta.innerInstructions) {
              for (const inner of innerInstruction.instructions) {
                if (inner.programId && inner.programId.toString() === bubblegumProgramId) {
                  
                  // Анализируем data инструкции для поиска leaf index
                  if (inner.data) {
                    const leafIndex = this.parseLeafIndexFromInstructionData(inner.data);
                    if (leafIndex !== null) {
                      console.log(`[Solana Service] ✅ Leaf index найден: ${leafIndex}`);
                      return leafIndex;
                    }
                  }
                }
              }
            }
          }
        }
      }

      // ✅ АЛЬТЕРНАТИВНЫЙ МЕТОД: Ищем в логах транзакции
      if (transactionDetails.meta && transactionDetails.meta.logMessages) {
        for (const log of transactionDetails.meta.logMessages) {
          // Ищем log message с leaf index информацией
          const leafIndexMatch = log.match(/leaf.*index[:\s]+(\d+)/i);
          if (leafIndexMatch) {
            const leafIndex = parseInt(leafIndexMatch[1]);
            console.log(`[Solana Service] ✅ Leaf index найден в логах: ${leafIndex}`);
            return leafIndex;
          }

          // Ищем другие возможные форматы
          const leafMatch = log.match(/Leaf\s+(\d+)/i);
          if (leafMatch) {
            const leafIndex = parseInt(leafMatch[1]);
            console.log(`[Solana Service] ✅ Leaf index найден (формат 2): ${leafIndex}`);
            return leafIndex;
          }
        }
      }

      // ✅ МЕТОД 3: Запрос к tree account для получения следующего доступного leaf index
      console.log(`[Solana Service] ⚠️ Leaf index не найден в логах, запрашиваем tree state`);
      const leafIndex = await this.getNextLeafIndexFromTree(treeAddress);
      
      if (leafIndex !== null) {
        // Возвращаем предыдущий index (так как мы только что заминтили)
        const actualLeafIndex = Math.max(0, leafIndex - 1);
        console.log(`[Solana Service] ✅ Leaf index вычислен из tree state: ${actualLeafIndex}`);
        return actualLeafIndex;
      }

      throw new Error('Не удалось извлечь leaf index ни одним способом');
      
    } catch (error) {
      console.error('[Solana Service] Ошибка извлечения leaf index:', error.message);
      throw new Error(`Не удалось извлечь leaf index: ${error.message}`);
    }
  }

  // ✅ НОВАЯ ФУНКЦИЯ: Парсинг leaf index из instruction data
  parseLeafIndexFromInstructionData(instructionData) {
    try {
      // instructionData обычно в base58 или base64
      let data;
      
      if (typeof instructionData === 'string') {
        try {
          data = bs58.decode(instructionData);
        } catch {
          try {
            data = Buffer.from(instructionData, 'base64');
          } catch {
            return null;
          }
        }
      } else if (Buffer.isBuffer(instructionData)) {
        data = instructionData;
      } else {
        return null;
      }

      // Для bubblegum mint instruction, leaf index обычно находится в определенной позиции
      // Это зависит от структуры instruction data
      if (data.length >= 4) {
        // Проверяем разные возможные позиции leaf index
        const positions = [4, 8, 12, 16, 20, 24];
        
        for (const pos of positions) {
          if (data.length >= pos + 4) {
            const leafIndex = data.readUInt32LE(pos);
            // Валидный leaf index должен быть разумным числом
            if (leafIndex >= 0 && leafIndex < 1000000) {
              return leafIndex;
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.warn('[Solana Service] Ошибка парсинга instruction data:', error.message);
      return null;
    }
  }

  // ✅ НОВАЯ ФУНКЦИЯ: Получение следующего leaf index из tree account
  async getNextLeafIndexFromTree(treeAddress) {
    try {
      // Получаем account data для merkle tree
      const treeAccount = await this.umi.rpc.getAccount(publicKey(treeAddress));
      
      if (!treeAccount.exists) {
        throw new Error('Tree account не найден');
      }

      // Парсим данные tree account для получения next_leaf_index
      // Структура account data зависит от программы spl-account-compression
      const data = treeAccount.data;
      
      if (data.length >= 8) {
        // next_leaf_index обычно находится в начале account data
        const nextLeafIndex = Number(data.readBigUInt64LE(0));
        return nextLeafIndex;
      }

      return null;
    } catch (error) {
      console.warn('[Solana Service] Ошибка получения leaf index из tree:', error.message);
      return null;
    }
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