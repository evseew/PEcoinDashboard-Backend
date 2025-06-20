// middleware/auth.js
const authMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;
  
  // API Key авторизация
  if (apiKey && apiKey === process.env.API_KEY) {
    return next();
  }
  
  // JWT авторизация (для будущих фич)
  if (authHeader?.startsWith('Bearer ')) {
    // TODO: JWT verification logic
    // const token = authHeader.substring(7);
    // Пока пропускаем Bearer токены для future development
  }
  
  return res.status(401).json({ 
    success: false, 
    error: 'Unauthorized',
    message: 'Valid API key required in X-API-Key header'
  });
};

module.exports = authMiddleware; 