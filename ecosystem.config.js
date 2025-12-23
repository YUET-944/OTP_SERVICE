module.exports = {
  apps: [
    {
      name: 'otp-service',
      script: 'src/server.js',
      instances: process.env.PM2_INSTANCES ? Number(process.env.PM2_INSTANCES) : 2,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: process.env.PM2_MAX_MEMORY || '300M',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
