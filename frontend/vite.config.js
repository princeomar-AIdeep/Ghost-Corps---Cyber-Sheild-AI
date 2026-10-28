import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    // Fix issue 3: SPA routing — /dashboard doesn't 404 on hard refresh
    historyApiFallback: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    historyApiFallback: true,
  },
})
