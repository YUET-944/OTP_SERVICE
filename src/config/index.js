const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  environment: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: Number(process.env.REDIS_PORT) || 6379,
  },
};
