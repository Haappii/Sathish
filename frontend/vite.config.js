import fs from 'fs'
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function loadSharedConfig() {
  const candidates = [
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '..', 'config.example.txt'),
    path.resolve(__dirname, '..', 'config.txt'),
  ]
  const merged = {}

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
    for (const rawLine of lines) {
      const line = String(rawLine || '').trim()
      if (!line || line.startsWith('#')) continue

      const equalsIndex = line.indexOf('=')
      if (equalsIndex <= 0) continue

      const key = line.slice(0, equalsIndex).trim()
      if (!key) continue

      let value = line.slice(equalsIndex + 1).trim()
      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      if (quoted) value = value.slice(1, -1)

      merged[key] = value
    }
  }

  for (const [key, value] of Object.entries(merged)) {
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

loadSharedConfig()

// https://vite.dev/config/
export default defineConfig({
  envDir: '..',
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
