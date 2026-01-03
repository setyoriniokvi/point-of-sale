const PRODUCT_PORT = 3001;
const TRANSACTION_PORT = 3002;
const AUTH_PORT = 3003;
const DASHBOARD_PORT = 3004;
const RECO_PORT = 5000;
const GATEWAY_PORT = 3000;

const config = {
  // Database
  MONGO_URI: process.env.MONGO_URI || 'mongodb://mongo:27017/posdb',

  // JWT (digunakan auth-service)
  JWT_SECRET: process.env.JWT_SECRET || 'IAE-Tubes-Secret-Key',

  // URLs antar layanan (semua services dalam 1 container jadi gunakan localhost)
  PRODUCT_SERVICE_URL: process.env.PRODUCT_SERVICE_URL || `http://localhost:${PRODUCT_PORT}`,
  TRANSACTION_SERVICE_URL: process.env.TRANSACTION_SERVICE_URL || `http://localhost:${TRANSACTION_PORT}`,
  RECOMMENDATION_SERVICE_URL: process.env.RECOMMENDATION_SERVICE_URL || `http://localhost:${RECO_PORT}`,
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || `http://localhost:${AUTH_PORT}`,
  DASHBOARD_SERVICE_URL: process.env.DASHBOARD_SERVICE_URL || `http://localhost:${DASHBOARD_PORT}`,

  // Port bawaan per layanan
  PORTS: {
    GATEWAY: GATEWAY_PORT,
    PRODUCT: PRODUCT_PORT,
    TRANSACTION: TRANSACTION_PORT,
    AUTH: AUTH_PORT,
    DASHBOARD: DASHBOARD_PORT,
    RECOMMENDATION: RECO_PORT,
  },
};

module.exports = config;