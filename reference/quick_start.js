#!/usr/bin/env node

// quick_start.js
// Быстрый старт для системы множественных коллекций

const CollectionManager = require('./collection_manager');
const collectionsConfig = require('./collections_config');

async function quickStart() {
  console.log("\n🚀 === БЫСТРЫЙ СТАРТ СИСТЕМЫ КОЛЛЕКЦИЙ ===\n");
  
  const manager = new CollectionManager();
  
  try {
    // 1. Инициализация структуры
    console.log("📁 Этап 1: Инициализация структуры папок...");
    await manager.initializeStructure();
    console.log("✅ Структура папок создана!\n");
    
    // 2. Показ доступных коллекций
    console.log("📋 Этап 2: Доступные коллекции в конфигурации:");
    const collections = collectionsConfig.getAvailableCollections();
    collections.forEach((collection, index) => {
      console.log(`   ${index + 1}. ${collection.name} (${collection.id})`);
      console.log(`      Описание: ${collection.description}`);
    });
    console.log("");
    
    // 3. Демонстрация конфигурации первой коллекции
    console.log("⚙️  Этап 3: Пример конфигурации коллекции:");
    const exampleConfig = collectionsConfig.getCollectionConfig('pe_stickers');
    console.log(`   Название: ${exampleConfig.name}`);
    console.log(`   Символ: ${exampleConfig.collectionSymbol}`);
    console.log(`   Копий на NFT: ${exampleConfig.copiesPerNft}`);
    console.log(`   Роялти: ${exampleConfig.sellerFeeBasisPoints / 100}%`);
    console.log(`   Получатель: ${exampleConfig.receiverAddress}`);
    console.log(`   Тип подписи: ${exampleConfig.signerConfig.type}`);
    console.log("");
    
    // 4. Проверка статуса коллекций
    console.log("📊 Этап 4: Текущий статус коллекций:");
    const status = await manager.getCollectionsStatus();
    
    console.log("\n┌─────────────────────────┬─────────┬────────┬──────────────┐");
    console.log("│ Коллекция               │ Создана │ Дерево │ Активный батч│");
    console.log("├─────────────────────────┼─────────┼────────┼──────────────┤");
    
    status.forEach(collection => {
      const created = collection.collectionExists ? "✅" : "❌";
      const tree = collection.treeExists ? "✅" : "❌"; 
      const batch = collection.hasActiveBatch ? "🔄" : "⚪";
      
      const name = collection.name.length > 23 ? collection.name.substring(0, 20) + "..." : collection.name;
      console.log(`│ ${name.padEnd(23)} │ ${created.padEnd(6)} │ ${tree.padEnd(5)} │ ${batch.padEnd(12)} │`);
    });
    console.log("└─────────────────────────┴─────────┴────────┴──────────────┘");
    
    console.log("\nЛегенда:");
    console.log("✅ - Готово  ❌ - Не создано  🔄 - Активный батч  ⚪ - Готово к работе");
    
    // 5. Следующие шаги
    console.log("\n🎯 СЛЕДУЮЩИЕ ШАГИ:");
    console.log("1. Настройте переменные окружения в файле .env");
    console.log("2. Для создания коллекций: node multi_collection_cli.js");
    console.log("3. Поместите изображения в папки collections/{id}/input_images/");
    console.log("4. Создайте дерево Меркла для каждой коллекции");
    console.log("5. Запустите минтинг через CLI интерфейс");
    
    console.log("\n📖 Подробную информацию смотрите в MULTI_COLLECTION_GUIDE.md");
    
    // 6. Проверка .env
    console.log("\n🔍 Проверка переменных окружения:");
    const envChecks = [
      { name: 'PRIVATE_KEY', required: true },
      { name: 'CATS_PRIVATE_KEY', required: false },
      { name: 'PIXEL_PRIVATE_KEY', required: false },
      { name: 'MAIN_RPC_URL', required: false },
    ];
    
    envChecks.forEach(check => {
      const exists = !!process.env[check.name];
      const status = exists ? "✅" : (check.required ? "❌" : "⚠️");
      const suffix = check.required ? " (обязательная)" : " (опциональная)";
      console.log(`   ${status} ${check.name}${suffix}`);
    });
    
    if (!process.env.PRIVATE_KEY) {
      console.log("\n⚠️  ВНИМАНИЕ: Не найдена переменная PRIVATE_KEY!");
      console.log("   Создайте файл .env и добавьте ваш приватный ключ");
      console.log("   Пример: PRIVATE_KEY=ваш_base58_ключ");
    }
    
  } catch (error) {
    console.error("\n❌ Ошибка инициализации:", error.message);
    console.log("\nПроверьте:");
    console.log("1. Права доступа к папкам");
    console.log("2. Корректность конфигурации");
    console.log("3. Наличие необходимых зависимостей");
  }
  
  console.log("\n🎨 === БЫСТРЫЙ СТАРТ ЗАВЕРШЕН ===");
}

// Запуск если файл вызван напрямую
if (require.main === module) {
  quickStart().catch(error => {
    console.error("Критическая ошибка:", error);
    process.exit(1);
  });
}

module.exports = quickStart; 