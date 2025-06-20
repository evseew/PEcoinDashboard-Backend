const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const { dasApi } = require("@metaplex-foundation/digital-asset-standard-api");
const { publicKey } = require("@metaplex-foundation/umi");
const dotenv = require("dotenv");

dotenv.config();

// --- Конфигурация ---
const OWNER_ADDRESS = "9zMiCfGLdyKoRiqj7AScLfBKGJPvriqrFemEi3zagUt7"; // Адрес кошелька для проверки

// Резервные RPC-эндпоинты Solana
const USER_RPC_URL = process.env.RPC_URL;
const MAIN_RPC_URL = "https://api.mainnet-beta.solana.com"; // Основной RPC - может не поддерживать DAS API
const BACKUP_RPC_URLS = [
  // Добавьте сюда URL вашего RPC, если он поддерживает Digital Asset Standard API (DAS API)
  // Например, от Helius, QuickNode, Triton и т.д.
  // "YOUR_DAS_API_ENABLED_RPC_URL", 
  // USER_RPC_URL, // Убираем USER_RPC_URL отсюда, т.к. он будет проверяться первым
].filter(url => url); 

async function getNFTs() {
  console.log(`--- Получение списка NFT для кошелька: ${OWNER_ADDRESS} ---`);

  let umi = null;
  let currentRpcUrl = null; 
  let connectedSuccessfully = false;
  
  // Функция для создания UMI с указанным URL
  const createUmiInstance = (url) => {
    const umi = createUmi(url, {
      httpOptions: { 
        fetchMiddleware: (req, next) => next(req) 
      } 
    }).use(dasApi()); // Подключаем Digital Asset Standard API
    
    // Перезаписываем метод confirm, чтобы он не использовал WebSocket (как в mint_nfts.js)
    umi.rpc.confirm = async (signature, commitment) => {
      const result = await umi.rpc.getSignatureStatuses([signature], { commitment });
      if (result.value[0]?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(result.value[0].err)}`);
      }
      return signature;
    };
    
    return umi;
  };

  // Сначала пробуем основной RPC пользователя (из .env), затем резервные, затем публичный
  const rpcUrlsToTry = [USER_RPC_URL, ...BACKUP_RPC_URLS, MAIN_RPC_URL].filter(url => url); // Добавляем USER_RPC_URL в начало и фильтруем null/undefined

  for (const rpcUrl of rpcUrlsToTry) {
    currentRpcUrl = rpcUrl;
    console.log(`🔄 Пробуем подключиться к RPC: ${currentRpcUrl}`);
    umi = createUmiInstance(currentRpcUrl);

    try {
      // Проверяем работоспособность RPC и поддержку DAS API (getAssetsByOwner)
      console.log("Проверяем подключение и поддержку DAS API...");
      // Делаем пробный вызов с лимитом 1, чтобы не загружать много данных
      await umi.rpc.getAssetsByOwner({ owner: publicKey(OWNER_ADDRESS), limit: 1 }); 
      console.log("✅ RPC работает и поддерживает DAS API!");
      connectedSuccessfully = true;
      break; // Нашли работающий RPC, выходим из цикла
    } catch (e) {
      console.log(`❌ Ошибка подключения или RPC не поддерживает DAS API (${currentRpcUrl}): ${e.message}`);
      // Ошибка может быть из-за неподдержки метода getAssetsByOwner
      if (e.message && e.message.includes("Method not found")) {
          console.log(`   (Вероятно, этот RPC не поддерживает метод getAssetsByOwner)`);
      }
    }
  }

  if (!connectedSuccessfully) {
    console.error("❗ Не удалось подключиться к RPC-эндпоинту, поддерживающему DAS API.");
    console.error("   Пожалуйста, убедитесь, что в .env файле указан корректный RPC URL (например, от Alchemy),",); // Обновляем сообщение
    console.error("   который поддерживает Digital Asset Standard (DAS) API.");
    console.error("   Проверьте также резервные URL в коде, если они указаны."); // Обновляем сообщение
    return; // Выходим, если не удалось подключиться
  }

  console.log(`✅ Успешно подключились к RPC: ${currentRpcUrl}`);

  try {
    console.log("\nЗапрашиваем список NFT...");
    // Получаем все ассеты для указанного владельца
    // Важно: Этот метод может вернуть не только сжатые NFT, но и другие типы ассетов (токены и т.д.)
    // Мы будем фильтровать по наличию 'compression' в данных.
    const assets = await umi.rpc.getAssetsByOwner({ owner: publicKey(OWNER_ADDRESS) });

    console.log(`\n--- Найденные NFT (сжатые) для ${OWNER_ADDRESS} ---`);
    
    let compressedNftCount = 0;
    if (assets && assets.items) {
      assets.items.forEach(asset => {
        // Проверяем, является ли ассет сжатым NFT
        if (asset.compression?.compressed === true && asset.compression.tree) {
          console.log(`- ID: ${asset.id}`); // asset.id это и есть assetId
          // console.log(`  Имя: ${asset.content?.metadata?.name || 'N/A'}`); // Раскомментируйте, если нужно имя
          // console.log(`  Дерево: ${asset.compression.tree}`); // Раскомментируйте, если нужно дерево
          compressedNftCount++;
        }
      });
    }

    if (compressedNftCount === 0) {
      console.log("Сжатые NFT для этого кошелька не найдены.");
    } else {
       console.log(`\nВсего найдено сжатых NFT: ${compressedNftCount}`);
    }
     console.log(`\nОбщее количество найденных ассетов (включая не NFT): ${assets?.total || 0}`);


  } catch (error) {
    console.error("\n❌ Ошибка при получении списка NFT:");
    console.error(error);
     if (error.message && error.message.includes("Method not found")) {
          console.error(`\n   Кажется, RPC (${currentRpcUrl}) все же не поддерживает метод getAssetsByOwner.`);
          console.error("   Пожалуйста, используйте другой RPC URL.");
     }
  }
}

// Запуск основной функции
getNFTs().catch(err => {
  console.error("\nНепредвиденная ошибка:", err);
}); 