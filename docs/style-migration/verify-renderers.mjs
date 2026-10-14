import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium, firefox } from 'playwright';
import { build, createServer, preview } from 'vite';
import { styleBuild } from '@neon-kit/vite-plugin-style-build';

const repository = resolve(import.meta.dirname, '../..');
const destination = resolve(process.argv[2] ?? resolve(repository, 'docs/style-migration/step-5'));
await mkdir(destination, { recursive: true });
const directory = await realpath(await mkdtemp(resolve(tmpdir(), 'neon-renderers-')));
const results = [];
const routes = ['wc-combobox', 'wc-multicombobox', 'wc-datepicker', 'wc-timepicker', 'wc-menu', 'wc-tooltip', 'icon-web-component', 'jsx-menu', 'jsx-tooltip'];
const webSource = `import '@neon-kit/web-components';
import icon from '@neon-kit/icons/outline/check';
document.body.innerHTML = '<form><label id="label" for="combo">Choice</label><neon-combobox id="combo" name="choice" required><option value="a" selected>Alpha</option><option value="b">Beta</option></neon-combobox><neon-multicombobox id="multi" name="many"><option value="a" selected>Alpha</option></neon-multicombobox><neon-datepicker id="date" name="date" value="2026-10-13"></neon-datepicker><datalist id="times"><option value="09:00">Morning</option></datalist><neon-timepicker id="time" name="time" list="times" value="09:00"></neon-timepicker></form><button id="trigger" popovertarget="menu">Actions<neon-tooltip>Help</neon-tooltip></button><neon-menu id="menu" popover><neon-menu-item>Alpha</neon-menu-item><neon-menu-item>Beta</neon-menu-item></neon-menu><neon-icon id="icon" style="font-size:24px;color:rgb(4, 5, 6)"></neon-icon>';
document.getElementById('icon').icon = icon;
window.ready = true;`;
const jsxSource = `import { render } from '@slimlib/jsx';
import { jsx } from '@slimlib/jsx/jsx-runtime';
import { Menu, MenuItem } from '@neon-kit/jsx-components/menu';
import { Tooltip } from '@neon-kit/jsx-components/tooltip';
render(() => [jsx(Menu, { children: jsx('button', { id:'trigger', children:'Actions' }), content:[jsx(MenuItem,{children:'Alpha'}),jsx(MenuItem,{children:'Beta'})] }), jsx(Tooltip,{ children:jsx('button',{id:'hint',children:'Help'}),content:'Explanation' })], document.body);
window.ready = true;`;

async function checkWeb(page) {
    const state = await page.evaluate(() => {
        const combo = document.getElementById('combo');
        const field = combo.shadowRoot.querySelector('button');
        document.getElementById('label').click();
        const form = document.querySelector('form');
        const roots = [...document.querySelectorAll('neon-combobox,neon-multicombobox,neon-datepicker,neon-timepicker,neon-menu,neon-menu-item,neon-tooltip,neon-icon')].map((host) => host.shadowRoot);
        return {
            fields: Object.fromEntries(new FormData(form)),
            labels: field.ariaLabelledByElements.map((label) => label.id),
            focus: combo.shadowRoot.activeElement === field,
            valid: form.checkValidity(),
            noGlobal: !document.styleSheets.length,
            sharedBase: roots.every((root) => root.adoptedStyleSheets.some((sheet) => roots[0].adoptedStyleSheets.includes(sheet))),
            icon: getComputedStyle(document.querySelector('neon-icon').shadowRoot.querySelector('svg')).width,
            iconColor: getComputedStyle(document.querySelector('neon-icon').shadowRoot.querySelector('svg')).color,
            font: getComputedStyle(field).fontFamily,
        };
    });
    assert.deepEqual(state.fields, { choice: 'a', many: 'a', date: '2026-10-13', time: '09:00' });
    assert.deepEqual(state.labels, ['label']);
    assert.equal(state.focus, true);
    assert.equal(state.valid, true);
    assert.equal(state.noGlobal, true);
    assert.equal(state.sharedBase, true);
    assert.equal(state.icon, '24px');
    assert.equal(state.iconColor, 'rgb(4, 5, 6)');
    const field = page.locator('neon-combobox button').first();
    await field.click();
    await page.waitForFunction(() => document.querySelector('neon-combobox').shadowRoot.querySelector('input[type=search]').getAttribute('aria-expanded') === 'true');
    const search = page.locator('neon-combobox input[type=search]');
    await search.fill('Beta');
    await search.press('Enter');
    await page.waitForFunction(() => document.getElementById('combo').value === 'b');
    await page.evaluate(() => document.querySelector('form').reset());
    await page.waitForFunction(() => document.getElementById('combo').value === 'a');
    await page.evaluate(() => { window.menuOpened = new Promise((resolve) => document.getElementById('menu').addEventListener('toggle', resolve, { once: true })); });
    await page.locator('#trigger').click();
    await page.evaluate(() => window.menuOpened);
    await page.locator('neon-menu-item').first().press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Beta');
    await page.locator('neon-menu-item').last().press('Escape');
    await page.locator('#trigger').focus();
    await page.waitForFunction(() => document.querySelector('neon-tooltip').matches(':popover-open'));
    assert.equal(await page.evaluate(() => document.querySelector('neon-tooltip').shadowRoot.querySelector('slot').assignedNodes()[0].textContent), 'Help');
    await page.locator('#trigger').press('Escape');
    const colors = [];
    for (const scheme of ['', 'light dark', 'dark', 'light']) {
        await page.evaluate((scheme) => { document.documentElement.style.colorScheme = scheme; }, scheme);
        colors.push(await page.evaluate(() => getComputedStyle(document.getElementById('combo').shadowRoot.querySelector('button')).backgroundColor));
    }
    assert.equal(colors[0], colors[3]);
    assert.equal(colors[1], colors[2]); // Every consumer context uses a dark OS preference.
    assert.notEqual(colors[2], colors[3]);
    await page.evaluate(() => { const host = document.getElementById('combo'); host.style.colorScheme = 'dark'; host.style.setProperty('--neon-color-border', 'rgb(1, 2, 3)'); });
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('combo').shadowRoot.querySelector('button')).borderColor), 'rgb(1, 2, 3)');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('combo').shadowRoot.querySelector('button')).backgroundColor), colors[2]);
    return { ...state, colors };
}

async function checkJsx(page) {
    assert.equal(await page.evaluate(() => document.querySelector('[popover]').shadowRoot), null);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[popover]')).display), 'none');
    await page.evaluate(() => { window.menuOpened = new Promise((resolve) => document.querySelector('[role=menu]').addEventListener('toggle', resolve, { once: true })); });
    await page.locator('#trigger').click();
    await page.evaluate(() => window.menuOpened);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[role=menu]')).display), 'grid');
    await page.locator('[role=menuitem]').first().press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Beta');
    await page.locator('[role=menuitem]').last().press('Escape');
    await page.locator('#hint').focus();
    await page.waitForFunction(() => document.querySelector('[role=tooltip]').matches(':popover-open'));
    const background = await page.evaluate(() => getComputedStyle(document.querySelector('[role=tooltip]')).backgroundColor);
    assert.notEqual(background, 'rgba(0, 0, 0, 0)');
    return { normalCssModules: true, plugin: false, background };
}

async function consumer(kind) {
    const root = resolve(directory, kind);
    await mkdir(root);
    await symlink(resolve(repository, 'node_modules'), resolve(root, 'node_modules'));
    await writeFile(resolve(root, 'index.html'), '<!doctype html><html lang="en"><title>Renderer proof</title><script type="module" src="/main.js"></script></html>');
    await writeFile(resolve(root, 'main.js'), kind === 'web' ? webSource : jsxSource);
    const configuration = {
        root, configFile: false, logLevel: 'error',
        plugins: kind === 'web' ? [styleBuild()] : [],
        server: { fs: { allow: [root, repository] } },
        build: { cssTarget: ['chrome128', 'firefox128'] },
    };
    await build(configuration);
    if (kind === 'web') {
        const files = await readdir(resolve(root, 'dist/assets'));
        const css = await Promise.all(files.filter((name) => name.endsWith('.css')).map((name) => readFile(resolve(root, 'dist/assets', name), 'utf8')));
        assert.ok(css.some((text) => text.includes(':host(')));
        assert.ok(css.every((text) => !/@import|composes:|@apply|@theme/.test(text)));
    }
    for (const mode of ['development', 'production']) {
        const server = mode === 'development' ? await createServer(configuration) : await preview(configuration);
        if (mode === 'development') { await server.listen(); }
        try {
            for (const type of [chromium, firefox]) {
                const browser = await type.launch();
                try {
                    const page = await browser.newPage({ colorScheme: 'dark' });
                    const errors = [];
                    page.on('pageerror', (error) => errors.push(error.message));
                    await page.goto(server.resolvedUrls.local[0]);
                    await page.waitForFunction(() => window.ready);
                    const state = kind === 'web' ? await checkWeb(page) : await checkJsx(page);
                    assert.deepEqual(errors, []);
                    results.push({ consumer: kind, mode, browser: type.name(), version: browser.version(), state });
                    console.log(`Verified built ${kind}: ${mode}/${type.name()}`);
                } finally { await browser.close(); }
            }
        } finally { await server.close(); }
    }
}

async function documentation() {
    const configuration = { configFile: resolve(repository, 'vite.config.mjs'), logLevel: 'error' };
    await build(configuration);
    for (const mode of ['development', 'production']) {
        const server = mode === 'development' ? await createServer(configuration) : await preview(configuration);
        if (mode === 'development') { await server.listen(); }
        try {
            for (const type of [chromium, firefox]) {
                const browser = await type.launch();
                try {
                    for (const scheme of ['light', 'dark']) {
                        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: scheme, reducedMotion: 'reduce' });
                        await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.fulfill({ body: '', contentType: 'text/css' }));
                        await context.addInitScript((scheme) => localStorage.setItem('theme', scheme), scheme);
                        for (const slug of routes) {
                            const page = await context.newPage();
                            const errors = [];
                            page.on('pageerror', (error) => errors.push(error.message));
                            await page.goto(new URL(`/neon-kit/${slug}/`, server.resolvedUrls.local[0]).href);
                            await page.locator('iframe[data-renderer-example]').waitFor();
                            // Dependency discovery can reload the outer document on a cold
                            // Vite start. Wait against its current iframe before taking a handle.
                            await page.waitForFunction(() => document.querySelector('iframe[data-renderer-example]')?.contentWindow?.rendererReady);
                            const frame = await (await page.locator('iframe[data-renderer-example]').elementHandle()).contentFrame();
                            await page.waitForFunction(() => {
                                const frame = document.querySelector('iframe[data-renderer-example]');
                                return frame.clientHeight >= frame.contentDocument.body.scrollHeight;
                            });
                            const state = await frame.evaluate(() => ({
                                scheme: getComputedStyle(document.documentElement).colorScheme,
                                publicClasses: [...document.querySelectorAll('.btn,.menu,.tooltip,.combobox,.datepicker,.timepicker')].length,
                                shadowHosts: [...document.querySelectorAll('neon-combobox,neon-multicombobox,neon-datepicker,neon-timepicker,neon-menu,neon-menu-item,neon-tooltip,neon-icon')].every((host) => host.shadowRoot),
                                vanillaSheets: [...document.styleSheets].filter((sheet) => {
                                    if (sheet.href && new URL(sheet.href).origin !== location.origin) { return false; }
                                    const rules = [...sheet.cssRules];
                                    for (const rule of rules) {
                                        if (rule.cssRules) { rules.push(...rule.cssRules); }
                                        if (rule.selectorText?.split(',').some((selector) => /^\.(btn|menu|tooltip|combobox|datepicker|timepicker)(?:[\s[.:#]|$)/.test(selector.trim()))) { return true; }
                                    }
                                    return false;
                                }).length,
                            }));
                            assert.equal(state.scheme, scheme);
                            assert.equal(state.publicClasses, 0);
                            assert.equal(state.shadowHosts, true);
                            assert.equal(state.vanillaSheets, 0);
                            assert.deepEqual(errors, []);
                            if (slug === 'wc-combobox' || slug === 'wc-multicombobox') {
                                await frame.evaluate(() => {
                                    const form = document.querySelector('form');
                                    const host = form.querySelector('neon-combobox,neon-multicombobox');
                                    const option = host.querySelector('option[value]');
                                    if (host.localName === 'neon-multicombobox') { host.values = [option.value]; }
                                    else { host.value = option.value; }
                                });
                                await frame.waitForFunction(() => document.querySelector('form').checkValidity());
                                await frame.locator('form button[type=submit]').click();
                                await frame.locator('form + pre').waitFor();
                                await page.waitForFunction(() => {
                                    const frame = document.querySelector('iframe[data-renderer-example]');
                                    return frame.clientHeight >= frame.contentDocument.body.scrollHeight;
                                });
                            }
                            if (mode === 'production') {
                                await page.screenshot({ path: resolve(destination, `${type.name()}-${scheme}-${slug}.png`), fullPage: true, animations: 'disabled' });
                            }
                            results.push({ documentation: slug, mode, browser: type.name(), scheme, state });
                            console.log(`Verified docs: ${mode}/${type.name()}/${scheme}/${slug}`);
                            await page.close();
                        }
                        if (scheme === 'light') {
                            const page = await context.newPage();
                            await page.goto(new URL('/neon-kit/menus/', server.resolvedUrls.local[0]).href);
                            await page.locator('#content-inner h1').waitFor();
                            await page.locator('[data-component-mode-nav] a[data-section=wc]').click();
                            const webFrame = await (await page.locator('iframe[data-renderer-example]').elementHandle()).contentFrame();
                            await page.waitForFunction(() => document.querySelector('iframe[data-renderer-example]')?.contentWindow?.rendererReady);
                            await page.evaluate(() => {
                                document.documentElement.style.colorScheme = 'dark';
                                document.documentElement.style.setProperty('--neon-color-border', 'rgb(1, 2, 3)');
                            });
                            await webFrame.waitForFunction(() => getComputedStyle(document.documentElement).colorScheme === 'dark');
                            assert.equal(await webFrame.evaluate(() => getComputedStyle(document.querySelector('neon-menu')).borderColor), 'rgb(1, 2, 3)');
                            await page.locator('[data-component-mode-nav] a[data-section=jsx]').click();
                            const jsxFrame = await (await page.locator('iframe[data-renderer-example]').elementHandle()).contentFrame();
                            await page.waitForFunction(() => document.querySelector('iframe[data-renderer-example]')?.contentWindow?.rendererReady);
                            assert.equal(webFrame.isDetached(), true);
                            assert.equal(await jsxFrame.evaluate(() => document.querySelectorAll('.menu,.menu__item').length), 0);
                            assert.equal(await jsxFrame.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark');
                            results.push({ navigation: 'vanilla → web → JSX; parent theme and overrides', mode, browser: type.name() });
                            await page.close();
                        }
                        await context.close();
                    }
                } finally { await browser.close(); }
            }
        } finally { await server.close(); }
    }
}

try {
    await consumer('web');
    await consumer('jsx');
    await documentation();
    await writeFile(resolve(destination, 'summary.json'), `${JSON.stringify({ scope: 'Built workspace renderer entries without source aliases; packed release checks remain step 6.', results }, null, 2)}\n`);
    console.log(`Verified ${results.length} browser scenarios; reports: ${destination}`);
} finally { await rm(directory, { recursive: true, force: true }); }
