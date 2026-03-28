import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
 
export default defineConfig({
  plugins: [react()],
  // Output stays in the default client/dist — the root build script copies it to server/public
  server: {
    port: 5173,
    proxy: {
      '/api':       { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', changeOrigin: true, ws: true },
    },
  },
});
 
