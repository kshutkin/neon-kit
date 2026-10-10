import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { createServer as createHttpServer } from 'node:http';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { build, createServer, preview, transformWithOxc } from 'vite';
import { chromium, firefox } from 'playwright';
import { TraceMap, decodedMappings } from '@jridgewell/trace-mapping';
import { buildVanilla } from './fixtures/vanilla/build.mjs';

const execute = promisify(execFile);
const repository = resolve(import.meta.dirname, '../..');
const fixtures = resolve(import.meta.dirname, 'fixtures');
const require = createRequire(resolve(repository, 'package.json'));
const directory = await realpath(await mkdtemp(join(tmpdir(), 'neon-style-slice-')));
const app = resolve(directory, 'app');
const reports = resolve(directory, 'reports');
await mkdir(reports);
await cp(resolve(fixtures, 'app'), app, { recursive: true });

async function command(executable, args, cwd) {
    return execute(executable, args, { cwd, maxBuffer: 8 * 1024 * 1024 });
}

async function pack(source, overrides = {}) {
    const packageSource = resolve(directory, `package-${basename(source)}`);
    await mkdir(packageSource);
    const metadata = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'));
    for (const item of metadata.files) {
        if (!item.includes('*')) {
            await cp(resolve(source, item), resolve(packageSource, item), { recursive: true });
        }
    }
    // Fixture sources are tiny and use glob-based file lists.
    for (const entry of await readdir(source)) {
        if (/\.(css|jsx|svg)$/.test(entry)) {
            await cp(resolve(source, entry), resolve(packageSource, entry));
            if (metadata.name === '@neon-kit/slice-web' && entry.endsWith('.jsx')) {
                const result = await transformWithOxc(await readFile(resolve(source, entry), 'utf8'), entry,
                    { jsx: { runtime: 'automatic', importSource: '@slimlib/jsx' } });
                await writeFile(resolve(packageSource, entry.replace('.jsx', '.js')), result.code);
            }
        }
    }
    const published = { ...metadata, ...overrides };
    if (metadata.name === '@neon-kit/slice-web') {
        // Renderer JS is transpiled for publication; source style imports stay
        // intact for the application compiler, just as in the planned packages.
        published.exports = Object.fromEntries(Object.entries(metadata.exports).map(([name, target]) => [name, target.replace('.jsx', '.js')]));
        published.files = ['*.js'];
    }
    if (overrides.dependencies) {
        published.dependencies = { ...metadata.dependencies, ...overrides.dependencies };
    }
    await writeFile(resolve(packageSource, 'package.json'), `${JSON.stringify(published, null, 4)}\n`);
    if (source === resolve(repository, 'style-build') || source === resolve(repository, 'vite-plugin-style-build')) {
        await command(resolve(repository, 'node_modules/.bin/pkgprn'), ['--flatten', 'types,src'], packageSource);
    }
    const result = await command('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], packageSource);
    return resolve(directory, JSON.parse(result.stdout)[0].filename);
}

async function nativeOutput(output, root) {
    const files = await readdir(resolve(output, 'assets'));
    const javascript = files.filter((file) => file.endsWith('.js'));
    const references = new Set();
    for (const file of javascript) {
        const code = await readFile(resolve(output, 'assets', file), 'utf8');
        assert.doesNotMatch(code, /\?neon|neon-style-facade:|composes:/);
        for (const match of code.matchAll(/(?:import\s+[\w$]+\s+from\s*|from\s*)["']([^"']+\.css)["']\s*with\s*\{\s*type\s*:\s*["']css["']\s*\}/g)) {
            const path = resolve(output, 'assets', match[1]);
            assert.doesNotMatch(await readFile(path, 'utf8'), /composes:|@import/);
            references.add(path);
        }
    }
    assert.equal(references.size, 4, 'shadow base, shared surface, control, and lazy card remain distinct');
    assert.equal([...references].filter((file) => file.includes('shadow-base.')).length, 1);
    assert.equal([...references].filter((file) => file.includes('surface.module.')).length, 1);
    for (const reference of references) {
        const css = await readFile(reference, 'utf8');
        assert.doesNotMatch(css, /__parcel_url_|\?neon/);
        const map = JSON.parse(await readFile(`${reference}.map`, 'utf8'));
        assert.ok(map.sourcesContent[0].length > 0);
        assert.ok(map.mappings.length > 0);
        assert.equal(map.sourcesContent[0], await readFile(resolve(root, map.sources[0]), 'utf8'));
        for (const row of decodedMappings(new TraceMap(map))) {
            for (const segment of row) {
                if (segment.length > 1) {
                    assert.ok(segment[1] < map.sources.length, 'CSS mappings refer to actual authored sources');
                }
            }
        }
        for (const match of css.matchAll(/url\("?([^"\)]+)"?\)/g)) {
            const url = new URL(match[1], `file://${reference}`);
            await readFile(fileURLToPath(url));
        }
    }
    return { javascript: javascript.length, nativeStylesheets: references.size,
        nativeSourceMaps: references.size, nativeUrlAssets: files.filter((file) => file.endsWith('.svg')).length };
}

async function state(page) {
    return page.evaluate(() => {
        const host = document.getElementById('first');
        const second = document.getElementById('second');
        const input = host.shadowRoot.querySelector('input');
        const button = host.shadowRoot.querySelector('button');
        const jsx = document.querySelector('#jsx input');
        const sheetText = (sheet) => [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
        return {
            background: getComputedStyle(input).backgroundColor,
            jsxBackground: getComputedStyle(jsx).backgroundColor,
            border: getComputedStyle(button).borderWidth,
            inputFont: getComputedStyle(input).fontFamily,
            hostFont: getComputedStyle(host).fontFamily,
            shared: host.shadowRoot.adoptedStyleSheets.every((sheet, index) => sheet === second.shadowRoot.adoptedStyleSheets[index]),
            sheetCount: host.shadowRoot.adoptedStyleSheets.length,
            sourceClasses: [input.className, button.className],
            plainBackground: getComputedStyle(document.getElementById('plain')).backgroundColor,
            documentCss: [...document.styleSheets].flatMap((sheet) => {
                let rules = [];
                try { rules = [...sheet.cssRules].map((rule) => rule.cssText); } catch { /* External sheets are not used by this fixture. */ }
                return rules;
            }).join('\n'),
            nativeCss: host.shadowRoot.adoptedStyleSheets.map(sheetText).join('\n'),
        };
    });
}

async function checkPage(browser, origin, mode, requests, label) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, colorScheme: mode });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', async (response) => {
        if (response.url().includes('__neon_styles/') || /shadow-base\..*\.css/.test(response.url())) {
            requests.push({ url: response.url(), mime: response.headers()['content-type'] });
        }
    });
    await page.goto(origin);
    await page.waitForFunction(() => window.sliceReady && document.querySelector('#jsx input'));
    const initial = await state(page);
    assert.equal(initial.background, 'rgb(245, 248, 250)', 'unstyled page stays light under either OS preference');
    assert.equal(initial.jsxBackground, initial.background);
    assert.equal(initial.border, '2px', 'cross-file composed styles apply');
    assert.equal(initial.shared, true, 'instances share native sheet objects');
    assert.equal(initial.sheetCount, 3);
    const image = await page.locator('#first button').evaluate((element) => getComputedStyle(element, '::before').backgroundImage);
    assert.match(image, /mark\.[\w]+\.svg\?v=1#mark/);
    assert.equal((await page.request.get(image.slice(5, -2).split('#')[0])).status(), 200);
    assert.equal(initial.inputFont, initial.hostFont);
    assert.equal(initial.plainBackground, 'rgba(0, 0, 0, 0)');
    assert.doesNotMatch(initial.documentCss, /:host/);
    for (const classes of initial.sourceClasses) {
        for (const name of classes.split(' ')) {
            assert.ok(!initial.documentCss.includes(`.${name}`), 'native shadow rules are not injected into the document');
        }
    }
    assert.doesNotMatch(initial.nativeCss, /@import|composes:/);
    assert.ok(initial.sourceClasses.every((name) => name.split(' ').length === 2));
    for (const [scheme, expected] of [
        ['light dark', mode === 'dark' ? 'rgb(25, 30, 35)' : 'rgb(245, 248, 250)'],
        ['dark', 'rgb(25, 30, 35)'], ['light', 'rgb(245, 248, 250)'],
    ]) {
        await page.evaluate((value) => document.documentElement.style.colorScheme = value, scheme);
        const themed = await state(page);
        assert.equal(themed.background, expected);
        assert.equal(themed.jsxBackground, expected);
    }
    await page.evaluate(() => {
        document.documentElement.style.colorScheme = 'dark';
        document.getElementById('first').style.colorScheme = 'light';
        document.documentElement.style.setProperty('--neon-border', 'rgb(180 40 80)');
    });
    assert.equal((await state(page)).background, 'rgb(245, 248, 250)');
    assert.equal(await page.locator('#first button').evaluate((element) => getComputedStyle(element).borderColor), 'rgb(180, 40, 80)');
    // Chromium's native focus appearance can depend on how focus was entered.
    await page.locator('#first input').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#first button').evaluate((element) => getComputedStyle(element).outlineWidth), '2px');
    assert.equal(await page.locator('#first button').evaluate((element) => getComputedStyle(element).textDecorationLine), 'underline');
    assert.equal(await page.locator('#jsx button').evaluate((element) => getComputedStyle(element).textDecorationLine), 'none');
    assert.equal(await page.locator('neon-slice-card').count(), 0);
    await page.locator('#lazy').click();
    await page.locator('neon-slice-card').waitFor();
    const lazy = await page.evaluate(() => {
        const control = document.getElementById('first');
        const card = document.querySelector('neon-slice-card');
        const base = control.shadowRoot.adoptedStyleSheets[0];
        const shared = control.shadowRoot.adoptedStyleSheets[1];
        const sheets = card.shadowRoot.adoptedStyleSheets;
        return { base: base === sheets[0], surface: shared === sheets[1] };
    });
    assert.deepEqual(lazy, { base: true, surface: true });
    await page.evaluate(() => {
        const nested = document.createElement('neon-slice-card');
        document.getElementById('first').shadowRoot.append(nested);
    });
    assert.equal(await page.locator('#first neon-slice-card div').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(245, 248, 250)');
    assert.equal(await page.locator('#cards neon-slice-card div').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(25, 30, 35)');
    await page.screenshot({ path: resolve(reports, `${label}-${browser.browserType().name()}-${mode}.png`) });
    assert.deepEqual(errors, []);
    await context.close();
    return initial.sourceClasses;
}

async function checkVanilla(browser, origin, label) {
    const page = await browser.newPage();
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto(new URL('vanilla.html', origin).href);
    assert.equal(await page.locator('.input').evaluate((element) => getComputedStyle(element).borderWidth), '2px');
    assert.equal(await page.locator('.btn').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(245, 248, 250)');
    await page.locator('.input').focus();
    assert.equal(await page.locator('.btn').evaluate((element) => getComputedStyle(element).textDecorationLine), 'underline');
    await page.locator('.btn').hover();
    assert.equal(await page.locator('.btn').evaluate((element) => getComputedStyle(element).borderColor), 'rgb(70, 140, 210)');
    await page.locator('.btn').evaluate((element) => element.disabled = true);
    assert.equal(await page.locator('.btn').evaluate((element) => getComputedStyle(element).opacity), '0.5');
    assert.ok(requests.every((url) => !url.includes('__neon_styles')));
    assert.equal(await page.locator('script:not([src*="/@vite/client"])').count(), 0, 'classical CSS does not need a library JS loader');
    await page.screenshot({ path: resolve(reports, `${label}-${browser.browserType().name()}-vanilla.png`) });
    await page.close();
}

let development;
let production;
let documentation;
let watching;
let classical;
let jsxDevelopment;
let jsxProduction;
let optimizerRestart;
const browsers = [];
try {
    await command('pnpm', ['--filter', '@neon-kit/style-build', 'build'], repository);
    await command('pnpm', ['--filter', '@neon-kit/vite-plugin-style-build', 'build'], repository);
    const themeDirectory = resolve(fixtures, 'theme');
    await buildVanilla(themeDirectory, resolve(fixtures, 'vanilla/dist'));
    const vanillaCss = await readFile(resolve(fixtures, 'vanilla/dist/index.css'), 'utf8');
    assert.doesNotMatch(vanillaCss, /composes:|@import|[\w-]+_surface/);
    assert.doesNotMatch(await readFile(resolve(fixtures, 'vanilla/dist/control.css'), 'utf8'), /\.panel/);
    assert.doesNotMatch(await readFile(resolve(fixtures, 'vanilla/dist/card.css'), 'utf8'), /\.field|\.input|\.btn/);
    await assert.rejects(buildVanilla(themeDirectory, resolve(directory, 'invalid-vanilla'), [
        ['control.module.css', { control: 'field', input: 'btn', action: 'btn' }],
    ]), /conflicting public role btn/);
    const packages = [
        await pack(resolve(repository, 'style-build')),
        await pack(resolve(repository, 'vite-plugin-style-build'), { dependencies: { '@neon-kit/style-build': '0.0.1' } }),
        ...await Promise.all(['theme', 'jsx', 'web', 'vanilla'].map((name) => pack(resolve(fixtures, name)))),
    ];
    const runtimeVersions = Object.fromEntries(['@slimlib/element', '@slimlib/jsx', '@slimlib/store'].map((name) => [name, require(`${name}/package.json`).version]));
    await writeFile(resolve(app, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    const install = await command('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...packages,
        `vite@${require('vite/package.json').version}`, 'typescript@5.9.3', ...Object.entries(runtimeVersions).map(([name, version]) => `${name}@${version}`),
    ], app);
    await writeFile(resolve(reports, 'install.log'), install.stdout);
    await writeFile(resolve(app, 'vite.config.mjs'), `import { defineConfig } from 'vite';
import { styleBuild } from '@neon-kit/vite-plugin-style-build';
export default defineConfig({
    base: '/slice/', plugins: [styleBuild({ declarations: 'native-styles.d.ts' })],
    css: { devSourcemap: true },
    oxc: { jsx: { runtime: 'automatic', importSource: '@slimlib/jsx' } },
    optimizeDeps: { include: ['@neon-kit/slice-web/control', '@neon-kit/slice-web/card', '@slimlib/jsx/jsx-dev-runtime'], exclude: ['@neon-kit/slice-jsx'], rolldownOptions: { transform: { jsx: { runtime: 'automatic', importSource: '@slimlib/jsx' } } } },
    build: { sourcemap: true, cssTarget: ['chrome128', 'firefox128'], rolldownOptions: { input: { main: ${JSON.stringify(resolve(app, 'index.html'))}, vanilla: ${JSON.stringify(resolve(app, 'vanilla.html'))} } } },
});\n`);
    const configuration = { root: app, configFile: resolve(app, 'vite.config.mjs'), logLevel: 'warn' };
    development = await createServer({ ...configuration, server: { host: '127.0.0.1', port: 0 } });
    await development.listen();
    await build(configuration);
    const output = await nativeOutput(resolve(app, 'dist'), app);
    production = await preview({ ...configuration, preview: { host: '127.0.0.1', port: 0 } });
    for (const engine of [chromium, firefox]) {
        const browser = await engine.launch({ headless: true });
        browsers.push(browser);
        let developmentClasses;
        for (const server of [development, production]) {
            const origin = server.resolvedUrls.local[0];
            const requests = [];
            for (const preference of ['light', 'dark']) {
                const classes = await checkPage(browser, origin, preference, requests, server === development ? 'dev' : 'prod');
                if (server === development) {
                    developmentClasses = classes;
                } else {
                    assert.deepEqual(classes, developmentClasses, 'native class exports match in development and production');
                }
            }
            await checkVanilla(browser, origin, server === development ? 'dev' : 'prod');
            assert.ok(requests.filter((request) => request.url.endsWith('.css')).every((request) => request.mime.startsWith('text/css')));
            console.log(`${engine.name()}: ${server === development ? 'development' : 'production'} passed`);
        }
    }
    const optimized = JSON.parse(await readFile(resolve(app, 'node_modules/.vite/deps/_metadata.json'), 'utf8'));
    assert.ok(optimized.optimized['@neon-kit/slice-web/control']);
    await development.close();
    development = undefined;
    optimizerRestart = await createServer({ ...configuration, server: { host: '127.0.0.1', port: 0 } });
    await optimizerRestart.listen();
    await checkPage(browsers[0], optimizerRestart.resolvedUrls.local[0], 'dark', [], 'optimizer-restart');
    await writeFile(resolve(app, 'types.ts'), `import { styleBuild } from '@neon-kit/vite-plugin-style-build';
import { compileStyle, createStyleDeclaration, rewriteStyleUrls, type CompiledStyleModule } from '@neon-kit/style-build';
import { control, sheets } from '@neon-kit/slice-theme/control.module.css?neon';
// @ts-expect-error A misspelled class must be rejected.
import { controll } from '@neon-kit/slice-theme/control.module.css?neon';
control satisfies string;
sheets satisfies CSSStyleSheet[];
styleBuild({ declarations: 'native-styles.d.ts' });
const module = {} as CompiledStyleModule;
createStyleDeclaration('example.css?neon', module);
rewriteStyleUrls(module, {});
void compileStyle;\n`);
    await command(resolve(app, 'node_modules/.bin/tsc'), ['--noEmit', '--strict', '--skipLibCheck', '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'es2022', '--lib', 'es2022,dom', 'types.ts', 'native-styles.d.ts'], app);
    console.log('Dependency optimization, cached restart, packed declarations and source maps passed');
    // The packed JSX entry must also work in an ordinary Vite application
    // with no native-sheet plugin installed in its configuration.
    await writeFile(resolve(app, 'jsx.html'), '<!doctype html><html><div id="jsx"></div><script type="module" src="./jsx.jsx"></script></html>');
    await writeFile(resolve(app, 'jsx.jsx'), `import { render } from '@slimlib/jsx';
import { Control } from '@neon-kit/slice-jsx';
render(() => <Control />, document.getElementById('jsx'));\n`);
    const jsxConfiguration = { root: app, configFile: false, logLevel: 'warn', cacheDir: '.vite-jsx',
        oxc: { jsx: { runtime: 'automatic', importSource: '@slimlib/jsx' } },
        optimizeDeps: { noDiscovery: true },
        build: { outDir: 'dist-jsx', cssTarget: ['chrome128', 'firefox128'],
            rolldownOptions: { input: resolve(app, 'jsx.html') } },
    };
    jsxDevelopment = await createServer({ ...jsxConfiguration, server: { host: '127.0.0.1', port: 0 } });
    await jsxDevelopment.listen();
    await build(jsxConfiguration);
    jsxProduction = await preview({ ...jsxConfiguration, preview: { host: '127.0.0.1', port: 0 } });
    for (const browser of browsers) {
        for (const server of [jsxDevelopment, jsxProduction]) {
            const page = await browser.newPage();
            await page.goto(new URL('jsx.html', server.resolvedUrls.local[0]).href);
            await page.locator('#jsx input').waitFor();
            await page.waitForFunction(() => getComputedStyle(document.querySelector('#jsx input')).borderWidth === '2px');
            assert.equal(await page.locator('#jsx input').evaluate((element) => getComputedStyle(element).borderWidth), '2px');
            await page.evaluate(() => document.documentElement.style.colorScheme = 'dark');
            await page.waitForFunction(() => getComputedStyle(document.querySelector('#jsx input')).backgroundColor === 'rgb(25, 30, 35)');
            assert.equal(await page.locator('#jsx input').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(25, 30, 35)');
            await page.close();
        }
    }
    console.log('Packed JSX works without the native-sheet plugin');
    // Classical use: serve the packed vanilla files verbatim, without Vite,
    // source CSS Modules, or any JavaScript.
    const rawVanilla = resolve(app, 'node_modules/@neon-kit/theme-vanilla/dist');
    const vanillaMarkup = await readFile(resolve(app, 'vanilla.html'), 'utf8');
    classical = createHttpServer(async (request, response) => {
        const name = request.url?.slice(1);
        if (['index.css', 'control.css', 'card.css'].includes(name)) {
            response.setHeader('Content-Type', 'text/css');
            response.end(await readFile(resolve(rawVanilla, name), 'utf8'));
        } else {
            response.setHeader('Content-Type', 'text/html');
            const stylesheet = request.url === '/selective.html' ? 'control.css' : 'index.css';
            response.end(vanillaMarkup.replace('./vanilla.css', `/${stylesheet}`));
        }
    });
    await new Promise((done) => classical.listen(0, '127.0.0.1', done));
    const classicalOrigin = `http://127.0.0.1:${classical.address().port}/`;
    for (const browser of browsers) {
        await checkVanilla(browser, classicalOrigin, 'classical');
        const page = await browser.newPage();
        await page.goto(new URL('selective.html', classicalOrigin).href);
        assert.equal(await page.locator('.input').evaluate((element) => getComputedStyle(element).borderWidth), '2px');
        assert.equal(await page.locator('.panel').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)');
        await page.close();
    }
    // A local theme alias exercises real filesystem watching separately from
    // the tarball-only consumer gate (node_modules edits are not app HMR).
    const watchedTheme = resolve(app, 'watched-theme');
    await cp(resolve(app, 'node_modules/@neon-kit/slice-theme'), watchedTheme, { recursive: true });
    watching = await createServer({ ...configuration,
        cacheDir: '.vite-watching',
        resolve: { alias: [{ find: '@neon-kit/slice-theme', replacement: watchedTheme }] },
        server: { host: '127.0.0.1', port: 0 },
    });
    await watching.listen();
    const watchedPage = await browsers[0].newPage();
    await watchedPage.goto(watching.resolvedUrls.local[0]);
    await watchedPage.waitForFunction(() => window.sliceReady);
    const navigation = watchedPage.waitForEvent('framenavigated', { predicate: (frame) => frame === watchedPage.mainFrame() });
    const watchedSource = resolve(watchedTheme, 'control.module.css');
    await writeFile(watchedSource, (await readFile(watchedSource, 'utf8')).replace('padding: 12px;', 'padding: 16px;'));
    await navigation;
    await watchedPage.waitForFunction(() => document.getElementById('first').shadowRoot
        && getComputedStyle(document.getElementById('first').shadowRoot.querySelector('label')).padding === '16px');
    await writeFile(resolve(reports, 'reload.json'), JSON.stringify(await state(watchedPage), null, 2));
    await watchedPage.waitForFunction(() => window.sliceReady
        && getComputedStyle(document.querySelector('#jsx label')).padding === '16px');
    assert.equal(await watchedPage.locator('#jsx label').evaluate((element) => getComputedStyle(element).padding), '16px');
    const addedClassNavigation = watchedPage.waitForEvent('framenavigated', { predicate: (frame) => frame === watchedPage.mainFrame() });
    await writeFile(watchedSource, `${await readFile(watchedSource, 'utf8')}\n.added { color: red; }\n`);
    await addedClassNavigation;
    await watchedPage.waitForFunction(() => window.sliceReady && document.querySelector('#jsx input'));
    assert.match(await readFile(resolve(app, 'native-styles.d.ts'), 'utf8'), /as "added"/);
    const imageBefore = await watchedPage.locator('#first button').evaluate((element) => getComputedStyle(element, '::before').backgroundImage);
    const imageNavigation = watchedPage.waitForEvent('framenavigated', { predicate: (frame) => frame === watchedPage.mainFrame() });
    await writeFile(resolve(watchedTheme, 'mark.svg'), (await readFile(resolve(watchedTheme, 'mark.svg'), 'utf8')).replace('green', 'red'));
    await imageNavigation;
    await watchedPage.waitForFunction((before) => window.sliceReady && getComputedStyle(document.getElementById('first').shadowRoot.querySelector('button'), '::before').backgroundImage !== before, imageBefore);
    await watchedPage.close();
    console.log('Classical/selective CSS, class declarations and asset development reload passed');
    // Separate documentation entry: source aliases here do not replace the
    // tarball consumer checks above.
    const documentationConfig = { configFile: resolve(repository, 'vite.style-slice.config.mjs'), logLevel: 'warn' };
    await build(documentationConfig);
    await nativeOutput(resolve(repository, 'dist-style-slice-docs'), resolve(repository, 'site/style-slice'));
    documentation = await preview({ ...documentationConfig, preview: { host: '127.0.0.1', port: 0 } });
    for (const browser of browsers) {
        for (const preference of ['light', 'dark']) {
            await checkPage(browser, documentation.resolvedUrls.local[0], preference, [], 'docs');
        }
    }
    console.log('Isolated documentation build passed in Chromium and Firefox');
    await writeFile(resolve(reports, 'summary.json'), `${JSON.stringify({ output, slimlib: runtimeVersions,
        browsers: browsers.map((browser) => ({ engine: browser.browserType().name(), version: browser.version() })),
        consumption: 'isolated npm tarballs; no workspace source aliases',
        packagePrepack: true, typedImports: true, optimizerRestart: true, classAndAssetReload: true,
    }, null, 2)}\n`);
    console.log(`Style slice passed. Review artifacts: ${reports}`);
} catch (error) {
    console.error(`Style slice artifacts retained at ${directory}`);
    throw error;
} finally {
    await Promise.all(browsers.map((browser) => browser.close()));
    await development?.close();
    await watching?.close();
    await jsxDevelopment?.close();
    await optimizerRestart?.close();
    if (production) {
        await new Promise((done) => production.httpServer.close(done));
    }
    if (documentation) {
        await new Promise((done) => documentation.httpServer.close(done));
    }
    if (jsxProduction) {
        await new Promise((done) => jsxProduction.httpServer.close(done));
    }
    if (classical) {
        await new Promise((done) => classical.close(done));
    }
}
