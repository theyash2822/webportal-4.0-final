import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const backend = (env.VITE_API_URL || 'http://localhost:3001/app').replace(/\/app\/?$/, '')

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    server: {
      host: true,
      port: 5173,
      strictPort: false,
      proxy: {
        '/api': { target: backend, changeOrigin: true },
        '/app': { target: backend, changeOrigin: true },
        '/tally': { target: backend, changeOrigin: true },
      },
    },
  }
})
