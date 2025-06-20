#!/usr/bin/env node

// multi_collection_cli.js
// CLI интерфейс для управления множественными коллекциями

const CollectionManager = require('./collection_manager');
const readline = require('readline');

class MultiCollectionCLI {
  constructor() {
    this.manager = new CollectionManager();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async start() {
    console.log("\n🎨 === СИСТЕМА УПРАВЛЕНИЯ КОЛЛЕКЦИЯМИ NFT ===");
    console.log("Добро пожаловать в систему управления множественными коллекциями!");
    
    while (true) {
      const action = await this.showMainMenu();
      
      try {
        switch (action) {
          case '1':
            await this.initializeStructure();
            break;
          case '2':
            await this.createNewCollection();
            break;
          case '3':
            await this.runPipeline();
            break;
          case '4':
            await this.resumePipeline();
            break;
          case '5':
            await this.showStatus();
            break;
          case '6':
            await this.listCollections();
            break;
          case '0':
            console.log("Завершение работы...");
            this.rl.close();
            return;
          default:
            console.log("Неверный выбор. Попробуйте снова.");
        }
      } catch (error) {
        console.error(`\n❌ Ошибка: ${error.message}`);
        console.log("Нажмите Enter для продолжения...");
        await this.waitForEnter();
      }
    }
  }

  async showMainMenu() {
    console.log("\n" + "=".repeat(50));
    console.log("🎯 ГЛАВНОЕ МЕНЮ:");
    console.log("1. 🏗️  Инициализировать структуру коллекций");
    console.log("2. 🆕 Создать новую коллекцию на блокчейне");
    console.log("3. 🚀 Запустить полный пайплайн для коллекции");
    console.log("4. ⏭️  Возобновить прерванный пайплайн");
    console.log("5. 📊 Показать статус всех коллекций");
    console.log("6. 📋 Список доступных коллекций");
    console.log("0. 🚪 Выход");
    console.log("=".repeat(50));
    
    return new Promise(resolve => {
      this.rl.question("Выберите действие: ", resolve);
    });
  }

  async initializeStructure() {
    console.log("\n🏗️ Инициализация структуры папок...");
    await this.manager.initializeStructure();
    console.log("✅ Структура папок создана!");
    await this.waitForEnter();
  }

  async createNewCollection() {
    console.log("\n🆕 Создание новой коллекции на блокчейне");
    
    const collectionId = await this.manager.selectCollectionInteractive();
    if (!collectionId) {
      console.log("❌ Коллекция не выбрана");
      return;
    }

    console.log(`\n⚠️  ВНИМАНИЕ: Будет создана коллекция "${collectionId}" на блокчейне`);
    console.log("Это действие нельзя отменить и оно стоит SOL для газа.");
    
    const confirm = await new Promise(resolve => {
      this.rl.question("Продолжить? (y/N): ", resolve);
    });

    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log("❌ Создание отменено");
      return;
    }

    await this.manager.createCollection(collectionId);
    console.log("✅ Коллекция создана на блокчейне!");
    await this.waitForEnter();
  }

  async runPipeline() {
    console.log("\n🚀 Запуск полного пайплайна");
    
    const collectionId = await this.manager.selectCollectionInteractive();
    if (!collectionId) {
      console.log("❌ Коллекция не выбрана");
      return;
    }

    // Проверка готовности коллекции
    const status = await this.manager.getCollectionsStatus();
    const collectionStatus = status.find(s => s.id === collectionId);
    
    if (!collectionStatus.collectionExists) {
      console.log("❌ Адрес коллекции не найден. Сначала создайте коллекцию на блокчейне.");
      return;
    }

    if (!collectionStatus.treeExists) {
      console.log("❌ Адрес дерева Меркла не найден. Создайте дерево через create_merkle_tree.js");
      return;
    }

    console.log(`\n🎯 Запуск пайплайна для коллекции: ${collectionId}`);
    console.log("Это включает подготовку батча и минтинг всех NFT.");
    
    const confirm = await new Promise(resolve => {
      this.rl.question("Начать процесс? (y/N): ", resolve);
    });

    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log("❌ Запуск отменен");
      return;
    }

    await this.manager.runPipelineForCollection(collectionId, false);
    console.log("✅ Пайплайн завершен!");
    await this.waitForEnter();
  }

  async resumePipeline() {
    console.log("\n⏭️ Возобновление прерванного пайплайна");
    
    const collectionId = await this.manager.selectCollectionInteractive();
    if (!collectionId) {
      console.log("❌ Коллекция не выбрана");
      return;
    }

    // Проверка наличия файла состояния
    const status = await this.manager.getCollectionsStatus();
    const collectionStatus = status.find(s => s.id === collectionId);
    
    if (!collectionStatus.hasActiveBatch) {
      console.log("❌ Активный батч не найден для этой коллекции");
      return;
    }

    console.log(`\n⏭️ Возобновление пайплайна для коллекции: ${collectionId}`);
    console.log("Будет продолжен процесс минтинга с места остановки.");
    
    const confirm = await new Promise(resolve => {
      this.rl.question("Возобновить процесс? (y/N): ", resolve);
    });

    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log("❌ Возобновление отменено");
      return;
    }

    await this.manager.runPipelineForCollection(collectionId, true);
    console.log("✅ Пайплайн завершен!");
    await this.waitForEnter();
  }

  async showStatus() {
    console.log("\n📊 Статус всех коллекций:");
    
    const status = await this.manager.getCollectionsStatus();
    
    console.log("\n" + "=".repeat(80));
    console.log("| Коллекция                | Создана | Дерево | Активный батч | Путь");
    console.log("|" + "-".repeat(78) + "|");
    
    for (const collection of status) {
      const created = collection.collectionExists ? "✅" : "❌";
      const tree = collection.treeExists ? "✅" : "❌";
      const batch = collection.hasActiveBatch ? "🔄" : "⚪";
      
      console.log(`| ${collection.name.padEnd(24)} | ${created.padEnd(6)} | ${tree.padEnd(5)} | ${batch.padEnd(12)} | ${collection.path}`);
    }
    console.log("=".repeat(80));
    
    console.log("\nЛегенда:");
    console.log("✅ - Готово");
    console.log("❌ - Не создано");
    console.log("🔄 - Есть активный батч");
    console.log("⚪ - Нет активного батча");
    
    await this.waitForEnter();
  }

  async listCollections() {
    console.log("\n📋 Доступные коллекции в конфигурации:");
    this.manager.listCollections();
    await this.waitForEnter();
  }

  async waitForEnter() {
    return new Promise(resolve => {
      this.rl.question("\nНажмите Enter для продолжения...", resolve);
    });
  }
}

// Запуск CLI если файл вызван напрямую
if (require.main === module) {
  const cli = new MultiCollectionCLI();
  cli.start().catch(error => {
    console.error("Критическая ошибка CLI:", error);
    process.exit(1);
  });
}

module.exports = MultiCollectionCLI; 