import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/nfl-player-ratings/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'NFL Player Ratings',
        short_name: 'NFL Ratings',
        description: 'Weighted PPR fantasy ratings for NFL players based on current stats',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/nfl-player-ratings/',
        scope: '/nfl-player-ratings/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        runtimeCaching: [
          {
            urlPattern: /\/data\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'nfl-data-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 8 }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    host: true
  }
})
