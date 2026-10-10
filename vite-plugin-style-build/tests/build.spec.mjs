import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { build } from 'vite';
import { styleBuild } from '../src/index.js';

const directories = [];
afterEach(async () => {
    await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })));
    directories.length = 0;
});

async function fixture(styles = `.image { background-image: url('./image.svg?v=1#mark'); }`) {
    const directory = await mkdtemp(resolve(tmpdir(), 'neon-style-build-'));
    directories.push(directory);
    await mkdir(resolve(directory, 'public'));
    await writeFile(resolve(directory, 'public/public.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(resolve(directory, 'image.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(resolve(directory, 'style.module.css'), styles);
    await writeFile(resolve(directory, 'main.js'), `import { sheets } from './style.module.css?neon'; globalThis.nativeSheets = sheets;`);
    return directory;
}

async function compile(directory, sourcemap = true) {
    await build({
        root: directory, configFile: false, base: './', logLevel: 'silent',
        plugins: [styleBuild({ declarations: 'native-styles.d.ts' })],
        build: { sourcemap, assetsDir: 'styles/nested',
            rolldownOptions: { input: resolve(directory, 'main.js'), output: { entryFileNames: 'js/[name].js' } },
        },
    });
    const assets = resolve(directory, 'dist/styles/nested');
    const files = await readdir(assets);
    const name = files.find((file) => file.endsWith('.css'));
    return { assets, files, name, css: await readFile(resolve(assets, name), 'utf8') };
}

it('rewrites relative/public URLs under nested asset directories and leaves external URLs intact', async () => {
    const directory = await fixture(`
        .image { background-image: url('./image.svg?v=1#mark'); }
        .public { background-image: url('/public.svg#public'); }
        .external { background-image: url('https://example.com/image.svg'); }
        .data { background-image: url('data:image/svg+xml,hello'); }
        .fragment { filter: url('#local'); }
    `);
    const output = await compile(directory);
    expect(output.css).toMatch(/\.\/image\.[a-f\d]+\.svg\?v=1#mark/);
    expect(output.css).toContain('../../public.svg#public');
    expect(output.css).toContain('https://example.com/image.svg');
    expect(output.css).toContain('data:image/svg+xml,hello');
    expect(output.css).toContain('#local');
    expect(output.files.filter((file) => file.endsWith('.svg'))).toHaveLength(1);
    const chunk = await readFile(resolve(directory, 'dist/js/main.js'), 'utf8');
    expect(chunk).toMatch(/\.\.\/styles\/nested\/.*\.styles\.js/);
    expect(chunk).not.toContain('neon-style-facade:');
    const map = JSON.parse(await readFile(resolve(directory, 'dist/js/main.js.map'), 'utf8'));
    expect(map.sourcesContent).toContain(`import { sheets } from './style.module.css?neon'; globalThis.nativeSheets = sheets;`);
    const cssMap = JSON.parse(await readFile(resolve(output.assets, `${output.name}.map`), 'utf8'));
    expect(cssMap.sources).toEqual(['style.module.css']);
    expect(cssMap.sourcesContent[0]).toContain('./image.svg?v=1#mark');
    expect(await readFile(resolve(directory, 'native-styles.d.ts'), 'utf8')).toContain('*/style.module.css?neon');
});

it.each(['hidden', 'inline', false])('honors the %s source-map mode', async (mode) => {
    const output = await compile(await fixture(), mode);
    if (mode === 'hidden') {
        expect(output.files).toContain(`${output.name}.map`);
        expect(output.css).not.toContain('sourceMappingURL');
    } else if (mode === 'inline') {
        expect(output.css).toContain('sourceMappingURL=data:application/json;base64,');
        expect(output.files).not.toContain(`${output.name}.map`);
    } else {
        expect(output.css).not.toContain('sourceMappingURL');
        expect(output.files).not.toContain(`${output.name}.map`);
    }
});

it('encodes filename characters without treating them as query or fragment delimiters', async () => {
    const directory = await fixture(`.image { background-image: url('./image%23%20mark.svg?v=1#mark'); }`);
    await writeFile(resolve(directory, 'image# mark.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const output = await compile(directory);
    expect(output.css).toMatch(/image%23%20mark\.[a-f\d]+\.svg\?v=1#mark/);
    expect(output.files.some((file) => file.startsWith('image# mark.'))).toBe(true);
});

it('rejects ambiguous relative authoring patterns and reserved sheet exports', async () => {
    const directory = await fixture('.sheets { color: red; }');
    await expect(compile(directory)).rejects.toThrow('reserved');
    await writeFile(resolve(directory, 'style.module.css'), '.first { color: red; }');
    await mkdir(resolve(directory, 'second'));
    await writeFile(resolve(directory, 'second/style.module.css'), '.second { color: blue; }');
    await writeFile(resolve(directory, 'second/main.js'), `import { sheets } from './style.module.css?neon'; export { sheets };`);
    await writeFile(resolve(directory, 'main.js'), `import { sheets } from './style.module.css?neon'; import { sheets as second } from './second/main.js'; globalThis.nativeSheets = [sheets, second];`);
    await expect(compile(directory)).rejects.toThrow('Ambiguous native style declaration');
});
