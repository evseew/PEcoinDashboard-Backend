// services/collections.js
// Сервис для управления коллекциями NFT

const DatabaseService = require('./database');

class CollectionsService {
  constructor() {
    this.collections = new Map();
    this.isInitialized = false;
    this.database = null;
    
    // Инициализируем коллекции из Supabase
    this.initializeCollections().catch(error => {
      console.error('[Collections Service] Ошибка инициализации коллекций:', error);
    });
  }

  // Инициализация коллекций из Supabase
  async initializeCollections() {
    try {
      this.database = new DatabaseService();
      
      console.log('[Collections Service] Загружаем коллекции из Supabase...');
      const supabaseCollections = await this.database.getCollectionsFromDatabase();
      
      if (supabaseCollections && supabaseCollections.length > 0) {
        // Загружаем данные из Supabase
        supabaseCollections.forEach(collection => {
          this.collections.set(collection.id, collection);
        });
        console.log(`[Collections Service] ✅ Загружено ${supabaseCollections.length} коллекций из Supabase`);
      } else {
        console.log('[Collections Service] ⚠️ Коллекции из Supabase не найдены, используем пустой набор');
      }
      
    } catch (error) {
      console.error('[Collections Service] Ошибка загрузки из Supabase:', error);
      console.log('[Collections Service] 📄 Используем пустой набор коллекций');
    } finally {
      this.isInitialized = true;
    }
  }

  // Проверка готовности сервиса
  async waitForInitialization() {
    if (this.isInitialized) return;
    
    // Ждем инициализации максимум 10 секунд
    let attempts = 0;
    while (!this.isInitialized && attempts < 100) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!this.isInitialized) {
      console.warn('[Collections Service] Таймаут инициализации, используются текущие данные');
    }
  }

  // Получить все коллекции с фильтрацией
  async getCollections(filters = {}) {
    await this.waitForInitialization();
    
    const { status, allowMinting, limit = 50, offset = 0 } = filters;
    
    let collections = Array.from(this.collections.values());
    
    // Фильтры
    if (status) {
      collections = collections.filter(c => c.status === status);
    }
    
    if (allowMinting !== undefined) {
      collections = collections.filter(c => c.allowMinting === allowMinting);
    }
    
    // Сортировка по дате создания
    collections.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Пагинация
    const total = collections.length;
    collections = collections.slice(offset, offset + limit);
    
    return {
      collections,
      pagination: {
        total,
        limit,
        offset,
        hasMore: (offset + limit) < total
      }
    };
  }

  // Получить коллекцию по ID
  async getCollection(id) {
    await this.waitForInitialization();
    return this.collections.get(id) || null;
  }

  // Получить активные коллекции для минтинга
  async getActiveCollections() {
    await this.waitForInitialization();
    return Array.from(this.collections.values())
      .filter(c => c.status === 'active' && c.allowMinting);
  }

  // Проверить возможность минтинга в коллекции
  async canMintInCollection(collectionId) {
    await this.waitForInitialization();
    
    const collection = await this.getCollection(collectionId);
    
    if (!collection) {
      return { canMint: false, reason: 'Коллекция не найдена' };
    }
    
    if (collection.status !== 'active') {
      return { canMint: false, reason: 'Коллекция неактивна' };
    }
    
    if (!collection.allowMinting) {
      return { canMint: false, reason: 'Минтинг заблокирован' };
    }
    
    if (!collection.treeAddress || !collection.collectionAddress) {
      return { canMint: false, reason: 'Не настроены адреса блокчейна' };
    }
    
    if (collection.maxSupply && collection.totalMinted >= collection.maxSupply) {
      return { canMint: false, reason: 'Достигнут максимальный supply' };
    }
    
    return { canMint: true };
  }

  // Обновить статистику минтинга
  async updateMintStats(collectionId, mintedCount) {
    await this.waitForInitialization();
    
    const collection = this.collections.get(collectionId);
    if (collection) {
      // Обновляем локальные данные
      collection.totalMinted += mintedCount;
      collection.updatedAt = new Date().toISOString();
      this.collections.set(collectionId, collection);
      
      // Синхронизируем с Supabase если доступен
      try {
        // Используем collectionId (который теперь UUID) для обновления Supabase
        await this.database.updateCollectionStats(collectionId, collection.totalMinted);
        console.log(`[Collections Service] ✅ Статистика коллекции ${collectionId} синхронизирована с Supabase`);
      } catch (error) {
        console.error(`[Collections Service] Ошибка синхронизации статистики для ${collectionId}:`, error);
        // Продолжаем работу даже если синхронизация не удалась
      }
    }
  }

  // Создать новую коллекцию (базовая структура)
  async createCollection(data) {
    await this.waitForInitialization();
    
    const id = data.id || data.name.toLowerCase().replace(/\s+/g, '-');
    
    const collection = {
      id,
      name: data.name,
      symbol: data.symbol,
      description: data.description || '',
      treeAddress: data.treeAddress || '',
      collectionAddress: data.collectionAddress || '',
      status: 'draft',
      allowMinting: false,
      totalMinted: 0,
      maxSupply: data.maxSupply || 10000,
      createdAt: new Date().toISOString(),
      metadata: {
        image: data.image || '',
        externalUrl: data.externalUrl || '',
        sellerFeeBasisPoints: data.sellerFeeBasisPoints || 0
      }
    };
    
    // Сохраняем коллекцию в Supabase
    try {
      const savedCollection = await this.database.createCollectionInDatabase(collection);
      // Обновляем локальные данные с данными из Supabase (может содержать изменения)
      this.collections.set(savedCollection.id, savedCollection);
      return savedCollection;
    } catch (error) {
      console.error('[Collections Service] Ошибка создания коллекции в Supabase:', error);
      // Сохраняем локально как fallback
      this.collections.set(id, collection);
      return collection;
    }
  }

  // Обновить коллекцию
  async updateCollection(id, updates) {
    await this.waitForInitialization();
    
    const collection = this.collections.get(id);
    if (!collection) return null;
    
    const updatedCollection = {
      ...collection,
      ...updates,
      id, // ID нельзя менять
      updatedAt: new Date().toISOString()
    };
    
    // Обновляем коллекцию в Supabase
    try {
      const savedCollection = await this.database.updateCollectionInDatabase(id, updates);
      // Обновляем локальные данные с данными из Supabase
      this.collections.set(id, savedCollection);
      return savedCollection;
    } catch (error) {
      console.error('[Collections Service] Ошибка обновления коллекции в Supabase:', error);
      // Обновляем локально как fallback
      this.collections.set(id, updatedCollection);
      return updatedCollection;
    }
  }

  // Валидация данных коллекции для минтинга
  validateCollectionForMinting(collection) {
    const errors = [];
    
    if (!collection.treeAddress) {
      errors.push('Отсутствует Tree Address');
    }
    
    if (!collection.collectionAddress) {
      errors.push('Отсутствует Collection Address');
    }
    
    if (!collection.name) {
      errors.push('Отсутствует название коллекции');
    }
    
    if (!collection.symbol) {
      errors.push('Отсутствует символ коллекции');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = CollectionsService; 