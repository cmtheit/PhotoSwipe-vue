import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '');

export default defineConfig({
  root,
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(root, 'src/vue/index.ts'),
      name: 'PhotoSwipeVue',
      fileName: 'vue',
      formats: ['es'],
    },
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: { vue: 'Vue' },
      },
    },
    sourcemap: true,
  },
});
