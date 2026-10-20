import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Destino del proxy de desarrollo: la API de Spring. Con el proxy, el navegador ve un solo origen
// (localhost:5173) y no hace falta CORS en desarrollo. En producción Nginx hace lo mismo.
const destinoApi = process.env.VITE_API_PROXY ?? 'http://localhost:8080'

// El navegador manda la cabecera Origin en los POST/PUT/DELETE aunque la página y la API compartan origen. Si Vite
// la reenvía, el backend la toma por una llamada entre orígenes y responde 403 "Invalid CORS request" salvo que el
// origen esté en CORS_ORIGINS (por ejemplo, abrir http://127.0.0.1:5173 en vez de localhost:5173). Quitándola, el
// backend ve lo que ve en producción con un proxy: una petición normal del mismo origen.
const aApi = {
  target: destinoApi,
  configure: (proxy: {
    on: (evento: 'proxyReq', fn: (req: { removeHeader: (n: string) => void }) => void) => void
  }) => {
    proxy.on('proxyReq', (peticion) => peticion.removeHeader('origin'))
  },
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': aApi,
      '/actuator/health': aApi,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
