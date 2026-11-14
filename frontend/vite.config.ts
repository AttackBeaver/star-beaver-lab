import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      // В dev фронт и бэк живут на разных портах (5173 vs 5000).
      // Прокси на /api позволяет фронту писать относительные пути
      // (/api/auth/login) — точно так же, как в проде за Nginx.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // Статика пользовательских файлов (мемы, новости — блоки 2–3).
      // В проде это отдаёт Nginx, в dev — проксируем на backend.
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});