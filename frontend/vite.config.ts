import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        id: '/?source=pwa',
        name: 'Pinapeg',
        short_name: 'Pinapeg',
        description: 'Voice-first personal schedule, thought, research, habit, and scholarship companion.',
        theme_color: '#fdf8f6',
        background_color: '#fdf8f6',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        categories: ['productivity', 'education', 'lifestyle'],
        icons: [{ src: '/pin.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
      },
      workbox: { navigateFallback: '/index.html', runtimeCaching: [], cleanupOutdatedCaches: true, clientsClaim: true, skipWaiting: true },
      devOptions: { enabled: false }
    })
  ],
  server: { port: 5173 }
});
