import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import nodeResolve from '@rollup/plugin-node-resolve';
import esbuild from 'rollup-plugin-esbuild';
import clean from '@rollup-extras/plugin-clean';
import mangle from '@rollup-extras/plugin-mangle';

const here = dirname(fileURLToPath(import.meta.url));
const sourceDirectory = resolve(here, 'src');

const input = Object.fromEntries(
    readdirSync(sourceDirectory)
        .filter((name) => /\.(jsx?|tsx?)$/.test(name))
        .map((name) => [name.replace(/\.[^.]+$/, ''), resolve(sourceDirectory, name)]),
);

export default {
    input,
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
        plugins: [mangle()],
    },
};
