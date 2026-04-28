import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, 'docs'),
  base: './',
  plugins: [tailwindcss()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist-docs'),
    emptyOutDir: true,
  },
});
