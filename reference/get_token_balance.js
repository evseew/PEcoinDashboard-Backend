const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const { publicKey, some } = require("@metaplex-foundation/umi");
const { findAssociatedTokenPda } = require("@metaplex-foundation/mpl-toolbox");
const { mplToolbox } = require("@metaplex-foundation/mpl-toolbox");
const dotenv = require("dotenv");

dotenv.config();

// --- Конфигурация ---
const OWNER_ADDRESS = "9zMiCfGLdyKoRiqj7AScLfBKGJPvriqrFemEi3zagUt7"; // Ваш адрес кошелька
const MINT_ADDRESS = "FDT9EMUytSwaP8GKiKdyv59rRAsT7gAB57wHUPm7wY9r"; // Адрес минта SPL токена

// RPC-эндпоинты (как в других скриптах)
const USER_RPC_URL = process.env.RPC_URL; // Ваш основной RPC (например, Alchemy)
const MAIN_RPC_URL = "https://api.mainnet-beta.solana.com"; // Публичный RPC
const BACKUP_RPC_URLS = [
  // Другие резервные URL, если есть
].filter(url => url); 

async function getTokenBalance() {
  console.log(`--- Проверка баланса токена ---`);
  console.log(`Кошелек: ${OWNER_ADDRESS}`);
  console.log(`Токен (Mint): ${MINT_ADDRESS}`);

  let umi = null;
  let currentRpcUrl = null; 
  let connectedSuccessfully = false;
  
  // Функция для создания UMI
  const createUmiInstance = (url) => {
    // Используем цепочку вызовов для .use()
    const umi = createUmi(url, {
      httpOptions: { 
        fetchMiddleware: (req, next) => next(req) 
      } 
    }).use(mplToolbox()); // Подключаем mplToolbox сразу
    
    // Перезаписываем confirm (на всякий случай, хотя здесь не отправляем транзакции)
    umi.rpc.confirm = async (signature, commitment) => {
        const result = await umi.rpc.getSignatureStatuses([signature], { commitment });
        if (result.value[0]?.err) throw new Error(`Transaction failed: ${JSON.stringify(result.value[0].err)}`);
        return signature;
    };
    return umi;
  };

  // Пробуем подключиться к RPC (предпочитаем USER_RPC_URL)
  const rpcUrlsToTry = [USER_RPC_URL, ...BACKUP_RPC_URLS, MAIN_RPC_URL].filter(url => url);

  for (const rpcUrl of rpcUrlsToTry) {
    currentRpcUrl = rpcUrl;
    console.log(`\n🔄 Пробуем подключиться к RPC: ${currentRpcUrl}`);
    umi = createUmiInstance(currentRpcUrl);

    try {
      console.log("Проверяем подключение...");
      await umi.rpc.getLatestBlockhash(); 
      console.log("✅ RPC подключение работает!");
      connectedSuccessfully = true;
      break; 
    } catch (e) {
      console.log(`❌ Ошибка подключения к ${currentRpcUrl}: ${e.message}`);
    }
  }

  if (!connectedSuccessfully) {
    console.error("\n❗ Не удалось подключиться ни к одному RPC-эндпоинту.");
    console.error("   Пожалуйста, убедитесь, что в .env файле указан корректный RPC URL.");
    return; 
  }

  console.log(`✅ Успешно подключились к RPC: ${currentRpcUrl}`);

  try {
    const ownerPublicKey = publicKey(OWNER_ADDRESS);
    const mintPublicKey = publicKey(MINT_ADDRESS);

    console.log("\nИщем связанный токен-аккаунт (ATA)...");
    
    // Находим адрес Associated Token Account (ATA)
    // Это специальный адрес, где хранятся токены конкретного типа для конкретного кошелька
    const associatedTokenAccountPda = findAssociatedTokenPda(umi, {
        mint: mintPublicKey,
        owner: ownerPublicKey,
    });
    console.log(`Адрес ATA: ${associatedTokenAccountPda}`);

    console.log("\nЗапрашиваем информацию об аккаунте токена...");
    // Пытаемся получить информацию об этом аккаунте, используя метод из toolbox
    const tokenAccount = await umi.toolbox.accounts.fetchToken(associatedTokenAccountPda); 

    console.log("Запрашиваем информацию о минте токена (для получения децималов)...");
    // Получаем информацию о минте, используя метод из toolbox
    const mintAccount = await umi.toolbox.accounts.fetchMint(mintPublicKey);
    const decimals = mintAccount.decimals;
    
    // Баланс хранится как целое число, его нужно разделить на 10^decimals
    const balance = Number(tokenAccount.amount) / (10 ** decimals);

    console.log("\n--- Баланс ---");
    console.log(`Баланс токена ${MINT_ADDRESS}`);
    console.log(`на кошельке ${OWNER_ADDRESS}:`);
    console.log(`➡️  ${balance}`);
    console.log(`(Децималов у токена: ${decimals})`);

  } catch (error) {
     // Отдельно обрабатываем случай, когда токен-аккаунт просто не найден
     if (error.message && (error.message.includes("Account not found") || error.message.includes("could not find account"))) {
        console.log("\n--- Баланс ---");
        console.log(`Токен-аккаунт для ${MINT_ADDRESS} на кошельке ${OWNER_ADDRESS} не найден.`);
        console.log(`Это означает, что баланс равен 0.`);
     } else {
        console.error("\n❌ Ошибка при получении баланса токена:");
        console.error(error);
     }
  }
}

// Запуск основной функции
getTokenBalance().catch(err => {
  console.error("\nНепредвиденная ошибка:", err);
}); 