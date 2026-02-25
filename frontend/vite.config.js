import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Split large dependencies into dedicated chunks to keep the main bundle lean
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'mui-vendor': [
            '@mui/material',
            '@mui/lab',
            '@mui/x-date-pickers',
            '@mui/x-date-pickers-pro',
            '@emotion/react',
            '@emotion/styled',
          ],
          charts: ['recharts'],
          pdf: ['jspdf', 'jspdf-autotable'],
          xlsx: ['xlsx', 'xlsx-js-style'],
        },
      },
    },
    // Raise the warning threshold now that code-splitting is in place
    chunkSizeWarningLimit: 1200,
  },
  server: {
    proxy: {
      // Serve backend endpoints via the same origin as Vite dev server.
      // This avoids CORS/mixed-host issues on EC2 when accessing by public IP.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/downloads': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
