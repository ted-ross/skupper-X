import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Get backend URL from environment variable, default to localhost
const backendUrl = process.env.BACKEND_URL || 'http://localhost:8085';

export default defineConfig({
  plugins: [react()],
  
  build: {
    outDir: 'build'
  },
  
  server: {
    port: 3000,
    proxy: {
      '/api': backendUrl,
      '/compose': backendUrl
    }
  },
  
  // Define environment variables available to the client
  define: {
    'process.env.COLLECTOR_URL': JSON.stringify(process.env.COLLECTOR_URL || ''),
    'process.env.BRAND_APP_LOGO': JSON.stringify(process.env.BRAND_APP_LOGO || ''),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
  }
});
