// services/solana.js
// Адаптировано из reference/mint_nft_stable.js
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const bubblegum = require("@metaplex-foundation/mpl-bubblegum");
const { keypairIdentity, publicKey } = require("@metaplex-foundation/umi");
const bs58 = require("bs58");
const { setComputeUnitLimit, setComputeUnitPrice, mplToolbox } = require("@metaplex-foundation/mpl-toolbox");

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
        console.log(`[Solana Service] Последний blockhash: ${blockHash.value.blockhash.substring(0, 8)}...`);
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
        verified: false 
      },
      creators: metadata.creators || [
        { 
          address: this.umi.identity.publicKey, 
          share: 100, 
          verified: true 
        }
      ],
    };
    
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
        
        return {
          success: true,
          signature: bs58.encode(signature),
          elapsedTime
        };
        
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
}

module.exports = SolanaService; 
module.exports = SolanaService; 