// mint_nft.js (с использованием Umi и Bubblegum)
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const bubblegum = require("@metaplex-foundation/mpl-bubblegum");
const { keypairIdentity, publicKey } = require("@metaplex-foundation/umi");
const bs58 = require("bs58");
const dotenv = require("dotenv");
const fs = require("fs");

dotenv.config();

// --- Исходные данные ---
const payerPrivateKey = process.env.PRIVATE_KEY;
if (!payerPrivateKey) {
  throw new Error("PRIVATE_KEY не найден в файле .env");
}
// Сохраняем ваш текущий RPC-эндпоинт в качестве резервного
const USER_RPC_URL = process.env.RPC_URL;
// Указываем публичные RPC-эндпоинты Solana
const MAIN_RPC_URL = "https://api.mainnet-beta.solana.com";
const BACKUP_RPC_URLS = [
  "https://solana-api.projectserum.com",
  "https://rpc.ankr.com/solana",
  USER_RPC_URL, // ваш RPC как последний резервный вариант
].filter(url => url); // удаляем пустые URL

const treeAddressFile = "tree_address.txt";
const collectionAddressFile = "collection_address.txt"; // Файл с адресом коллекции
const uriListFile = "uris.txt"; // Файл со списком URI метаданных
const copiesPerNft = 3; // Количество копий для каждого NFT
const receiverAddressStr = "9zMiCfGLdyKoRiqj7AScLfBKGJPvriqrFemEi3zagUt7"; // Адрес получателя NFT
const delayBetweenMintsMs = 1000; // Задержка между минтами в миллисекундах (1 секунда)

// Добавляем адрес твоего выделенного шлюза
const dedicatedPinataGateway = "https://amber-accused-tortoise-973.mypinata.cloud";

// Вспомогательная функция для задержки
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function mintCompressedNftCopies() {
  console.log(`--- Минтинг ${copiesPerNft} копий каждого сжатого NFT из файла ${uriListFile} ---`);

  // Чтение адреса дерева из файла
  let treeAddressStr;
  try {
    treeAddressStr = fs.readFileSync(treeAddressFile, "utf8").trim();
  } catch (err) {
    console.error(`Ошибка чтения файла ${treeAddressFile}. Убедитесь, что скрипт создания дерева был запущен.`);
    throw err;
  }
  const treeAddress = publicKey(treeAddressStr);
  console.log(`Используем Дерево Меркла: ${treeAddress}`);

  // Чтение адреса коллекции из файла
  let collectionAddressStr;
  try {
    collectionAddressStr = fs.readFileSync(collectionAddressFile, "utf8").trim();
  } catch (err) {
    console.error(`Ошибка чтения файла ${collectionAddressFile}. Убедитесь, что файл существует.`);
    throw err;
  }
  const collectionAddress = publicKey(collectionAddressStr);
  console.log(`Используем коллекцию: ${collectionAddress}`);

  // Чтение списка URI из файла
  let nftUris;
  try {
    nftUris = fs.readFileSync(uriListFile, "utf8").split('\n').map(uri => uri.trim()).filter(uri => uri);
    if (nftUris.length === 0) {
      throw new Error(`Файл ${uriListFile} пуст или не содержит валидных URI.`);
    }
  } catch (err) {
    console.error(`Ошибка чтения или парсинга файла ${uriListFile}.`);
    throw err;
  }
  console.log(`Найдено ${nftUris.length} URI метаданных в файле ${uriListFile}.`);
  console.log(`Будет создано ${nftUris.length * copiesPerNft} NFT (${copiesPerNft} копии для каждого URI).`);

  // Преобразование адреса получателя
  const receiverAddress = publicKey(receiverAddressStr);
  console.log(`Адрес получателя NFT: ${receiverAddress}`);

  // 1. Подключение к RPC (аналогично create_merkle_tree.js)
  let umi = null;
  let connectedSuccessfully = false;
  let currentRpcUrl = "";

  const createUmiInstance = (url) => {
    const umi = createUmi(url, {
      httpOptions: { fetchMiddleware: (req, next) => next(req) }
    });
    umi.rpc.confirm = async (signature, commitment) => {
      // Используем getSignatureStatuses для проверки подтверждения через HTTP
      const result = await umi.rpc.getSignatureStatuses([signature], { commitment });
      let retries = 10; // Попробуем несколько раз с задержкой
      while (retries > 0 && (!result || !result.value || !result.value[0])) {
           console.log(`   ...ожидание подтверждения (${11 - retries}/10)...`);
           await sleep(2000); // Ждем 2 секунды
           result = await umi.rpc.getSignatureStatuses([signature], { commitment });
           retries--;
      }
      if (!result || !result.value || !result.value[0]) {
          throw new Error(`Транзакция ${bs58.encode(signature)} не была подтверждена после ${10} попыток.`);
      }
      if (result.value[0].err) {
        throw new Error(`Transaction failed: ${JSON.stringify(result.value[0].err)}`);
      }
      console.log(`   Транзакция ${bs58.encode(signature)} подтверждена.`);
      return signature;
    };
    return umi;
  };

  // Пробуем основной публичный RPC
  currentRpcUrl = MAIN_RPC_URL;
  console.log(`Пробуем подключиться к основному публичному RPC: ${currentRpcUrl}`);
  umi = createUmiInstance(currentRpcUrl);
  try {
    await umi.rpc.getLatestBlockhash();
    console.log("✅ Основной публичный RPC работает!");
    connectedSuccessfully = true;
  } catch (e) {
    console.log(`❌ Ошибка подключения к основному публичному RPC ${currentRpcUrl}: ${e.message}`);
  }

  // Пробуем резервные RPC, если основной не сработал
  if (!connectedSuccessfully) {
    for (const backupUrl of BACKUP_RPC_URLS) {
      currentRpcUrl = backupUrl;
      console.log(`🔄 Пробуем резервный RPC: ${currentRpcUrl}`);
      umi = createUmiInstance(currentRpcUrl);
      try {
        await umi.rpc.getLatestBlockhash();
        console.log("✅ Резервный RPC работает!");
        connectedSuccessfully = true;
        break;
      } catch (err) {
        console.log(`❌ Ошибка подключения к резервному RPC ${currentRpcUrl}: ${err.message}`);
      }
    }
  }

  if (!connectedSuccessfully) {
    throw new Error("❗ Не удалось подключиться ни к одному RPC-эндпоинту.");
  }
  console.log(`✅ Успешно подключились к RPC: ${currentRpcUrl}`);

  // 2. Загрузка кошелька плательщика
  let secretKeyBytes;
  try {
    secretKeyBytes = bs58.decode(payerPrivateKey);
  } catch (e) {
      console.error("Ошибка декодирования приватного ключа.");
      throw e;
  }
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(secretKeyBytes);
  umi.use(keypairIdentity(umiKeypair));
  console.log(`Плательщик: ${umi.identity.publicKey}`);

  // 3. Подключение программы Bubblegum к Umi
  umi.use(bubblegum.mplBubblegum());

  // --- Минтинг ---
  console.log("\n--- Начало процесса минтинга (через выделенный шлюз Pinata) ---");
  let totalMinted = 0;
  let totalErrors = 0;

  for (let i = 0; i < nftUris.length; i++) {
    const currentUri = nftUris[i];
    const cid = currentUri.split('/ipfs/')[1];
    if (!cid) {
        console.error(`  ❌ Не удалось извлечь CID из URI: ${currentUri}. Пропуск.`);
        totalErrors += copiesPerNft;
        continue;
    }
    console.log(`\n[${i + 1}/${nftUris.length}] Обработка CID: ${cid}`);

    // Пауза перед запросом к шлюзу
    if (i > 0) {
        const fetchDelay = 1000; // Уменьшаем паузу для выделенного шлюза (1 секунда)
        console.log(`  Пауза ${fetchDelay / 1000} сек перед запросом к выделенному шлюзу...`);
        await sleep(fetchDelay);
    }

    let metadataJson;
    try {
      console.log(`  Запрос метаданных с выделенного шлюза для CID ${cid}...`);
      const gatewayUrl = `${dedicatedPinataGateway}/ipfs/${cid}`; // Формируем URL для выделенного шлюза
      const response = await fetch(gatewayUrl, {
        headers: {
          // Оставляем User-Agent на всякий случай
           'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          // API ключи не нужны
        }
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Не удалось прочитать тело ответа");
        // Проверяем на HTML страницу блокировки (маловероятно для dedicated gateway, но на всякий случай)
         if (errorText.toLowerCase().includes('<html')) {
            console.error("     Ответ похож на HTML страницу блокировки.");
            throw new Error(`Не удалось загрузить метаданные с выделенного шлюза. Статус: ${response.status}. Получена HTML страница.`);
        } else {
            throw new Error(`Не удалось загрузить метаданные с выделенного шлюза. Статус: ${response.status}. Ответ: ${errorText}`);
        }
      }
      metadataJson = await response.json();
      console.log(`  Метаданные загружены через выделенный шлюз. Имя: ${metadataJson.name}`);
    } catch (fetchError) {
      console.error(`  ❌ Ошибка загрузки метаданных с выделенного шлюза для CID ${cid}: ${fetchError.message}`);
      totalErrors += copiesPerNft;
      console.error(`     Пропуск минтинга ${copiesPerNft} копий для этого CID.`);
      continue;
    }

    // Готовим общие аргументы метаданных
     const metadataArgs = {
        name: metadataJson.name || "Unnamed NFT",
        symbol: metadataJson.symbol || "UNSYM",
        // URI для метаданных NFT должен указывать на твой выделенный шлюз для надежности
        uri: `${dedicatedPinataGateway}/ipfs/${cid}`, // Используем URI с выделенным шлюзом
        sellerFeeBasisPoints: metadataJson.seller_fee_basis_points === undefined ? 0 : metadataJson.seller_fee_basis_points,
        collection: {
          key: collectionAddress,
          verified: false,
        },
        creators: metadataJson.properties?.creators || metadataJson.creators || [
          {
            address: umi.identity.publicKey,
            share: 100,
            verified: true,
          },
        ],
     };

    // Минтим указанное количество копий для этого URI
    for (let j = 0; j < copiesPerNft; j++) {
      console.log(`  Минтинг копии ${j + 1}/${copiesPerNft}...`);
      try {
        const builder = await bubblegum.mintToCollectionV1(umi, {
          leafOwner: receiverAddress, // Адрес получателя
          merkleTree: treeAddress,
          collectionMint: collectionAddress, // Адрес коллекции
          metadata: metadataArgs, // Передаем собранные метаданные
        });

        // Отправляем и ждем подтверждения транзакции
        console.log("   Отправка транзакции...");
        const result = await builder.sendAndConfirm(umi, {
          send: { skipPreflight: true },
          confirm: { strategy: { type: 'blockhash', blockhash: (await umi.rpc.getLatestBlockhash()).blockhash } }
        });
        const signature = result.signature;

        console.log(`   ✅ Успешно! Копия ${j + 1} для ${metadataArgs.name} создана.`);
        console.log(`   Подпись транзакции: ${bs58.encode(signature)}`);
        totalMinted++;

        // Задержка перед следующим минтом
        if (i < nftUris.length -1 || j < copiesPerNft - 1) { // Не ждем после самого последнего минта
             console.log(`   Пауза ${delayBetweenMintsMs / 1000} сек...`);
             await sleep(delayBetweenMintsMs);
        }

      } catch (mintError) {
        console.error(`   ❌ Ошибка при минтинге копии ${j + 1} для URI ${currentUri}:`);
        // Выводим более подробную информацию об ошибке, если доступна
        if (mintError.logs) {
            console.error("   Логи транзакции:");
            mintError.logs.forEach(log => console.error("     "+ log));
        } else {
             console.error("   Полная ошибка:", mintError);
        }
        totalErrors++;
        // Решаем, стоит ли продолжать при ошибке (например, можно добавить break, чтобы остановить все)
        // continue; // Пока просто пропускаем эту копию и идем дальше
      }
    }
  }

  console.log(`\n--- Минтинг завершен ---`);
  console.log(`Успешно создано NFT: ${totalMinted}`);
  console.log(`Ошибок при минтинге: ${totalErrors}`);
  console.log(`Все NFT отправлены на адрес: ${receiverAddressStr}`);
}

// Запуск асинхронной функции
mintCompressedNftCopies().catch(err => { // Переименовываем функцию
    console.error("\n--- Непредвиденная ошибка в процессе минтинга ---");
    console.error(err);
}); 