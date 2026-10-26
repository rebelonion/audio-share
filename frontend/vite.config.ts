import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { prePaintThemeScript } from './src/lib/themeBoot'

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, '..')
  const env = loadEnv(mode, envDir, 'DEV_API_TARGET')
  return {
    plugins: [
      react(),
      {
        // Sets data-theme before first paint (src/lib/themeBoot.ts). Prepended so it doesn't wait on the
        // font stylesheet: inline scripts after a pending stylesheet are blocked until it loads.
        name: 'pre-paint-theme',
        transformIndexHtml: () => [{ tag: 'script', children: prePaintThemeScript(), injectTo: 'head-prepend' }],
      },
    ],
    test: {include: ['src/**/*.test.{ts,tsx}'], setupFiles: ['./src/test/setup.ts']},
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
