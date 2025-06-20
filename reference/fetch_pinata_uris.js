// fetch_pinata_uris.js
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const pinataApiKey = process.env.PINATA_API_KEY;
const pinataSecretApiKey = process.env.PINATA_SECRET_KEY;
const pinataBaseUrl = 'https://api.pinata.cloud';
const pinataPinListEndpoint = '/data/pinList';
const outputFileName = 'uris.txt';
const pinataGateway = 'https://gateway.pinata.cloud/ipfs/'; // Можешь заменить на свой шлюз, если нужно
const pageLimit = 100; // Сколько файлов запрашивать за раз

async function fetchJsonUrisFromPinata() {
  console.log('--- Получение URI метаданных (.json) с Pinata (с пагинацией) ---');

  if (!pinataApiKey || !pinataSecretApiKey) {
    console.error('Ошибка: PINATA_API_KEY или PINATA_SECRET_KEY не найдены в файле .env');
    console.error('Пожалуйста, добавьте ваши ключи Pinata API в файл .env');
    return;
  }

  let allJsonFiles = [];
  let pageOffset = 0;
  let totalProcessed = 0;
  let totalCount = 0; // Общее количество файлов по данным API

  try {
    console.log('Запрос файлов с Pinata постранично...');

    do {
      console.log(`Запрашиваем страницу: лимит=${pageLimit}, смещение=${pageOffset}`);
      // Формируем URL с параметрами пагинации
      const url = new URL(`${pinataBaseUrl}${pinataPinListEndpoint}`);
      url.searchParams.append('status', 'pinned');
      url.searchParams.append('pageLimit', pageLimit.toString());
      url.searchParams.append('pageOffset', pageOffset.toString());
      // url.searchParams.append('metadata[name]', '*'); // Можно добавить фильтр по имени, если нужно

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'pinata_api_key': pinataApiKey,
          'pinata_secret_api_key': pinataSecretApiKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Не удалось прочитать тело ошибки' }));
        throw new Error(`Ошибка Pinata API: Статус ${response.status}. ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      totalCount = data.count; // Обновляем общее количество из ответа API
      const currentPageFiles = data.rows || [];
      totalProcessed += currentPageFiles.length;

      console.log(`Получено ${currentPageFiles.length} файлов на этой странице. Всего обработано ${totalProcessed}/${totalCount}`);

      // Фильтруем JSON-файлы на текущей странице
      const jsonFilesInPage = currentPageFiles.filter(item => {
        const originalName = item.metadata?.name || '';
        const ipfsPinHash = item.ipfs_pin_hash || '';
        return originalName.toLowerCase().endsWith('.json') || (ipfsPinHash && !originalName);
      });

      allJsonFiles = allJsonFiles.concat(jsonFilesInPage);
      console.log(`Найдено ${jsonFilesInPage.length} JSON на этой странице. Всего найдено JSON: ${allJsonFiles.length}`);

      // Увеличиваем смещение для следующей страницы
      pageOffset += pageLimit;

      // Продолжаем, пока не обработаем все файлы, указанные в totalCount
    } while (totalProcessed < totalCount && totalCount > 0);

    console.log(`\nЗавершено. Всего найдено ${allJsonFiles.length} файлов, похожих на .json метаданные.`);

    if (allJsonFiles.length === 0) {
      console.log('Не найдено файлов .json на вашем аккаунте Pinata с текущими фильтрами.');
      console.log('Убедитесь, что файлы загружены, закреплены (pinned) и имеют расширение .json в имени или метаданных.');
      return;
    }

    const uris = allJsonFiles.map(item => `${pinataGateway}${item.ipfs_pin_hash}`);

    fs.writeFileSync(outputFileName, uris.join('\n'));
    console.log(`✅ Успешно! ${uris.length} URI сохранены в файл: ${outputFileName}`);

  } catch (error) {
    console.error('\n--- Ошибка при запросе к Pinata API ---');
    console.error(error.message);
    console.error('Убедитесь, что ваши API ключи Pinata верны и активны, и проверьте параметры фильтрации.');
  }
}

// Запуск функции
fetchJsonUrisFromPinata(); 