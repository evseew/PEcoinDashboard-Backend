#!/usr/bin/env node

/**
 * Точка входа для PM2 и TimeWeb
 * Импортирует и запускает основное Express приложение
 */

console.log('🚀 Starting PEcamp NFT Backend...');
console.log('📂 Entry point: index.js');
console.log('⚙️  Process manager: PM2');

// Импортируем основное приложение
require('./app.js');

console.log('✅ Application bootstrapped successfully'); 