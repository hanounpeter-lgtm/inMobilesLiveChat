import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// /api and /socket.io are proxied to the NestJS server so cookies stay
// first-party and no CORS is involved in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
