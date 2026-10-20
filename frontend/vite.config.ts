import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Destino del proxy de desarrollo: la API de Spring. Con el proxy, el navegador ve un solo origen
// (localhost:5173) y no hace falta CORS en desarrollo. En producción Nginx hace lo mismo.
const destinoApi = process.env.VITE_API_PROXY ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': destinoApi,
      '/actuator/health': destinoApi,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
