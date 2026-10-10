import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { styleBuild } from '@neon-kit/vite-plugin-style-build';

const repository = import.meta.dirname;
const fixtures = resolve(repository, 'vite-plugin-style-build/tests/fixtures');
const elementDirectory = process.env.NEON_SLIMLIB_ELEMENT ?? resolve(repository, '../slimlib/element');

// Isolated documentation fixture. The regular documentation site keeps its
// current runtime/theme until the component catalogue migration.
export default defineConfig({
    root: resolve(repository, 'site/style-slice'),
    base: '/neon-kit/style-slice/',
    publicDir: resolve(fixtures, 'app/public'),
    plugins: [styleBuild()],
    css: { devSourcemap: true },
    oxc: { jsx: { runtime: 'automatic', importSource: '@slimlib/jsx' } },
    resolve: {
        alias: [
            { find: '@neon-kit/slice-theme', replacement: resolve(fixtures, 'theme') },
            { find: '@neon-kit/slice-jsx', replacement: resolve(fixtures, 'jsx/index.jsx') },
            { find: '@neon-kit/slice-web', replacement: resolve(fixtures, 'web') },
            { find: /^@slimlib\/element$/, replacement: resolve(elementDirectory, 'src/index.js') },
        ],
    },
    optimizeDeps: { noDiscovery: true },
    server: { fs: { allow: [repository, elementDirectory] } },
    build: {
        outDir: resolve(repository, 'dist-style-slice-docs'),
        emptyOutDir: true,
        cssTarget: ['chrome128', 'firefox128'],
        sourcemap: true,
    },
});
