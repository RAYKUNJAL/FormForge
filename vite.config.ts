import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxy = { '/api': process.env.FORMFORGE_AI_URL || 'http://127.0.0.1:8000' }

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
})
