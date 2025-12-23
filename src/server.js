const dotenv = require('dotenv');
dotenv.config();

const http = require('http');
const { app, initApp } = require('./app');
const logger = require('./utils/logger');

const PORT = Number(process.env.PORT) || 3000;

const startServer = async () => {
  try {
    await initApp();

    const server = http.createServer(app);

    server.listen(PORT, () => {
      logger.info(`OTP service listening on port ${PORT}`);
    });

    server.on('error', (error) => {
      logger.error('Server error', { error: error.message });
      process.exit(1);
    });

    const gracefulShutdown = async () => {
      logger.info('Received shutdown signal, closing server');
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

startServer();
