module.exports = {
  apps: [{
    name: 'pecoin-nft-backend',
    script: 'index.js',
    instances: 1, // Одна инстанция для начала
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 8080
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 8080
    },
    // Логирование
    log_file: '/tmp/logs/combined.log',
    out_file: '/tmp/logs/out.log',
    error_file: '/tmp/logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Restart policy
    min_uptime: '10s',
    max_restarts: 10,
    
    // Monitoring
    pmx: true,
    
    // Advanced features
    node_args: '--max-old-space-size=1024'
  }]
}; 