import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    strictPort: true,
    host: true,
    proxy: {
      // Same-origin path for the browser (no CORS). The dev server
      // forwards /api/v1/* to the backend. Production builds keep the
      // absolute URL from .env.
      '/api/v1': {
        target: 'http://localhost:5000',
      },
      // Product images are served by the backend from disk under
      // /uploads; mirror them through the dev server too.
      '/uploads': {
        target: 'http://localhost:5000',
      },
    },
  },
  preview: {
    port: 3000,
    host: true,
  },
});