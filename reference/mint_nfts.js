const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const bubblegum = require("@metaplex-foundation/mpl-bubblegum");
const { keypairIdentity, generateSigner } = require("@metaplex-foundation/umi");
const bs58 = require("bs58");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

// --- Конфигурация ---
const payerPrivateKey = process.env.PRIVATE_KEY;
if (!payerPrivateKey) {
  throw new Error("PRIVATE_KEY не найден в файле .env");
}

// Резервные RPC-эндпоинты Solana в случае проблем с основным
const USER_RPC_URL = process.env.RPC_URL;
const MAIN_RPC_URL = "https://api.mainnet-beta.solana.com";
const BACKUP_RPC_URLS = [
  "https://solana-api.projectserum.com",
  "https://rpc.ankr.com/solana",
  USER_RPC_URL,
].filter(url => url);

// Адрес кошелька, на который будут отправлены NFT
const RECEIVER_ADDRESS = "9zMiCfGLdyKoRiqj7AScLfBKGJPvriqrFemEi3zagUt7";

// Получаем адреса дерева Меркла и коллекции
const treeAddress = fs.readFileSync("tree_address.txt", "utf8").trim();
const collectionAddress = fs.readFileSync("collection_address.txt", "utf8").trim();

// Директория с ассетами
const ASSET_DIR = "asset";

// Количество копий каждого NFT
const COPIES_PER_NFT = 3;

async function mintNFTs() {
  console.log("--- Минтинг сжатых NFT с использованием Bubblegum ---");
  
  // Подключение к RPC
  let umi = null;
  let currentRpcUrl = MAIN_RPC_URL;
  let connectedSuccessfully = false;
  
  // Функция для создания UMI с указанным URL
  const createUmiInstance = (url) => {
    const umi = createUmi(url, {
      httpOptions: { 
        fetchMiddleware: (req, next) => next(req)
      }
    });
    
    // Перезаписываем метод confirm, чтобы он не использовал WebSocket
    umi.rpc.confirm = async (signature, commitment) => {
      // Проверяем статус транзакции через HTTP
      const result = await umi.rpc.getSignatureStatuses([signature], { commitment });
      if (result.value[0]?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(result.value[0].err)}`);
      }
      return signature;
    };
    
    return umi;
  };
  
  // Пробуем основной RPC
  console.log(`Подключаемся к основному RPC: ${currentRpcUrl}`);
  umi = createUmiInstance(currentRpcUrl);
  
  try {
    console.log("Проверяем подключение...");
    const blockhash = await umi.rpc.getLatestBlockhash();
    console.log("✅ RPC подключение работает!");
    connectedSuccessfully = true;
  } catch (e) {
    console.log(`❌ Ошибка подключения к ${currentRpcUrl}: ${e.message}`);
    
    // Если не удалось подключиться к основному, перебираем резервные
    for (const backupUrl of BACKUP_RPC_URLS) {
      currentRpcUrl = backupUrl;
      console.log(`🔄 Пробуем резервный RPC: ${currentRpcUrl}`);
      umi = createUmiInstance(currentRpcUrl);
      
      try {
        const blockhash = await umi.rpc.getLatestBlockhash();
        console.log("✅ Резервный RPC работает!");
        connectedSuccessfully = true;
        break; // Нашли работающий RPC, выходим из цикла
      } catch (err) {
        console.log(`❌ Ошибка подключения к ${currentRpcUrl}: ${err.message}`);
      }
    }
  }
  
  if (!connectedSuccessfully) {
    throw new Error("❗ Не удалось подключиться ни к одному RPC-эндпоинту. Проверьте интернет-соединение.");
  }
  
  console.log(`✅ Успешно подключились к RPC: ${currentRpcUrl}`);
  
  // Загрузка кошелька плательщика
  let secretKeyBytes;
  try {
    secretKeyBytes = bs58.decode(payerPrivateKey);
  } catch (e) {
    console.error("Ошибка декодирования приватного ключа. Убедитесь, что он в формате base58.");
    throw e;
  }
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(secretKeyBytes);
  umi.use(keypairIdentity(umiKeypair));
  console.log(`Плательщик: ${umi.identity.publicKey}`);
  
  // Подключение программы Bubblegum
  umi.use(bubblegum.mplBubblegum());
  
  // Получаем список всех изображений для минтинга
  const files = fs.readdirSync(ASSET_DIR);
  const imageFiles = files.filter(
    file => file.endsWith('.png') && file !== 'collection.png'
  );
  
  console.log(`Найдено ${imageFiles.length} изображений для минтинга`);
  console.log(`Для каждого изображения будет создано ${COPIES_PER_NFT} NFT`);
  console.log(`Всего будет создано ${imageFiles.length * COPIES_PER_NFT} NFT`);
  console.log(`Получатель всех NFT: ${RECEIVER_ADDRESS}`);
  
  // Счетчик успешных минтов
  let successfulMints = 0;
  
  // Для каждого изображения
  for (const imageFile of imageFiles) {
    const baseName = path.basename(imageFile, '.png');
    const jsonFile = `${baseName}.json`;
    const jsonPath = path.join(ASSET_DIR, jsonFile);
    
    // Проверяем, существует ли JSON файл
    if (!fs.existsSync(jsonPath)) {
      console.log(`⚠️ JSON файл для ${imageFile} не найден, пропускаем...`);
      continue;
    }
    
    // Читаем JSON файл с метаданными
    const jsonContent = fs.readFileSync(jsonPath, 'utf8');
    const metadata = JSON.parse(jsonContent);
    
    console.log(`\n--- Минтинг ${baseName} (${COPIES_PER_NFT} копий) ---`);
    
    // Минтим указанное количество копий
    for (let i = 0; i < COPIES_PER_NFT; i++) {
      try {
        console.log(`Минтинг ${baseName} - копия ${i+1}/${COPIES_PER_NFT}...`);
        
        // Создаем метаданные для NFT
        const nftMetadata = {
          name: metadata.name,
          symbol: metadata.symbol || "PESTICKERS",
          uri: metadata.image, // Здесь должен быть URI метаданных, но мы используем URI изображения в качестве примера
          sellerFeeBasisPoints: 0, // Без комиссии
          collection: {
            key: collectionAddress,
            verified: false, // Это будет верифицировано позже
          },
          creators: metadata.properties?.creators || [
            {
              address: umi.identity.publicKey,
              share: 100,
              verified: false,
            },
          ],
        };
        
        // Отправляем транзакцию на минтинг
        const builder = await bubblegum.mintToCollectionV1(umi, {
          leafOwner: RECEIVER_ADDRESS,
          merkleTree: treeAddress,
          metadata: nftMetadata,
          collectionMint: collectionAddress,
        });
        
        // Отправляем и ждем подтверждения транзакции
        const result = await builder.sendAndConfirm(umi, {
          send: { skipPreflight: true },
          confirm: { strategy: { type: 'blockhash', blockhash: (await umi.rpc.getLatestBlockhash()).blockhash } }
        });
        
        console.log(`✅ Успешно заминчен ${baseName} - копия ${i+1}/${COPIES_PER_NFT}`);
        console.log(`   Подпись транзакции: ${bs58.encode(result.signature)}`);
        successfulMints++;
        
        // Небольшая задержка между минтами для избежания ошибок RPC
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Ошибка при минтинге ${baseName} - копия ${i+1}/${COPIES_PER_NFT}:`);
        console.error(error.message);
        if (error.logs) {
          console.error("Логи транзакции:");
          error.logs.forEach(log => console.error(log));
        }
      }
    }
  }
  
  console.log(`\n=== Итоги минтинга ===`);
  console.log(`Успешно заминчено: ${successfulMints} NFT`);
  console.log(`Все NFT отправлены на кошелек: ${RECEIVER_ADDRESS}`);
}

// Запуск основной функции
mintNFTs().catch(err => {
  console.error("Непредвиденная ошибка:", err);
}); 