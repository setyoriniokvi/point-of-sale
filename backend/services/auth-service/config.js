module.exports = {
  // use docker service name "mongodb" as default host
  MONGO_URI: process.env.MONGO_URI || 'mongodb://mongodb:27017/posdb',
  JWT_SECRET: process.env.JWT_SECRET || 'IAE-Tubes-Secret-Key',
  PORTS: {
    AUTH: process.env.AUTH_PORT || 3003,
  },
};








