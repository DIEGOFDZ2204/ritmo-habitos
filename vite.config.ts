import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/ritmo-habitos/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Ritmo — tus hábitos, a tu manera',
        short_name: 'Ritmo',
        description: 'Un espacio tranquilo para crear hábitos y celebrar tu progreso.',
        theme_color: '#f8f8f5',
        background_color: '#f8f8f5',
        lang: 'es',
        display: 'standalone',
        start_url: '/ritmo-habitos/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
})
