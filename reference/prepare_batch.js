// prepare_batch.js
const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');
const config = require('./config');

dotenv.config();

const pinataApiKey = process.env.PINATA_API_KEY;
const pinataSecretApiKey = process.env.PINATA_SECRET_KEY;
const pinataApiUrl = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

// Вспомогательная функция для задержки
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Функция для загрузки файла на Pinata с retry
async function uploadToPinata(filePath, fileName, batchId, attempt = 1) {
  console.log(`  [Загрузка Pinata] Попытка ${attempt}/${config.maxPinataUploadAttempts} для файла: ${fileName} (Батч: ${batchId})`);
  try {
    const fileStream = await fs.readFile(filePath);
    const formData = new FormData();
    formData.append('file', new Blob([fileStream]), fileName);

    // Формируем метаданные с batchId (только дата)
    const pinataMetadata = {
      name: `${config.collectionBaseName} - ${fileName}`, // Улучшенное имя для UI Pinata
      keyvalues: {
        batchId: batchId, // Используем переданный batchId (только дата)
        collectionName: config.collectionBaseName,
        fileType: fileName.endsWith('.json') ? 'metadata_json' : 'image',
        originalFilename: fileName
      }
    };

    // Добавляем фильтр по имени из конфига, если он есть
    if (config.pinataMetadataFilterName) {
        pinataMetadata.keyvalues.filterName = config.pinataMetadataFilterName;
        // Можно добавить filterName и в основное имя для удобства
        pinataMetadata.name = `${config.pinataMetadataFilterName} - ${fileName}`;
    }

    formData.append('pinataMetadata', JSON.stringify(pinataMetadata));

    const response = await fetch(pinataApiUrl, {
      method: 'POST',
      headers: {
        'pinata_api_key': pinataApiKey,
        'pinata_secret_api_key': pinataSecretApiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Не удалось прочитать тело ответа");
      throw new Error(`Статус: ${response.status}. Ответ: ${errorText}`);
    }

    const result = await response.json();
    console.log(`  [Загрузка Pinata] Успешно (${fileName}). CID: ${result.IpfsHash}`);
    return result.IpfsHash; // Возвращаем CID

  } catch (error) {
    console.error(`  [Загрузка Pinata] Ошибка на попытке ${attempt} для ${fileName}: ${error.message}`);
    if (attempt < config.maxPinataUploadAttempts) {
      console.log(`  [Загрузка Pinata] Пауза ${config.pinataRetryDelayMs / 1000} сек перед следующей попыткой...`);
      await sleep(config.pinataRetryDelayMs);
      // Передаем batchId при рекурсивном вызове
      return uploadToPinata(filePath, fileName, batchId, attempt + 1);
    } else {
      console.error(`  [Загрузка Pinata] Попытки исчерпаны для ${fileName}.`);
      throw new Error(`Не удалось загрузить ${fileName} на Pinata после ${config.maxPinataUploadAttempts} попыток. Последняя ошибка: ${error.message}`);
    }
  }
}

// Основная функция подготовки батча
async function prepareBatch() {
  console.log("--- Запуск этапа подготовки батча ---");

  if (!pinataApiKey || !pinataSecretApiKey) {
    throw new Error('Ключи Pinata API (PINATA_API_KEY, PINATA_SECRET_KEY) не найдены в .env');
  }

  // ---> Генерируем batchId (только дата YYYY-MM-DD) <---
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0'); // Месяцы от 0 до 11
  const day = String(today.getDate()).padStart(2, '0');
  const currentBatchId = `${year}-${month}-${day}`;
  console.log(`[Батч ID] Установлен ID для этого запуска: ${currentBatchId}`);

  // --- 1. Чтение и инициализация состояния --- 
  let batchState = {};
  let existingFiles = {};
  try {
    const stateFileContent = await fs.readFile(config.batchStateFile, 'utf8');
    batchState = JSON.parse(stateFileContent);
    console.log(`Найден существующий файл состояния батча: ${config.batchStateFile}`);
    // Сохраняем информацию о файлах из существующего состояния
    Object.keys(batchState).forEach(key => existingFiles[key] = true);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log("Файл состояния батча не найден, создается новый.");
    } else {
      throw new Error(`Ошибка чтения файла состояния ${config.batchStateFile}: ${err.message}`);
    }
  }

  // --- 2. Поиск новых изображений --- 
  const imageFiles = await fs.readdir(config.inputImagesDir);
  const newImageFiles = imageFiles.filter(file => 
    (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.gif')) && 
    !existingFiles[file]
  );

  if (Object.keys(batchState).length === 0 && newImageFiles.length === 0) {
    console.log("Папка input_images пуста и нет существующего батча для обработки. Завершение.");
    // Создаем пустой файл состояния, чтобы run_pipeline понял, что батч завершен
    await fs.writeFile(config.batchStateFile, JSON.stringify({}), 'utf8'); 
    return; 
  }

  console.log(`Найдено новых изображений для обработки: ${newImageFiles.length}`);
  newImageFiles.forEach(file => {
    batchState[file] = { // Инициализируем новые файлы
      image_filename: file,
      image_upload_status: 'pending',
      image_cid: null,
      json_upload_status: 'pending',
      json_cid: null,
      final_uri: null,
      last_error: null,
      copies: Array(config.copiesPerNft).fill({ status: 'pending', error: null, signature: null })
    };
  });

  // --- 3. Обработка каждого файла в батче --- 
  let consecutive_failures = 0;
  const filesToProcess = Object.keys(batchState);

  for (const imageFilename of filesToProcess) {
    const fileState = batchState[imageFilename];
    const imagePath = path.join(config.inputImagesDir, imageFilename);
    let currentOperationFailed = false;

    console.log(`\n[Обработка] Файл: ${imageFilename}`);

    try {
      // --- 3.1 Загрузка изображения (если нужно) ---
      if (fileState.image_upload_status !== 'success') {
        console.log("  Этап: Загрузка изображения...");
        try {
          // Передаем currentBatchId в uploadToPinata
          fileState.image_cid = await uploadToPinata(imagePath, imageFilename, currentBatchId);
          fileState.image_upload_status = 'success';
          fileState.last_error = null;
          consecutive_failures = 0; // Сброс счетчика ошибок
        } catch (uploadError) {
          fileState.image_upload_status = 'error';
          fileState.last_error = uploadError.message;
          currentOperationFailed = true;
        }
      }

      // --- 3.2 Генерация и Загрузка JSON (если изображение загружено и JSON еще нет) ---
      if (fileState.image_upload_status === 'success' && fileState.json_upload_status !== 'success') {
        console.log("  Этап: Генерация и загрузка JSON метаданных...");
        const nftName = `${config.collectionBaseName} #${imageFilename.split('.')[0]}`; // Пример имени
        const metadata = {
          name: nftName,
          symbol: config.collectionSymbol,
          description: config.collectionDescription,
          seller_fee_basis_points: config.sellerFeeBasisPoints,
          image: `${config.dedicatedPinataGateway}/ipfs/${fileState.image_cid}`,
          attributes: [ 
              // { "trait_type": "Type", "value": "Sticker" }, // Пример атрибутов
          ],
          properties: {
            files: [{ uri: `${config.dedicatedPinataGateway}/ipfs/${fileState.image_cid}`, type: "image/png" }], // Пример
            category: "image",
            // creators: [ { address: "YOUR_WALLET_ADDRESS", share: 100 } ] // Можно добавить создателей
          },
          // external_url: config.externalUrl, // Добавить, если есть
        };
        const jsonFilename = `${imageFilename.split('.')[0]}.json`;
        const tempJsonPath = path.join('.', jsonFilename); // Временный файл

        try {
          await fs.writeFile(tempJsonPath, JSON.stringify(metadata, null, 2), 'utf8');
          // Передаем currentBatchId в uploadToPinata
          fileState.json_cid = await uploadToPinata(tempJsonPath, jsonFilename, currentBatchId);
          fileState.json_upload_status = 'success';
          fileState.final_uri = `${config.dedicatedPinataGateway}/ipfs/${fileState.json_cid}`;
          fileState.last_error = null;
          consecutive_failures = 0; // Сброс счетчика ошибок
          try { await fs.unlink(tempJsonPath); } catch (rmErr) { /* Игнорируем ошибку удаления */ }
        } catch (uploadError) {
          fileState.json_upload_status = 'error';
          fileState.last_error = uploadError.message;
          currentOperationFailed = true;
          try { await fs.unlink(tempJsonPath); } catch (rmErr) { /* Игнорируем ошибку удаления */ }
        }
      }

      // --- 3.3 Обновление состояния в файле --- 
      // Сохраняем после КАЖДОГО файла для надежности
      await fs.writeFile(config.batchStateFile, JSON.stringify(batchState, null, 2), 'utf8');

      // --- 3.4 Проверка на последовательные ошибки ---
      if (currentOperationFailed) {
          consecutive_failures++;
          console.warn(`  [Внимание] Операция для ${imageFilename} завершилась с ошибкой. Последовательных неудач: ${consecutive_failures}`);
          if (consecutive_failures >= config.consecutiveFailureLimit) {
            throw new Error(`Критическая ошибка: ${config.consecutiveFailureLimit} последовательных неудач на этапе подготовки. Остановка.`);
          }
      }

    } catch (criticalError) {
      // Критическая ошибка (например, лимит неудач или ошибка записи состояния)
      console.error("\n--- КРИТИЧЕСКАЯ ОШИБКА НА ЭТАПЕ ПОДГОТОВКИ ---");
      console.error(criticalError.message);
      console.error("Файл состояния может быть неполным. Проверьте логи и файл состояния.");
      // Перевыбрасываем ошибку, чтобы run_pipeline ее поймал
      throw criticalError; 
    }
  }

  // --- 4. Финальная проверка и архивация --- 
  const allPrepared = Object.values(batchState).every(
    state => state.image_upload_status === 'success' && state.json_upload_status === 'success'
  );
  const someFailed = Object.values(batchState).some(
    state => state.image_upload_status === 'error' || state.json_upload_status === 'error'
  );

  if (someFailed) {
     console.warn(`\n[Внимание] Этап подготовки завершен, но НЕ ВСЕ файлы удалось обработать.`);
     console.warn(`Проверьте файл состояния ${config.batchStateFile} для деталей.`);
     console.warn(`Минтинг будет запущен только для успешно подготовленных файлов.`);
  }

  // Архивируем обработанные картинки в любом случае (успех или ошибка подготовки)
  console.log("\nАрхивация обработанных изображений...");
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveImagesDir = path.join(config.archiveBaseDir, 'images', timestamp);
  await fs.mkdir(archiveImagesDir, { recursive: true });

  for (const imageFilename of filesToProcess) {
      // Архивируем только те, которые мы ПЫТАЛИСЬ обработать в этом запуске
      const sourcePath = path.join(config.inputImagesDir, imageFilename);
      const destPath = path.join(archiveImagesDir, imageFilename);
      try {
          await fs.rename(sourcePath, destPath);
          console.log(`  ${imageFilename} -> ${archiveImagesDir}`);
      } catch (moveError) {
          // Если файла уже нет (например, был перемещен при предыдущем падении), игнорируем
          if (moveError.code !== 'ENOENT') {
              console.warn(`  Не удалось архивировать ${imageFilename}: ${moveError.message}`);
          }
      }
  }

  console.log("--- Этап подготовки батча завершен --- ");

}

prepareBatch().catch(error => {
  // Ловим финальные необработанные ошибки (в основном, критические)
  console.error("\n--- Непредвиденная ошибка остановила этап подготовки --- ");
  // console.error(error); // Можно раскомментировать для полного стека
  process.exit(1); // Выход с кодом ошибки
}); 