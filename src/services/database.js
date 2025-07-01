const { createClient } = require('@supabase/supabase-js');

class DatabaseService {
  constructor() {
    this.supabase = null;
    this.isConnected = false;
    this.initializeSupabase();
  }

  // Инициализация Supabase клиента
  async initializeSupabase() {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        console.log('[Database Service] Supabase credentials не найдены, используется память');
        return;
      }
      
      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.isConnected = true;
      console.log('[Database Service] ✅ Supabase инициализирован');
      
    } catch (error) {
      console.log('[Database Service] Ошибка инициализации Supabase:', error.message);
      console.log('[Database Service] Работаем в memory-режиме');
    }
  }

  // Сохранение операции минтинга
  async saveMintOperation(operation) {
    try {
      if (!this.isConnected) {
        return this.mockSaveMintOperation(operation);
      }

      const { data, error } = await this.supabase
        .from('mint_operations')
        .insert([{
          operation_id: operation.id,
          type: operation.type,
          status: operation.status,
          collection_id: operation.collectionId,
          collection_name: operation.collection?.name,
          recipient: operation.recipient,
          metadata: operation.metadata,
          total_items: operation.totalItems || 1,
          created_at: operation.createdAt || new Date().toISOString()
        }]);

      if (error) {
        console.error('[Database Service] Ошибка сохранения операции:', error.message);
        return this.mockSaveMintOperation(operation);
      }

      return { success: true, data };
      
    } catch (error) {
      console.error('[Database Service] Исключение при сохранении операции:', error.message);
      return this.mockSaveMintOperation(operation);
    }
  }

  // Обновление операции минтинга
  async updateMintOperation(operationId, updates) {
    try {
      if (!this.isConnected) {
        return this.mockUpdateMintOperation(operationId, updates);
      }

      const updateData = {
        status: updates.status,
        processed_items: updates.processedItems,
        successful_items: updates.successfulItems,
        failed_items: updates.failedItems,
        completed_at: updates.completedAt,
        error_message: updates.error,
        updated_at: new Date().toISOString()
      };

      // Убираем undefined значения
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      const { data, error } = await this.supabase
        .from('mint_operations')
        .update(updateData)
        .eq('operation_id', operationId);

      if (error) {
        console.error('[Database Service] Ошибка обновления операции:', error.message);
        return this.mockUpdateMintOperation(operationId, updates);
      }

      return { success: true, data };
      
    } catch (error) {
      console.error('[Database Service] Исключение при обновлении операции:', error.message);
      return this.mockUpdateMintOperation(operationId, updates);
    }
  }

  // Получение операции по ID
  async getMintOperation(operationId) {
    try {
      if (!this.isConnected) {
        return this.mockGetMintOperation(operationId);
      }

      const { data, error } = await this.supabase
        .from('mint_operations')
        .select('*')
        .eq('operation_id', operationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { success: false, error: 'Operation not found' };
        }
        console.error('[Database Service] Ошибка получения операции:', error.message);
        return this.mockGetMintOperation(operationId);
      }

      return { success: true, data: this.transformOperationFromDB(data) };
      
    } catch (error) {
      console.error('[Database Service] Исключение при получении операции:', error.message);
      return this.mockGetMintOperation(operationId);
    }
  }

  // Получение списка операций с фильтрацией
  async getMintOperations(filters = {}) {
    try {
      if (!this.isConnected) {
        return this.mockGetMintOperations(filters);
      }

      let query = this.supabase
        .from('mint_operations')
        .select('*');

      // Применяем фильтры
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      
      if (filters.type) {
        query = query.eq('type', filters.type);
      }
      
      if (filters.collectionId) {
        query = query.eq('collection_id', filters.collectionId);
      }

      // Сортировка и лимиты
      query = query.order('created_at', { ascending: false });
      
      if (filters.limit) {
        query = query.limit(filters.limit);
      }
      
      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('[Database Service] Ошибка получения операций:', error);
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: data.map(op => this.transformOperationFromDB(op)),
        total: count
      };
      
    } catch (error) {
      console.error('[Database Service] Исключение при получении операций:', error);
      return this.mockGetMintOperations(filters);
    }
  }

  // Сохранение статистики коллекции
  async updateCollectionStats(collectionId, mintedCount) {
    try {
      if (!this.isConnected) {
        return this.mockUpdateCollectionStats(collectionId, mintedCount);
      }

      // Обновляем поле minted в таблице nft_collections
      const { data, error } = await this.supabase
        .from('nft_collections')
        .update({
          minted: mintedCount,
          updated_at: new Date().toISOString()
        })
        .eq('id', collectionId); // используем originalId (UUID) для поиска

      if (error) {
        console.error('[Database Service] Ошибка обновления статистики:', error);
        return { success: false, error: error.message };
      }

      console.log(`[Database Service] ✅ Обновлена статистика минтинга: коллекция ${collectionId}, заминчено ${mintedCount}`);
      return { success: true, data };
      
    } catch (error) {
      console.error('[Database Service] Исключение при обновлении статистики:', error);
      return this.mockUpdateCollectionStats(collectionId, mintedCount);
    }
  }

  // Логирование событий
  async logEvent(event) {
    try {
      if (!this.isConnected) {
        return this.mockLogEvent(event);
      }

      const { data, error } = await this.supabase
        .from('event_logs')
        .insert([{
          event_type: event.type,
          event_data: event.data,
          user_id: event.userId || null,
          ip_address: event.ipAddress || null,
          user_agent: event.userAgent || null,
          created_at: new Date().toISOString()
        }]);

      if (error) {
        console.error('[Database Service] Ошибка логирования:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
      
    } catch (error) {
      console.error('[Database Service] Исключение при логировании:', error);
      return this.mockLogEvent(event);
    }
  }

  // Загрузка коллекций из Supabase
  async getCollectionsFromDatabase() {
    try {
      if (!this.isConnected) {
        console.log('[Database Service] Supabase не подключен, возвращаю пустой список коллекций');
        return { success: false, data: [], error: 'Database not connected' };
      }

      const { data, error } = await this.supabase
        .from('nft_collections')
        .select('*')
        .eq('is_public', true);

      if (error) {
        console.error('[Database Service] Ошибка загрузки коллекций:', error);
        return { success: false, data: [], error: error.message };
      }

      // Трансформируем данные из Supabase формата в Backend формат
      const transformedCollections = data.map(collection => this.transformCollectionFromDB(collection));

      console.log(`[Database Service] ✅ Загружено ${transformedCollections.length} коллекций из Supabase`);
      
      return {
        success: true,
        data: transformedCollections
      };
      
    } catch (error) {
      console.error('[Database Service] Исключение при загрузке коллекций:', error);
      return { success: false, data: [], error: error.message };
    }
  }

  // Проверка статуса сервиса
  getServiceStatus() {
    return {
      connected: this.isConnected,
      provider: this.isConnected ? 'Supabase' : 'Memory Storage',
      tables: this.isConnected ? ['mint_operations', 'collection_stats', 'event_logs'] : []
    };
  }

  // Трансформация данных из БД в формат приложения
  transformOperationFromDB(dbOperation) {
    return {
      id: dbOperation.operation_id,
      type: dbOperation.type,
      status: dbOperation.status,
      collectionId: dbOperation.collection_id,
      collection: {
        name: dbOperation.collection_name
      },
      recipient: dbOperation.recipient,
      metadata: dbOperation.metadata,
      totalItems: dbOperation.total_items,
      processedItems: dbOperation.processed_items,
      successfulItems: dbOperation.successful_items,
      failedItems: dbOperation.failed_items,
      createdAt: dbOperation.created_at,
      completedAt: dbOperation.completed_at,
      error: dbOperation.error_message
    };
  }

  // Трансформация коллекции из Supabase формата в Backend формат
  transformCollectionFromDB(dbCollection) {
    return {
      id: dbCollection.id, // Используем UUID как основной ID для совместимости с Frontend
      name: dbCollection.name,
      symbol: dbCollection.symbol,
      description: dbCollection.description || '',
      treeAddress: dbCollection.tree_address || '',
      collectionAddress: dbCollection.collection_address || '',
      status: dbCollection.status || 'active',
      allowMinting: dbCollection.allow_minting || false,
      totalMinted: dbCollection.minted || 0,
      maxSupply: dbCollection.capacity || 10000,
      createdAt: dbCollection.created_at || new Date().toISOString(),
      updatedAt: dbCollection.updated_at || new Date().toISOString(),
      metadata: {
        image: dbCollection.image_url || '',
        externalUrl: dbCollection.external_url || '',
        sellerFeeBasisPoints: 0 // дефолтное значение, можно добавить поле в Supabase
      },
      // Дополнительные поля из Supabase для полноты
      hasValidTree: dbCollection.has_valid_tree || false,
      supportsDas: dbCollection.supports_das || false,
      rpcUsed: dbCollection.rpc_used || '',
      depth: dbCollection.depth || 20,
      bufferSize: dbCollection.buffer_size || 64
    };
  }

  // Мок-функции для работы без БД

  mockSaveMintOperation(operation) {
    console.log('[Database Service] Mock: Сохранена операция', operation.id);
    return { success: true, mock: true };
  }

  mockUpdateMintOperation(operationId, updates) {
    console.log('[Database Service] Mock: Обновлена операция', operationId);
    return { success: true, mock: true };
  }

  mockGetMintOperation(operationId) {
    console.log('[Database Service] Mock: Запрошена операция', operationId);
    return { success: false, error: 'Not found in mock mode' };
  }

  mockGetMintOperations(filters) {
    console.log('[Database Service] Mock: Запрошены операции с фильтрами', filters);
    return { success: true, data: [], total: 0, mock: true };
  }

  mockUpdateCollectionStats(collectionId, mintedCount) {
    console.log('[Database Service] Mock: Обновлена статистика коллекции', collectionId, mintedCount);
    return { success: true, mock: true };
  }

  mockLogEvent(event) {
    console.log('[Database Service] Mock: Событие', event.type, event.data);
    return { success: true, mock: true };
  }

  // Создать новую коллекцию в Supabase
  async createCollectionInDatabase(collectionData) {
    if (!this.supabase) {
      console.log('[Database Service] Supabase недоступен, используем мок создание коллекции');
      return this.mockCreateCollection(collectionData);
    }

    try {
      const dbData = {
        id: collectionData.id,
        name: collectionData.name,
        symbol: collectionData.symbol,
        description: collectionData.description || '',
        tree_address: collectionData.treeAddress || '',
        collection_address: collectionData.collectionAddress || '',
        status: collectionData.status || 'draft',
        allow_minting: collectionData.allowMinting || false,
        minted: collectionData.totalMinted || 0,
        capacity: collectionData.maxSupply || 10000,
        image_url: collectionData.metadata?.image || '',
        external_url: collectionData.metadata?.externalUrl || '',
        created_at: collectionData.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('nft_collections')
        .insert([dbData])
        .select()
        .single();

      if (error) {
        console.error('[Database Service] Ошибка создания коллекции в Supabase:', error);
        return this.mockCreateCollection(collectionData);
      }

      console.log(`[Database Service] ✅ Коллекция ${collectionData.name} создана в Supabase`);
      return this.transformCollectionFromDB(data);

    } catch (error) {
      console.error('[Database Service] Ошибка создания коллекции:', error);
      return this.mockCreateCollection(collectionData);
    }
  }

  // Обновить коллекцию в Supabase
  async updateCollectionInDatabase(collectionId, updates) {
    if (!this.supabase) {
      console.log('[Database Service] Supabase недоступен, используем мок обновление коллекции');
      return this.mockUpdateCollection(collectionId, updates);
    }

    try {
      const dbUpdates = {
        updated_at: new Date().toISOString()
      };

      // Маппинг полей из Backend формата в Supabase формат
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.symbol !== undefined) dbUpdates.symbol = updates.symbol;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.treeAddress !== undefined) dbUpdates.tree_address = updates.treeAddress;
      if (updates.collectionAddress !== undefined) dbUpdates.collection_address = updates.collectionAddress;
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.allowMinting !== undefined) dbUpdates.allow_minting = updates.allowMinting;
      if (updates.totalMinted !== undefined) dbUpdates.minted = updates.totalMinted;
      if (updates.maxSupply !== undefined) dbUpdates.capacity = updates.maxSupply;
      if (updates.metadata?.image !== undefined) dbUpdates.image_url = updates.metadata.image;
      if (updates.metadata?.externalUrl !== undefined) dbUpdates.external_url = updates.metadata.externalUrl;

      const { data, error } = await this.supabase
        .from('nft_collections')
        .update(dbUpdates)
        .eq('id', collectionId)
        .select()
        .single();

      if (error) {
        console.error('[Database Service] Ошибка обновления коллекции в Supabase:', error);
        return this.mockUpdateCollection(collectionId, updates);
      }

      console.log(`[Database Service] ✅ Коллекция ${collectionId} обновлена в Supabase`);
      return this.transformCollectionFromDB(data);

    } catch (error) {
      console.error('[Database Service] Ошибка обновления коллекции:', error);
      return this.mockUpdateCollection(collectionId, updates);
    }
  }

  // 🔧 Мок-методы для fallback (когда Supabase недоступен)
  
  // Мок создания коллекции
  mockCreateCollection(collectionData) {
    console.log(`[Database Service] Мок: создание коллекции ${collectionData.name}`);
    
    // Генерируем UUID если не передан
    const id = collectionData.id || require('crypto').randomUUID();
    
    const mockCollection = {
      ...collectionData,
      id,
      createdAt: collectionData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    return mockCollection;
  }

  // Мок обновления коллекции  
  mockUpdateCollection(collectionId, updates) {
    console.log(`[Database Service] Мок: обновление коллекции ${collectionId}`);
    
    // В мок-режиме просто возвращаем обновленные данные
    // В реальной ситуации здесь бы был поиск в локальном кеше
    return {
      id: collectionId,
      ...updates,
      updatedAt: new Date().toISOString()
    };
  }
}

module.exports = DatabaseService; 