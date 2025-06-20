// mint_nft_stable.js
const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');
const config = require('./config');
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const bubblegum = require("@metaplex-foundation/mpl-bubblegum");
const { keypairIdentity, publicKey } = require("@metaplex-foundation/umi");
const bs58 = require("bs58");
const { setComputeUnitLimit, setComputeUnitPrice, mplToolbox } = require("@metaplex-foundation/mpl-toolbox");

dotenv.config();

// Отладочный лог для проверки загрузки .env
console.log("[DEBUG ENV] MAIN_RPC_URL from process.env:", process.env.MAIN_RPC_URL);

// --- Загрузка конфигурации и проверка ключей ---
const payerPrivateKey = process.env.PRIVATE_KEY;
if (!payerPrivateKey) {
  throw new Error('PRIVATE_KEY не найден в файле .env');
}
const USER_RPC_URL = process.env.RPC_URL;
const MAIN_RPC_URL = process.env.MAIN_RPC_URL || "https://api.mainnet-beta.solana.com";
const BACKUP_RPC_URLS = process.env.BACKUP_RPC_URLS
  ? process.env.BACKUP_RPC_URLS.split(',')
  : [
      "https://solana-api.projectserum.com",
      "https://rpc.ankr.com/solana",
      USER_RPC_URL, // Добавляем пользовательский RPC в конец, если он есть
    ].filter(url => url);

// Вспомогательная функция для задержки
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Функция для создания UMI с обработкой подтверждения
async function createUmiInstanceWithConfirm(url, umiInstanceCache) {
    if (umiInstanceCache[url]) return umiInstanceCache[url]; // Возвращаем кэшированный экземпляр

    console.log(`[RPC] Инициализация Umi для: ${url}`);
    const umi = createUmi(url, {
      httpOptions: { fetchMiddleware: (req, next) => next(req) }
    });

    // Загрузка кошелька плательщика
    try {
        const secretKeyBytes = bs58.decode(payerPrivateKey);
        const umiKeypair = umi.eddsa.createKeypairFromSecretKey(secretKeyBytes);
        umi.use(keypairIdentity(umiKeypair));
        console.log(`[Wallet] Кошелек плательщика загружен: ${umi.identity.publicKey}`);
    } catch (e) {
        throw new Error(`Ошибка декодирования или использования приватного ключа: ${e.message}`);
    }

    // Подключение Bubblegum
    umi.use(bubblegum.mplBubblegum());
    console.log("[Bubblegum] Модуль Bubblegum подключен.");
    console.log("[DEBUG] Umi keys after Bubblegum:", Object.keys(umi));
    
    // Подключение mplToolbox для Priority Fees
    umi.use(mplToolbox());
    console.log("[Toolbox] Модуль mplToolbox подключен.");
    console.log("[DEBUG] Umi keys after Toolbox:", Object.keys(umi));
    console.log("[DEBUG] Umi.transactions type:", typeof umi.transactions);
    console.log("[DEBUG] Umi.transactions.make type:", typeof umi.transactions?.make);

    umiInstanceCache[url] = umi; // Кэшируем созданный и настроенный экземпляр
    return umi;
}

// Функция попытки подключения к RPC
async function connectToRpc(rpcUrls, umiInstanceCache) {
    let umi = null;
    console.log("\n[RPC] Попытка подключения к Solana RPC...");
    for (const url of rpcUrls) {
        if (!url) continue;
        console.log(`[RPC] Пробуем: ${url}`);
        try {
            const tempUmi = await createUmiInstanceWithConfirm(url, umiInstanceCache);
            await tempUmi.rpc.getLatestBlockhash(); // Проверка работоспособности
            console.log(`[RPC] ✅ Успешно подключились к: ${url}`);
            umi = tempUmi;
            break;
        } catch (e) {
            console.warn(`[RPC] ❌ Ошибка подключения к ${url}: ${e.message}`);
        }
    }
    if (!umi) {
        throw new Error("Не удалось подключиться ни к одному RPC-эндпоинту.");
    }
    return umi;
}

// Основная функция минтинга
async function mintBatchStable() {
  console.log("--- Запуск этапа стабильного минтинга ---");

  // --- 1. Загрузка состояния и адресов ---
  let batchState;
  try {
    const stateFileContent = await fs.readFile(config.batchStateFile, 'utf8');
    batchState = JSON.parse(stateFileContent);
  } catch (err) {
    throw new Error(`Не удалось прочитать файл состояния ${config.batchStateFile}. Запустите сначала prepare_batch.js. Ошибка: ${err.message}`);
  }

  if (Object.keys(batchState).length === 0) {
      console.log("Файл состояния пуст. Нет NFT для минтинга.");
      return;
  }

  let treeAddressStr, collectionAddressStr;
  try {
      treeAddressStr = (await fs.readFile(config.treeAddressFilePath, 'utf8')).trim();
      collectionAddressStr = (await fs.readFile(config.collectionAddressFilePath, 'utf8')).trim();
  } catch(err) {
      throw new Error(`Ошибка чтения адреса дерева (${config.treeAddressFilePath}) или коллекции (${config.collectionAddressFilePath}): ${err.message}`);
  }
  const treeAddress = publicKey(treeAddressStr);
  const collectionAddress = publicKey(collectionAddressStr);
  const receiverAddress = publicKey(config.receiverAddress);
  console.log(`[Config] Дерево: ${treeAddress}`);
  console.log(`[Config] Коллекция: ${collectionAddress}`);
  console.log(`[Config] Получатель: ${receiverAddress}`);
  console.log(`[Config] Копий на NFT: ${config.copiesPerNft}`);

  // --- 2. Подключение к RPC --- 
  const umiInstanceCache = {}; // Кэш для экземпляров Umi
  const rpcUrls = [MAIN_RPC_URL, ...BACKUP_RPC_URLS];
  let umi = await connectToRpc(rpcUrls, umiInstanceCache);

  // --- 3. Цикл минтинга --- 
  let consecutive_failures = 0;
  const assetsToMint = Object.keys(batchState);
  let totalMintedCount = 0;
  let totalSkippedCount = 0;
  let totalFailedCount = 0;

  console.log(`\n--- Начало цикла минтинга для ${assetsToMint.length} ассетов ---`);

  for (let i = 0; i < assetsToMint.length; i++) {
    const imageFilename = assetsToMint[i];
    const assetState = batchState[imageFilename];

    console.log(`\n[Ассет ${i + 1}/${assetsToMint.length}] Обработка: ${imageFilename}`);

    // Пропускаем, если подготовка не удалась
    if (assetState.json_upload_status !== 'success' || !assetState.final_uri) {
      console.warn(`  [Пропуск Ассета] Подготовка не удалась (статус JSON: ${assetState.json_upload_status}). Ошибка подготовки: ${assetState.last_error || 'Нет деталей'}`);
      totalSkippedCount += config.copiesPerNft;
      continue;
    }

    // Получаем метаданные
    let metadataJson;
    try {
      console.log(`  [Метаданные] Запрос с выделенного шлюза: ${assetState.final_uri}`);
      const response = await fetch(assetState.final_uri, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!response.ok) throw new Error(`Статус: ${response.status}`);
      metadataJson = await response.json();
      console.log(`  [Метаданные] Успешно загружены. Имя: ${metadataJson.name}`);
    } catch (fetchError) {
      console.error(`  [Метаданные] ❌ Ошибка загрузки: ${fetchError.message}. Пропуск всех копий этого ассета.`);
      // Помечаем все копии как ошибочные из-за недоступности метаданных
      assetState.copies.forEach(copy => {
          if (copy.status === 'pending') {
              copy.status = 'error';
              copy.error = `Ошибка загрузки метаданных: ${fetchError.message}`;
          }
      });
      totalFailedCount += config.copiesPerNft; // Считаем все копии неудачными
      consecutive_failures++; // Считаем как одну последовательную неудачу для ассета
      await fs.writeFile(config.batchStateFile, JSON.stringify(batchState, null, 2), 'utf8');
      continue; // Переход к следующему ассету
    }

    // Формируем аргументы для минтинга
    const metadataArgs = {
      name: metadataJson.name || "Unnamed NFT",
      symbol: metadataJson.symbol || config.collectionSymbol,
      uri: assetState.final_uri, // Используем URI из состояния
      sellerFeeBasisPoints: metadataJson.seller_fee_basis_points !== undefined ? metadataJson.seller_fee_basis_points : config.sellerFeeBasisPoints,
      collection: { key: collectionAddress, verified: false },
      creators: metadataJson.properties?.creators || metadataJson.creators || [{ address: umi.identity.publicKey, share: 100, verified: true }],
    };

    // Минтинг копий
    for (let j = 0; j < config.copiesPerNft; j++) {
      const copyState = assetState.copies[j];
      console.log(`  [Копия ${j + 1}/${config.copiesPerNft}] Статус: ${copyState.status}`);

      if (copyState.status === 'success' || copyState.status === 'already_exists') {
        console.log(`     Пропуск: уже обработана.`);
        continue;
      }

      let copyMintFailed = false;
      for (let attempt = 1; attempt <= config.maxMintAttemptsPerCopy; attempt++) {
        console.log(`     [Попытка ${attempt}/${config.maxMintAttemptsPerCopy}] Минтинг...`);
        try {

          // --- Начало: Построение транзакции с Priority Fees (новый способ) ---
          const priorityFeeMicroLamports = 100; // Минимальная цена для небольшого приоритета: 100 microLamports  
          const computeUnits = 150_000; // Минимум для compressed NFT: 150,000 compute units

          // 1. Создаем основную инструкцию минтинга
          const mintInstruction = bubblegum.mintToCollectionV1(umi, {
            leafOwner: receiverAddress,
            merkleTree: treeAddress,
            collectionMint: collectionAddress,
            metadata: metadataArgs,
          });

          // 2. Используем правильный способ создания транзакции для новых версий UMI
          console.log(`        [DEBUG] Данные для минтинга (metadataArgs):`, JSON.stringify(metadataArgs));
          console.log(`        [DEBUG] Priority Fees отключены - используются только базовые комиссии.`);
          // --- Используем HTTP-only подход без WebSocket ---
          console.log("        [DEBUG] Создание и отправка транзакции (HTTP-only)...");
          const txStartTime = Date.now();
          try {
            // Сначала отправляем транзакцию
            const signature = await mintInstruction.send(umi, {
              skipPreflight: false
            });
            
            console.log(`        [DEBUG] Транзакция отправлена: ${bs58.encode(signature)}`);
            console.log(`        [DEBUG] Signature тип:`, typeof signature, signature.constructor.name);
            console.log(`        [DEBUG] Signature байтов:`, signature.length);
            
            // Проверим ссылку на эксплорер для ручной проверки
            console.log(`        [DEBUG] Проверить в эксплорере: https://solscan.io/tx/${bs58.encode(signature)}`);
            
            // Затем проверяем подтверждение через HTTP polling
            let confirmed = false;
            let attempts = 0;
            const maxAttempts = 30; // 30 попыток по 3 секунды = 90 секунд
            
            while (!confirmed && attempts < maxAttempts) {
              await sleep(3000); // Ждем 3 секунды
              attempts++;
              
                             try {
                 console.log(`        [DEBUG] Проверка подтверждения (попытка ${attempts}/${maxAttempts})...`);
                 const status = await umi.rpc.getSignatureStatuses([signature]);
                 
                 console.log(`        [DEBUG] Полный ответ getSignatureStatuses:`, JSON.stringify(status, null, 2));
                 
                 // Alchemy возвращает массив напрямую, а не обернутый в {value: [...]}
                 const txStatus = Array.isArray(status) ? status[0] : status.value?.[0];
                 
                 if (txStatus) {
                   console.log(`        [DEBUG] Статус транзакции:`, {
                     commitment: txStatus.commitment,
                     confirmationStatus: txStatus.confirmationStatus,
                     confirmations: txStatus.confirmations,
                     err: txStatus.err,
                     error: txStatus.error,
                     slot: txStatus.slot
                   });
                   
                   if (txStatus.err || txStatus.error) {
                     throw new Error(`Транзакция завершилась с ошибкой: ${JSON.stringify(txStatus.err || txStatus.error)}`);
                   }
                   
                   // Проверяем оба возможных поля статуса
                   const isConfirmed = (txStatus.commitment === 'confirmed' || txStatus.commitment === 'finalized') ||
                                     (txStatus.confirmationStatus === 'confirmed' || txStatus.confirmationStatus === 'finalized');
                   
                   if (isConfirmed) {
                     confirmed = true;
                     console.log(`        [DEBUG] Транзакция подтверждена (${txStatus.commitment || txStatus.confirmationStatus})`);
                   }
                 } else {
                   console.log(`        [DEBUG] Транзакция еще не найдена в блокчейне`);
                   
                   // Попробуем альтернативный способ - getTransaction
                   if (attempts === 5) { // Только на 5-й попытке для экономии запросов
                     try {
                       console.log(`        [DEBUG] Пробуем getTransaction для дополнительной проверки...`);
                       const tx = await umi.rpc.getTransaction(signature, { commitment: 'confirmed' });
                       if (tx) {
                         console.log(`        [DEBUG] getTransaction нашла транзакцию:`, tx.meta?.err ? 'с ошибкой' : 'успешную');
                         if (tx.meta?.err) {
                           throw new Error(`Транзакция завершилась с ошибкой (из getTransaction): ${JSON.stringify(tx.meta.err)}`);
                         } else {
                           confirmed = true;
                           console.log(`        [DEBUG] Транзакция подтверждена через getTransaction`);
                         }
                       }
                     } catch (getTxError) {
                       console.log(`        [DEBUG] getTransaction тоже не нашла транзакцию: ${getTxError.message}`);
                     }
                   }
                 }
               } catch (pollError) {
                 console.log(`        [DEBUG] Ошибка при проверке статуса: ${pollError.message}`);
               }
            }
            
            if (!confirmed) {
              throw new Error(`Транзакция не была подтверждена за ${maxAttempts * 3} секунд`);
            }
            
            console.log(`        [DEBUG] Отправка и подтверждение завершены за ${(Date.now() - txStartTime)/1000} секунд`);
            
            console.log(`     ✅ УСПЕХ (Попытка ${attempt})! Подпись: ${bs58.encode(signature)}`);
            copyState.status = 'success';
            copyState.error = null;
            copyState.signature = bs58.encode(signature);
            consecutive_failures = 0; // Сброс счетчика ошибок
            copyMintFailed = false;
            totalMintedCount++;
            await sleep(config.mintSuccessDelayMs); // Пауза после успешного минта
            break; // Выход из цикла попыток
          } catch (mintError) {
            const elapsedTime = (Date.now() - txStartTime)/1000;
            console.error(`     ❌ ОШИБКА (Попытка ${attempt}) через ${elapsedTime} секунд: ${mintError.message}`);
            
            // --- Начало: Новая логика обработки ошибок ---
            copyState.error = mintError.message;
            copyMintFailed = true;

            // Обработка 429 Too Many Requests
            if (mintError.message.includes('429') && attempt < config.maxMintAttemptsPerCopy) {
              const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
              console.warn(`        [DEBUG] Получен код 429 (Rate Limit). Повторная попытка #${attempt + 1} через ${delay / 1000} сек...`);
              await sleep(delay);
              continue; // Переход к следующей попытке
            }

            // Обработка Blockhash not found
            if (mintError.message.includes('Blockhash not found') && attempt < config.maxMintAttemptsPerCopy) {
              console.warn(`        [DEBUG] Ошибка 'Blockhash not found'. Повторная попытка #${attempt + 1} через 1 сек с новым blockhash...`);
              await sleep(1000); // Короткая пауза перед получением нового blockhash
              continue; // Переход к следующей попытке
            }
            
            // Обработка ошибки "Leaf already exists"
            const alreadyExists = mintError.message.includes('Leaf already exists') || mintError.message.includes('leaf already exists') || (mintError.logs && mintError.logs.some(log => log.includes('Leaf already exists')));
            if (alreadyExists) {
              console.warn("        Обнаружена ошибка 'Leaf already exists'. Считаем успехом.");
              copyState.status = 'already_exists';
              copyState.error = null;
              consecutive_failures = 0; // Сброс
              copyMintFailed = false;
              totalSkippedCount++;
              break; // Выход из цикла попыток
            }

            // Проверка на неисправимые ошибки (примеры)
            const isUnrecoverable = mintError.message.includes('IncorrectOwner') || mintError.message.includes('CollectionNotFound');
            if (isUnrecoverable) {
               console.error("        Неисправимая ошибка. Прекращаем попытки для этой копии.");
               copyState.status = 'error';
               break; // Выход из цикла попыток
            }
            
            // --- Конец: Новая логика обработки ошибок ---

            // Если ошибка временная и попытки не исчерпаны (стандартная логика retry)
            if (attempt < config.maxMintAttemptsPerCopy) {
              console.log(`        Пауза ${config.mintRetryDelayMs / 1000} сек перед следующей попыткой...`);
              await sleep(config.mintRetryDelayMs);
            } else {
              console.error("        Попытки исчерпаны для этой копии.");
              copyState.status = 'error';
            }
          }
        } catch (mintError) {
          console.error(`     ❌ ОШИБКА (Попытка ${attempt}): ${mintError.message}`);
          copyState.error = mintError.message;
          copyMintFailed = true;
          
          // Обработка ошибки "Leaf already exists"
          const alreadyExists = mintError.message.includes('Leaf already exists') || mintError.message.includes('leaf already exists') || (mintError.logs && mintError.logs.some(log => log.includes('Leaf already exists')));
          if (alreadyExists) {
            console.warn("        Обнаружена ошибка 'Leaf already exists'. Считаем успехом.");
            copyState.status = 'already_exists';
            copyState.error = null;
            consecutive_failures = 0; // Сброс, так как это не реальная ошибка
            copyMintFailed = false;
            totalSkippedCount++; // Считаем как пропущенный, т.к. не мы заминтили сейчас
            break; // Выход из цикла попыток
          }
          
          // Проверка на неисправимые ошибки (примеры)
          const isUnrecoverable = mintError.message.includes('IncorrectOwner') || mintError.message.includes('CollectionNotFound'); // Добавить другие
          if (isUnrecoverable) {
             console.error("        Неисправимая ошибка. Прекращаем попытки для этой копии.");
             copyState.status = 'error';
             break; // Выход из цикла попыток
          }

          // Если ошибка временная
          if (attempt < config.maxMintAttemptsPerCopy) {
            console.log(`        Пауза ${config.mintRetryDelayMs / 1000} сек перед следующей попыткой...`);
            await sleep(config.mintRetryDelayMs);
          } else {
            console.error("        Попытки исчерпаны для этой копии.");
            copyState.status = 'error';
          }
        }
      } // Конец цикла попыток

      // Обновляем файл состояния после КАЖДОЙ копии
      await fs.writeFile(config.batchStateFile, JSON.stringify(batchState, null, 2), 'utf8');

      // Проверка на последовательные ошибки
      if (copyMintFailed && copyState.status === 'error') {
          totalFailedCount++;
          consecutive_failures++;
          console.warn(`  [Внимание] Минтинг копии ${j + 1} для ${imageFilename} завершился с ошибкой. Последовательных неудач: ${consecutive_failures}`);
          if (consecutive_failures >= config.consecutiveFailureLimit) {
              // Сохраняем состояние перед критической остановкой
              await fs.writeFile(config.batchStateFile, JSON.stringify(batchState, null, 2), 'utf8');
              throw new Error(`Критическая ошибка: ${config.consecutiveFailureLimit} последовательных неудач на этапе минтинга. Остановка.`);
          }
      }

    } // Конец цикла копий
  } // Конец цикла ассетов

  console.log("\n--- Завершение цикла минтинга --- ");
  console.log(`Итог: Успешно заминчено: ${totalMintedCount}, Пропущено (уже существуют): ${totalSkippedCount}, Ошибок (после всех попыток): ${totalFailedCount}`);
  console.log(`Детальный статус сохранен в: ${config.batchStateFile}`);
  console.log("--- Этап стабильного минтинга завершен --- ");

}

mintBatchStable().catch(error => {
  console.error("\n--- Непредвиденная ошибка остановила этап минтинга --- ");
  console.error(error.message); // Выводим только сообщение для краткости
  // console.error(error); // Можно раскомментировать для полного стека
  process.exit(1); // Выход с кодом ошибки
}); 