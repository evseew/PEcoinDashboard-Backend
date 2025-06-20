'use strict';

const {
    Connection,
    Keypair,
    PublicKey,
    clusterApiUrl
} = require('@solana/web3.js');
const { Metaplex, keypairIdentity } = require('@metaplex-foundation/js');
const fs = require('fs');
const os = require('os');

// --- Константы и настройки ---
const SOLANA_NETWORK = 'mainnet-beta'; // 'devnet' или 'mainnet-beta'
const RPC_URL = clusterApiUrl(SOLANA_NETWORK); // Используем публичный RPC для mainnet
const KEYPAIR_PATH = os.homedir() + '/.config/solana/id.json'; // Стандартный путь
const COLLECTION_NAME = 'PE Stickers Collection';
const COLLECTION_SYMBOL = 'PES';
const COLLECTION_URI = 'https://ipfs.io/ipfs/QmS8L3M9LZ1AMwg5CdKYb49p1MMk7wBbaNz73Kh1siUXfY'; // Обновленный URI
// Убираем отдельного владельца, текущий кошелек будет владельцем при создании
// const COLLECTION_OWNER_ADDRESS = '9zMiCfGLdyKoRiqj7AScLfBKGJPvriqrFemEi3zagUt7'; 
// -----------------------------

async function main() {
    console.log(`Подключение к сети Solana (${SOLANA_NETWORK} через публичный RPC)...`);
    const connection = new Connection(RPC_URL, 'confirmed');
    
    console.log(`Загрузка кошелька из ${KEYPAIR_PATH}...`);
    let wallet;
    try {
        const secretKeyString = fs.readFileSync(KEYPAIR_PATH, 'utf8');
        const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
        wallet = Keypair.fromSecretKey(secretKey);
        console.log(`Кошелек загружен: ${wallet.publicKey.toBase58()}`);
    } catch (err) {
        console.error('Ошибка загрузки или парсинга ключа:', err);
        console.error(`Убедись, что файл ${KEYPAIR_PATH} существует и содержит корректный секретный ключ в формате JSON массива чисел.`);
        return;
    }
    
    // Инициализация Metaplex SDK с кошельком
    const metaplex = Metaplex.make(connection).use(keypairIdentity(wallet)); // Используем 5J... для подписи/оплаты

    console.log('Создание коллекции в MAINNET...');
    console.log(`  Имя: ${COLLECTION_NAME}`);
    console.log(`  Символ: ${COLLECTION_SYMBOL}`);
    console.log(`  URI: ${COLLECTION_URI}`);
    // Убираем логи про другого владельца
    // console.log(`  Владелец будет: ${COLLECTION_OWNER_ADDRESS}`);
    console.log(`  Владелец и Update Authority будет: ${wallet.publicKey.toBase58()} (текущий кошелек)`);

    try {
        const { nft: collectionNft, response } = await metaplex.nfts().create({
            name: COLLECTION_NAME,
            symbol: COLLECTION_SYMBOL,
            uri: COLLECTION_URI,
            sellerFeeBasisPoints: 0, // 0% роялти
            isCollection: true,
            // owner: По умолчанию будет текущий кошелек (5J...)
            updateAuthority: wallet, // Update Authority - текущий кошелек (5J...)
        });

        console.log('\n--- УСПЕХ! (MAINNET) ---');
        console.log(`Коллекция успешно создана!`);
        console.log(`Адрес коллекции (сохрани его!): ${collectionNft.address.toBase58()}`);
        console.log(`Владелец коллекции (текущий): ${wallet.publicKey.toBase58()}`); // Обновляем лог
        console.log(`Update Authority: ${wallet.publicKey.toBase58()}`);
        console.log(`Подпись транзакции: ${response.signature}`);

        // Записываем адрес коллекции в файл для облегчения будущего использования
        fs.writeFileSync('collection_address.txt', collectionNft.address.toBase58());
        console.log(`Адрес коллекции сохранен в файле collection_address.txt`);

    } catch (error) {
        console.error('\n--- ОШИБКА СОЗДАНИЯ КОЛЛЕКЦИИ ---');
        console.error(error);
        if (error.logs) {
            console.error("\nЛоги транзакции:");
            error.logs.forEach(log => console.error(log));
        }
    }
}

main().catch(err => {
    console.error("Непредвиденная ошибка:", err);
});