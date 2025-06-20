// run_pipeline.js
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
const config = require('./config');

function runScript(scriptPath) {
  console.log(`\n--- Запуск скрипта: ${scriptPath} ---`);
  try {
    // Используем stdio: 'inherit', чтобы видеть вывод дочернего скрипта в реальном времени
    execSync(`node ${scriptPath}`, { stdio: 'inherit' });
    console.log(`--- Скрипт ${scriptPath} успешно завершен ---`);
    return true; // Успех
  } catch (error) {
    // Ошибки из дочерних скриптов (которые используют process.exit(1)) будут пойманы здесь
    console.error(`\n--- ОШИБКА при выполнении ${scriptPath} ---`);
    // Сообщение об ошибке уже должно быть выведено дочерним процессом
    // console.error(error); // Можно раскомментировать для деталей, но обычно избыточно
    return false; // Неудача
  }
}

async function archiveBatchState() {
  try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archiveBatchesDir = path.join(config.archiveBaseDir, 'batches');
      await fs.mkdir(archiveBatchesDir, { recursive: true });
      const archivePath = path.join(archiveBatchesDir, `batch_${timestamp}.json`);
      await fs.rename(config.batchStateFile, archivePath);
      console.log(`[Архивация] Файл состояния батча перемещен в: ${archivePath}`);
  } catch (err) {
      if (err.code === 'ENOENT') {
          console.log("[Архивация] Файл состояния батча не найден для архивации (возможно, батч был пуст).");
      } else {
          console.error(`[Архивация] Не удалось архивировать файл состояния ${config.batchStateFile}: ${err.message}`);
      }
  }
}

async function mainPipeline() {
  let resumeMode = false;

  // 1. Проверка наличия незавершенного батча
  try {
    await fs.access(config.batchStateFile); // Проверяем существование файла
    const answer = await new Promise(resolve => {
        readline.question(`Найден файл состояния предыдущего батча (${config.batchStateFile}).\nХотите попробовать ПРОДОЛЖИТЬ его обработку? (y/n): `, resolve);
    });
    readline.close(); // Важно закрыть интерфейс readline

    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      console.log("Режим возобновления активирован.");
      resumeMode = true;
    } else {
      console.log("Запуск нового батча. Старый файл состояния будет заархивирован.");
      await archiveBatchState();
      resumeMode = false;
    }
  } catch (err) {
    // Файла нет, значит начинаем новый батч
    if (err.code === 'ENOENT') {
      console.log("Незавершенный батч не найден. Запуск нового батча.");
      resumeMode = false;
    } else {
      console.error(`Ошибка доступа к файлу состояния ${config.batchStateFile}: ${err.message}`);
      return; // Выход при ошибке доступа
    }
    readline.close(); // Закрыть readline, если он был создан до ошибки
  }

  // 2. Проверка папки с картинками (только если не режим возобновления)
  if (!resumeMode) {
      try {
          const imageFiles = await fs.readdir(config.inputImagesDir);
          const images = imageFiles.filter(file => file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.gif'));
          if (images.length === 0) {
              console.error(`\nОШИБКА: Папка ${config.inputImagesDir} пуста. Нет изображений для нового батча.`);
              return; // Выход
          }
          console.log(`[Проверка] Найдено изображений для нового батча: ${images.length}`);
      } catch (err) {
          console.error(`\nОШИБКА: Не удалось прочитать папку ${config.inputImagesDir}: ${err.message}`);
          console.error("Убедитесь, что папка существует и у вас есть права на чтение.");
          return; // Выход
      }
  }

  // 3. Запуск этапа подготовки (пропускается, если возобновляем)
  let prepareSuccess = true;
  if (!resumeMode) {
      prepareSuccess = runScript('prepare_batch.js');
  }

  // 4. Запуск этапа минтинга (только если подготовка прошла успешно или возобновляем)
  let mintSuccess = false;
  if (prepareSuccess) {
      mintSuccess = runScript('mint_nft_stable.js');
  }

  // 5. Финальная проверка и архивация состояния
  if (prepareSuccess && mintSuccess) {
      console.log("\n--- Пайплайн успешно завершен --- ");
      console.log("Архивация файла состояния завершенного батча...");
      await archiveBatchState();
  } else {
      console.error("\n--- Пайплайн завершился с ошибками --- ");
      if (!prepareSuccess) {
          console.error("Ошибка произошла на этапе ПОДГОТОВКИ батча.");
          console.error(`Проверьте логи выше и файл ${config.batchStateFile} (если он был создан).`);
      } else { // !mintSuccess
          console.error("Ошибка произошла на этапе МИНТИНГА.");
          console.error(`Проверьте логи выше и файл состояния ${config.batchStateFile} для деталей.`);
          console.error("Вы можете исправить проблему и запустить 'node run_pipeline.js' снова, чтобы возобновить минтинг.");
      }
  }
}

mainPipeline(); 