// Импортируем необходимые модули
require('dotenv').config(); // Загружает переменные из .env файла
const pinataSDK = require('@pinata/sdk');
const fs = require('fs/promises'); // Используем промисы для асинхронной работы с файлами
const path = require('path');

// --- Конфигурация ---
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
// Путь к папке с ассетами относительно корня проекта
const ASSET_DIR_RELATIVE = 'asset';
const ASSET_DIR_ABSOLUTE = path.resolve(__dirname, ASSET_DIR_RELATIVE); // Получаем полный путь
const IPFS_GATEWAY_PREFIX = 'https://ipfs.io/ipfs/'; // Используем HTTPS шлюз

// Проверка наличия ключей API
if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    console.error(`
Ошибка: Не найдены PINATA_API_KEY или PINATA_SECRET_KEY в .env файле.
Пожалуйста, создайте файл .env в корне проекта и добавьте:
PINATA_API_KEY=ВАШ_КЛЮЧ
PINATA_SECRET_KEY=ВАШ_СЕКРЕТНЫЙ_КЛЮЧ
    `);
    process.exit(1); // Завершаем выполнение скрипта
}

const pinata = new pinataSDK(PINATA_API_KEY, PINATA_SECRET_KEY);

/**
 * Загружает файл на Pinata.
 * @param {string} filePath - Полный путь к файлу.
 * @param {string} pinataName - Имя файла для метаданных Pinata.
 * @returns {Promise<string>} - Промис, который разрешается в IPFS URI ('ipfs://Qm...').
 */
async function uploadFileToPinata(filePath, pinataName) {
    console.log(`  Загрузка файла: ${pinataName}...`);
    // Для pinFileToIPFS нужен читаемый поток (Readable Stream)
    const stream = require('fs').createReadStream(filePath);
    try {
        const result = await pinata.pinFileToIPFS(stream, {
            pinataMetadata: { name: pinataName },
        });
        // Используем HTTPS ссылку вместо ipfs://
        return `${IPFS_GATEWAY_PREFIX}${result.IpfsHash}`;
    } catch (error) {
        console.error(`    Ошибка загрузки файла ${pinataName}:`, error.message || error);
        throw new Error(`Не удалось загрузить файл ${pinataName}`);
    }
}

/**
 * Загружает объект JSON на Pinata.
 * @param {object} jsonData - Объект JSON для загрузки.
 * @param {string} pinataName - Имя для метаданных Pinata.
 * @returns {Promise<string>} - Промис, который разрешается в IPFS URI ('ipfs://Qm...').
 */
async function uploadJsonToPinata(jsonData, pinataName) {
    console.log(`  Загрузка JSON: ${pinataName}...`);
    try {
        const result = await pinata.pinJSONToIPFS(jsonData, {
            pinataMetadata: { name: pinataName },
        });
        // Используем HTTPS ссылку вместо ipfs:// для самого JSON URI
        // Хотя для URI метаданных обычно используют ipfs://, но для единообразия
        // и потенциальной совместимости сделаем тоже HTTPS
        return `${IPFS_GATEWAY_PREFIX}${result.IpfsHash}`;
    } catch (error) {
        console.error(`    Ошибка загрузки JSON ${pinataName}:`, error.message || error);
        throw new Error(`Не удалось загрузить JSON ${pinataName}`);
    }
}

/**
 * Обрабатывает один ассет (картинку и JSON).
 * @param {string} baseName - Имя файла без расширения ('0', '1', 'collection').
 * @param {string} imageFilename - Полное имя файла картинки.
 * @param {string} jsonFilename - Полное имя файла JSON.
 * @returns {Promise<string|null>} - Промис, разрешающийся в URI загруженного JSON или null в случае ошибки.
 */
async function processSingleAsset(baseName, imageFilename, jsonFilename) {
    const imagePath = path.join(ASSET_DIR_ABSOLUTE, imageFilename);
    const jsonPath = path.join(ASSET_DIR_ABSOLUTE, jsonFilename);

    console.log(`
--- Обработка ${baseName} ---`);

    try {
        // Проверяем наличие JSON файла
        await fs.access(jsonPath); // Выдаст ошибку, если файла нет

        // 1. Загружаем картинку
        const imageUri = await uploadFileToPinata(imagePath, imageFilename);
        console.log(`  Картинка загружена: ${imageUri}`);

        // 2. Читаем, модифицируем JSON
        const jsonContent = await fs.readFile(jsonPath, 'utf-8');
        const metadata = JSON.parse(jsonContent);

        delete metadata.seller_fee_basis_points; // Убираем старое поле роялти
        metadata.image = imageUri; // Обновляем основную ссылку на картинку (HTTPS)

        // Обновляем ссылку в properties.files (если структура существует)
        if (Array.isArray(metadata.properties?.files) && metadata.properties.files[0]) {
            metadata.properties.files[0].uri = imageUri; // Тоже HTTPS
        } else if (baseName !== 'collection') { // Для collection.json это поле не обязательно
             console.warn(`  Предупреждение: Структура 'properties.files' не найдена или некорректна в ${jsonFilename}. Ссылка там не обновлена.`);
        }

        // 3. Загружаем обновленный JSON
        const jsonUri = await uploadJsonToPinata(metadata, jsonFilename);
        console.log(`  JSON загружен: ${jsonUri}`);

        return jsonUri; // Возвращаем URI загруженного JSON

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`  Ошибка: Файл ${imageFilename} или ${jsonFilename} не найден. Пропускаем ${baseName}.`);
        } else {
            // Ошибка могла возникнуть при загрузке файла/JSON или чтении JSON
            console.error(`  Ошибка при обработке ${baseName}: ${error.message || error}`);
        }
        return null; // Возвращаем null в случае ошибки
    }
}

/**
 * Основная функция для обработки ассетов.
 */
async function processAssets() {
    console.log(`Начинаем обработку ассетов в папке: ${ASSET_DIR_ABSOLUTE}`);
    const stickerJsonUris = []; // Собираем сюда URI JSON стикеров
    let collectionJsonUri = null; // Сюда URI JSON коллекции

    try {
        const allFiles = await fs.readdir(ASSET_DIR_ABSOLUTE);

        // --- Обработка коллекции ---
        const collectionImageFile = 'collection.png';
        const collectionJsonFile = 'collection.json';
        if (allFiles.includes(collectionImageFile) && allFiles.includes(collectionJsonFile)) {
             collectionJsonUri = await processSingleAsset('collection', collectionImageFile, collectionJsonFile);
        } else {
            console.warn(`
Предупреждение: Файлы collection.png и/или collection.json не найдены в ${ASSET_DIR_ABSOLUTE}. Метаданные коллекции не будут обработаны.`);
        }

        // --- Обработка стикеров ---
        // Фильтруем только PNG файлы стикеров
        const stickerImageFiles = allFiles.filter(
            (f) => f.toLowerCase().endsWith('.png') && f.toLowerCase() !== 'collection.png'
        );

        console.log(`
Найдено ${stickerImageFiles.length} изображений стикеров для обработки.`);

        for (const imageFilename of stickerImageFiles) {
            const baseName = path.basename(imageFilename, path.extname(imageFilename)); // '0', '1', ...
            const jsonFilename = `${baseName}.json`;

            const resultUri = await processSingleAsset(baseName, imageFilename, jsonFilename);
            if (resultUri) {
                stickerJsonUris.push(resultUri); // Добавляем в итоговый список, если успешно
            }
        }

        // --- Вывод результатов ---
        console.log(`=============================================`);
        if (collectionJsonUri) {
            console.log('URI метаданных КОЛЛЕКЦИИ (используйте его в create_collection.js):');
            console.log(collectionJsonUri);
            console.log(`---------------------------------------------`);
        } else {
            console.log('URI метаданных КОЛЛЕКЦИИ не был сгенерирован (файлы не найдены или ошибка).');
            console.log(`---------------------------------------------`);
        }

        if (stickerJsonUris.length > 0) {
            console.log(`Успешно загруженные URI метаданных СТИКЕРОВ (${stickerJsonUris.length} шт.):`);
            stickerJsonUris.forEach((uri, index) => console.log(`${index}: ${uri}`));
        } else {
            console.log('Не удалось загрузить ни одного JSON файла для стикеров.');
        }
        console.log(`=============================================`);

    } catch (error) {
        console.error(`
Критическая ошибка при доступе к папке ассетов (${ASSET_DIR_ABSOLUTE}):`, error);
        process.exit(1);
    }
}

// Запускаем основную функцию
processAssets().catch(error => {
    console.error('Непредвиденная ошибка в processAssets:', error);
    process.exit(1);
}); 