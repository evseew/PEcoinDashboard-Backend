// services/webhook-notifier.js
// ✅ СИСТЕМА WEBHOOK УВЕДОМЛЕНИЙ ДЛЯ DAS СОБЫТИЙ

class WebhookNotifierService {
  constructor() {
    this.webhooks = new Map(); // endpoint -> config
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 секунда
    this.timeout = 10000; // 10 секунд
  }

  // ✅ Регистрация webhook endpoint
  registerWebhook(id, config) {
    const webhook = {
      id,
      url: config.url,
      events: config.events || ['indexingCompleted', 'indexingTimeout', 'indexingError'],
      headers: config.headers || {},
      secret: config.secret,
      active: config.active !== false,
      createdAt: new Date().toISOString()
    };

    this.webhooks.set(id, webhook);
    console.log(`[Webhook Notifier] ✅ Зарегистрирован webhook ${id}: ${webhook.url}`);
    
    return webhook;
  }

  // ✅ Удаление webhook
  unregisterWebhook(id) {
    const removed = this.webhooks.delete(id);
    if (removed) {
      console.log(`[Webhook Notifier] 🗑️ Webhook ${id} удален`);
    }
    return removed;
  }

  // ✅ Отправка уведомления о событии
  async notifyEvent(eventType, data) {
    const activeWebhooks = Array.from(this.webhooks.values())
      .filter(webhook => webhook.active && webhook.events.includes(eventType));

    if (activeWebhooks.length === 0) {
      console.log(`[Webhook Notifier] Нет активных webhooks для события: ${eventType}`);
      return;
    }

    console.log(`[Webhook Notifier] 📡 Отправляем ${eventType} в ${activeWebhooks.length} webhooks`);

    const promises = activeWebhooks.map(webhook => 
      this.sendWebhook(webhook, eventType, data)
    );

    await Promise.allSettled(promises);
  }

  // ✅ Отправка одного webhook с retry логикой
  async sendWebhook(webhook, eventType, data, attempt = 1) {
    try {
      const payload = {
        event: eventType,
        timestamp: new Date().toISOString(),
        data,
        webhook_id: webhook.id
      };

      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'PEcoin-DAS-Indexing-Monitor/1.0',
        ...webhook.headers
      };

      // Добавляем HMAC signature если есть secret
      if (webhook.secret) {
        const signature = this.generateSignature(payload, webhook.secret);
        headers['X-PEcoin-Signature'] = signature;
      }

      console.log(`[Webhook Notifier] 🚀 Отправляем ${eventType} в ${webhook.url} (попытка ${attempt})`);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (response.ok) {
        console.log(`[Webhook Notifier] ✅ Webhook ${webhook.id} успешно доставлен`);
        return { success: true, status: response.status };
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

    } catch (error) {
      console.error(`[Webhook Notifier] ❌ Ошибка webhook ${webhook.id} (попытка ${attempt}):`, error.message);

      // Retry логика
      if (attempt < this.retryAttempts) {
        console.log(`[Webhook Notifier] 🔄 Повторная попытка ${attempt + 1}/${this.retryAttempts} через ${this.retryDelay}ms`);
        
        await this.sleep(this.retryDelay);
        return this.sendWebhook(webhook, eventType, data, attempt + 1);
      } else {
        console.error(`[Webhook Notifier] 💀 Webhook ${webhook.id} окончательно не доставлен после ${this.retryAttempts} попыток`);
        return { success: false, error: error.message };
      }
    }
  }

  // ✅ Генерация HMAC signature для безопасности
  generateSignature(payload, secret) {
    const crypto = require('crypto');
    const payloadString = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
    
    return `sha256=${signature}`;
  }

  // ✅ Sleep utility
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ✅ Тестирование webhook
  async testWebhook(id) {
    const webhook = this.webhooks.get(id);
    if (!webhook) {
      throw new Error(`Webhook ${id} не найден`);
    }

    const testData = {
      operationId: 'test-operation-id',
      assetId: 'test-asset-id',
      message: 'Это тестовое уведомление webhook'
    };

    const result = await this.sendWebhook(webhook, 'test', testData);
    return result;
  }

  // ✅ Получение списка webhooks
  getWebhooks() {
    return Array.from(this.webhooks.values());
  }

  // ✅ Получение статистики webhooks
  getWebhookStats() {
    const webhooks = Array.from(this.webhooks.values());
    
    return {
      total: webhooks.length,
      active: webhooks.filter(w => w.active).length,
      inactive: webhooks.filter(w => !w.active).length,
      webhooks: webhooks.map(w => ({
        id: w.id,
        url: w.url,
        events: w.events,
        active: w.active,
        createdAt: w.createdAt
      }))
    };
  }
}

// Singleton instance
let notifierInstance = null;

function getWebhookNotifier() {
  if (!notifierInstance) {
    notifierInstance = new WebhookNotifierService();
  }
  return notifierInstance;
}

module.exports = {
  WebhookNotifierService,
  getWebhookNotifier
}; 