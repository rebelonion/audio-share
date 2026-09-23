import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, '..')
  const env = loadEnv(mode, envDir, 'DEV_API_TARGET')
  return {
    plugins: [react()],
    envDir,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.DEV_API_TARGET || 'http://localhost:8080',
          changeOrigin: true,
          xfwd: true,
        },
      },
    },
  }
})
