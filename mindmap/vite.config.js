import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '프로젝트 마인드맵',
        short_name: '마인드맵',
        description: '프로젝트를 가지로 펼치고 할 일까지 한 장에서 관리',
        theme_color: '#3b5bdb',
        background_color: '#f6f5f1',
        display: 'standalone',
        scope: './',
        start_url: './',
        lang: 'ko',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico}'] }
    })
  ]
});
