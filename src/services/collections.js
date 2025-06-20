// services/collections.js
// Сервис для управления коллекциями NFT

class CollectionsService {
  constructor() {
    // В продакшене это будет Supabase/DB
    this.collections = new Map();
    this.initMockCollections();
  }

  // Инициализация мок-данных на основе reference
  initMockCollections() {
    // Коллекция из reference/ (рабочая)
    this.collections.set('pe-stickers', {
      id: 'pe-stickers',
      name: 'PE Stickers',
      symbol: 'PES',
      description: 'Коллекция стикеров от PE School',
      treeAddress: 'DKHMY8Nn7xofN73wCiDBLZe3qzVyA2B8X1KCE2zsJRyH',
      collectionAddress: 'F1mKEFsnEz8bm4Ty2mTFrgsCcXmmMroQzRFEzc2s7B8e',
      status: 'active',
      allowMinting: true,
      totalMinted: 0,
      maxSupply: 10000,
      createdAt: '2024-01-15T10:00:00Z',
      metadata: {
        image: 'https://amber-accused-tortoise-973.mypinata.cloud/ipfs/QmPEStickers',
        externalUrl: 'https://pe-school.com/stickers',
        sellerFeeBasisPoints: 0
      }
    });

    // Другие коллекции для примера
    this.collections.set('pe-badges', {
      id: 'pe-badges',
      name: 'PE Achievement Badges',
      symbol: 'PEB',
      description: 'Достижения учеников PE School',
      treeAddress: '', // Будет заполнен при создании
      collectionAddress: '', // Будет заполнен при создании
      status: 'draft',
      allowMinting: false,
      totalMinted: 0,
      maxSupply: 5000,
      createdAt: '2024-01-20T12:00:00Z',
      metadata: {
        sellerFeeBasisPoints: 250 // 2.5%
      }
    });

    this.collections.set('pe-certificates', {
      id: 'pe-certificates',
      name: 'PE Course Certificates',
      symbol: 'PEC',
      description: 'Сертификаты об окончании курсов',
      treeAddress: '', // Пользователь настроит
      collectionAddress: '', // Пользователь настроит
      status: 'pending',
      allowMinting: false,
      totalMinted: 0,
      maxSupply: 1000,
      createdAt: '2024-01-25T14:00:00Z',
      metadata: {
        sellerFeeBasisPoints: 0
      }
    });
  }

  // Получить все коллекции с фильтрацией
  getCollections(filters = {}) {
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
  getCollection(id) {
    return this.collections.get(id) || null;
  }

  // Получить активные коллекции для минтинга
  getActiveCollections() {
    return Array.from(this.collections.values())
      .filter(c => c.status === 'active' && c.allowMinting);
  }

  // Проверить возможность минтинга в коллекции
  canMintInCollection(collectionId) {
    const collection = this.getCollection(collectionId);
    
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
  updateMintStats(collectionId, mintedCount) {
    const collection = this.collections.get(collectionId);
    if (collection) {
      collection.totalMinted += mintedCount;
      this.collections.set(collectionId, collection);
    }
  }

  // Создать новую коллекцию (базовая структура)
  createCollection(data) {
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
    
    this.collections.set(id, collection);
    return collection;
  }

  // Обновить коллекцию
  updateCollection(id, updates) {
    const collection = this.collections.get(id);
    if (!collection) return null;
    
    const updatedCollection = {
      ...collection,
      ...updates,
      id, // ID нельзя менять
      updatedAt: new Date().toISOString()
    };
    
    this.collections.set(id, updatedCollection);
    return updatedCollection;
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