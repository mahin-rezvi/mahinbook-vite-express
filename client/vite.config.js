import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'mahinbook-static-entry',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          if (process.env.VITE_STATIC_LANDING_ONLY === 'true') {
            return html.replace('/src/main.jsx', '/src/static.jsx');
          }
          return html;
        },
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
  },
});
