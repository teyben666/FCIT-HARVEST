import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // LAN: bind all interfaces; allow Host header when using http://<your-ip>:5173 (Vite 6+ host check)
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Farm loop MP4s are served by Express from repo root `farm video/`
      '/farm-video': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
