// Backend/ecosystem.config.js
// Konfigurasi PM2 untuk API + worker.
// Pakai: pm2 start ecosystem.config.js --env production
//
// PENTING:
// - instances: 1 (fork) karena rate limiter memakai memory store. Kalau nanti
//   dijalankan >1 instance, pindahkan store rate limit ke redis.
// - Worker butuh Playwright + Chromium di server:
//     npx playwright install --with-deps chromium
module.exports = {
  apps: [
    {
      name: 'enzyy-api',
      cwd: __dirname,
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      out_file: './logs/api.out.log',
      error_file: './logs/api.err.log',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'enzyy-worker',
      cwd: __dirname,
      script: 'src/worker.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '768M',
      out_file: './logs/worker.out.log',
      error_file: './logs/worker.err.log',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
