import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    // optional: proxy to backend if needed
    // proxy: {
    //   '/api': 'http://localhost:3000'
    // }
  }
});
