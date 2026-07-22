import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
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
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/pin.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      devOptions: { enabled: false }
    })
  ],
  server: { port: 5173 }
});
