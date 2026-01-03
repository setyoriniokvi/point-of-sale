// Simple request logger middleware.
// Logs method and path to the console.

function logger(req, res, next) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
}

module.exports = logger;








