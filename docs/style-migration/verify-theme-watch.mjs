import assert from 'node:assert/strict';
import {
    cp,
    mkdir,
    mkdtemp,
    readFile,
    writeFile,
    rm,
    realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { vanillaStyles } from '../../site/vanilla-styles.mjs';

const repository = resolve(import.meta.dirname, '../..');
const directory = await realpath(
    await mkdtemp(resolve(tmpdir(), 'neon-theme-watch-'))
);
const theme = resolve(directory, 'theme');
const app = resolve(directory, 'app');
await cp(resolve(repository, 'theme'), theme, {
    recursive: true,
    filter: (path) => !path.includes('node_modules'),
});
await mkdir(app);
await writeFile(
    resolve(app, 'index.html'),
    '<!doctype html><button class="btn cta" id="probe">Watch</button><script type="module" src="./main.js"></script>'
);
await writeFile(resolve(app, 'main.js'), 'import "./styles/index.css";');
const server = await createServer({
    root: app,
    configFile: false,
    plugins: [vanillaStyles(theme, resolve(app, 'styles'))],
    server: { host: '127.0.0.1', port: 0 },
});
const browser = await chromium.launch();
try {
    await server.listen();
    const page = await browser.newPage({ colorScheme: 'light' });
    await page.goto(server.resolvedUrls.local[0]);
    const before = await page
        .locator('#probe')
        .evaluate((element) => getComputedStyle(element).backgroundColor);
    const path = resolve(theme, 'tokens.css');
    const source = await readFile(path, 'utf8');
    await writeFile(
        path,
        source.replace('--primary-hue: 245;', '--primary-hue: 315;')
    );
    await page.waitForFunction(
        (color) =>
            getComputedStyle(document.querySelector('#probe'))
                .backgroundColor !== color,
        before
    );
    const after = await page
        .locator('#probe')
        .evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.notEqual(before, after);
    const result = {
        browser: browser.version(),
        source: 'tokens.css',
        documentationRebuild: true,
        browserStyleUpdate: true,
        before,
        after,
    };
    if (process.argv[2]) {
        await writeFile(
            resolve(process.argv[2]),
            `${JSON.stringify(result, null, 2)}\n`
        );
    }
    console.log('Documentation source watching passed');
} finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
}
