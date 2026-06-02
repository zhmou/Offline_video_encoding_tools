import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: '/Offline_video_encoding_tools/',
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('fluent-'),
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
