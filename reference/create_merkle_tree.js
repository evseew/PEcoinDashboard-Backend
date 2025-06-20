// create_merkle_tree.js (с использованием Umi и Bubblegum - исправлено для require)
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
// Импортируем весь объект bubblegum
const bubblegum = require("@metaplex-foundation/mpl-bubblegum");
// Берем нужные функции из umi
const { keypairIdentity, generateSigner } = require("@metaplex-foundation/umi");
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

console.log("Используем публичные RPC-эндпоинты Solana:");
console.log(`Резервные: ${BACKUP_RPC_URLS.join(', ')}`);

const maxDepth = 12;
const maxBufferSize = 32;
// canopyDepth не указывается явно при использовании Bubblegum createTree

const treeAddressFile = "tree_address.txt";
// --- ---

async function createMerkleTreeWithUmi() {
  console.log("--- Создание Дерева Меркла с Umi и Bubblegum ---");

  // Пробуем подключиться по очереди к каждому RPC, начиная с основного публичного
  let umi = null;
  let connectedSuccessfully = false;
  let currentRpcUrl = ""; // Инициализируем пустой строкой

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

  // 1. Сначала пробуем основной публичный RPC
  currentRpcUrl = MAIN_RPC_URL;
  console.log(`Пробуем подключиться к основному публичному RPC: ${currentRpcUrl}`);
  umi = createUmiInstance(currentRpcUrl);
  try {
    console.log("Проверяем подключение...");
    const blockhash = await umi.rpc.getLatestBlockhash();
    console.log("✅ Основной публичный RPC работает! Получен blockhash:", blockhash.blockhash);
    connectedSuccessfully = true;
  } catch (e) {
    console.log(`❌ Ошибка подключения к основному публичному RPC ${currentRpcUrl}: ${e.message}`);
  }

  // 2. Если основной публичный не сработал, перебираем резервные (включая ваш частный, если он есть в списке)
  if (!connectedSuccessfully) {
    for (const backupUrl of BACKUP_RPC_URLS) {
      currentRpcUrl = backupUrl;
      console.log(`🔄 Пробуем резервный RPC: ${currentRpcUrl}`);
      umi = createUmiInstance(currentRpcUrl);

      try {
        const blockhash = await umi.rpc.getLatestBlockhash();
        console.log("✅ Резервный RPC работает! Получен blockhash:", blockhash.blockhash);
        connectedSuccessfully = true;
        break; // Нашли работающий RPC, выходим из цикла
      } catch (err) {
        console.log(`❌ Ошибка подключения к резервному RPC ${currentRpcUrl}: ${err.message}`);
      }
    }
  }

  if (!connectedSuccessfully) {
    throw new Error("❗ Не удалось подключиться ни к одному RPC-эндпоинту. Проверьте интернет-соединение и настройки RPC.");
  }

  console.log(`✅ Успешно подключились к RPC: ${currentRpcUrl}`);
  
  // 2. Загрузка кошелька плательщика
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

  // 3. Подключение программы Bubblegum к Umi - используем bubblegum.mplBubblegum()
  umi.use(bubblegum.mplBubblegum());

  // 4. Генерация нового адреса (ключевой пары) для Дерева Меркла
  const merkleTreeSigner = generateSigner(umi);
  const merkleTreeAddress = merkleTreeSigner.publicKey;
  console.log(`Генерируем адрес для Дерева Меркла: ${merkleTreeAddress}`);

  console.log(`Параметры дерева: maxDepth=${maxDepth}, maxBufferSize=${maxBufferSize}`);

  console.log("Отправляем транзакцию на создание дерева через Bubblegum...");

  try {
    // 5. Создание дерева и отправка транзакции - согласно документации Metaplex
    // https://developers.metaplex.com/bubblegum/create-trees
    const builder = await bubblegum.createTree(umi, {
      merkleTree: merkleTreeSigner,
      maxDepth: maxDepth,
      maxBufferSize: maxBufferSize,
    });
    
    // Отправляем транзакцию - правильный способ согласно документации
    // Добавляем опцию confirmation, чтобы избежать использования WebSocket
    const result = await builder.sendAndConfirm(umi, {
      send: { skipPreflight: true },
      confirm: { strategy: { type: 'blockhash', blockhash: (await umi.rpc.getLatestBlockhash()).blockhash } }
    });
    const signature = result.signature;

    console.log("\n--- Успех! ---");
    console.log(`✅ Дерево Меркла успешно создано!`);
    console.log(`Адрес Дерева Меркла: ${merkleTreeAddress}`);
    console.log(`Подпись транзакции: ${bs58.encode(signature)}`);

    fs.writeFileSync(treeAddressFile, merkleTreeAddress.toString());
    console.log(`Адрес дерева сохранен в файл: ${treeAddressFile}`);

  } catch (error) {
    console.error("\n--- Ошибка при создании Дерева Меркла ---");
    console.error("Полная ошибка:", error);
    if (error.logs) {
        console.error("Логи транзакции:");
        error.logs.forEach(log => console.error(log));
    }
  }
}

// Запуск асинхронной функции
createMerkleTreeWithUmi().catch(err => {
    console.error("Непредвиденная ошибка:", err);
}); 