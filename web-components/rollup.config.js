import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import nodeResolve from '@rollup/plugin-node-resolve';
import esbuild from 'rollup-plugin-esbuild';
import clean from '@rollup-extras/plugin-clean';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, 'src');

// Every top-level source module is an entry point so the unbundled,
// per-file layout (one file per `exports` subpath) is preserved.
const input = Object.fromEntries(
    readdirSync(srcDir)
        .filter((name) => /\.(jsx?|tsx?)$/.test(name))
        .map((name) => [name.replace(/\.[^.]+$/, ''), resolve(srcDir, name)]),
);

export default {
    input,
    // Externalise every bare specifier (@slimlib/*, @neon-kit/icons, esm-env).
    external: (id) => !id.startsWith('.') && !id.startsWith('/'),
    plugins: [
        clean({ targets: ['dist', '.dts'] }),
        nodeResolve({ extensions: ['.js', '.jsx', '.mjs'] }),
        esbuild({
            include: /\.[jt]sx?$/,
            jsx: 'automatic',
            jsxImportSource: '@slimlib/jsx',
            target: 'es2022',
        }),
    ],
    output: {
        dir: 'dist',
        format: 'es',
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
    },
};
