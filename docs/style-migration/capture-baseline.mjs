import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, relative } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Use the CSS parser shipped with the installed Vite, without adding a
// production dependency for this migration evidence tool.
const require = createRequire(import.meta.resolve('vite'));
const postcss = require('postcss');
const repository = resolve(import.meta.dirname, '../..');
const output = process.argv[2];
if (!output) {
    throw new Error('Pass a new output directory; do not overwrite the historical baseline.');
}
const destination = resolve(output);
await mkdir(destination, { recursive: false });

async function sourceFiles(directory) {
    const files = [];
    for (const entry of await readdir(resolve(repository, directory), { withFileTypes: true })) {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory() && entry.name !== 'node_modules') {
            files.push(...await sourceFiles(path));
        } else if (entry.isFile() && /\.(css|html|jsx|js)$/.test(entry.name)) {
            files.push(path);
        }
    }
    return files.sort();
}

function scopeOf(node) {
    const scope = [];
    let parent = node.parent;
    while (parent && parent.type !== 'root') {
        scope.unshift(parent.type === 'rule' ? parent.selector : `@${parent.name} ${parent.params}`);
        parent = parent.parent;
    }
    return scope;
}

const styles = (await sourceFiles('theme')).filter((path) => path.endsWith('.css'));
const sections = await sourceFiles('site/sections');
const sources = {};
const inventory = {};
for (const path of [
    ...styles, ...sections, 'site/index.html', 'site/index-docs.css',
    ...await sourceFiles('web-components/src'),
    ...await sourceFiles('jsx-components/src'),
    ...await sourceFiles('core/src'),
    ...(await sourceFiles('site')).filter((path) => /\.(js|jsx)$/.test(path)),
    'vite.config.mjs', 'package.json', 'pnpm-lock.yaml',
    'theme/package.json', 'web-components/package.json', 'jsx-components/package.json',
    'jsx-components/dist/menu.js',
]) {
    const content = await readFile(resolve(repository, path), 'utf8');
    sources[path] = { sha256: createHash('sha256').update(content).digest('hex'), content };
    if (path.endsWith('.css')) {
        const tree = postcss.parse(content, { from: path });
        const selectors = [];
        const tokens = [];
        const directives = [];
        tree.walkRules((rule) => {
            selectors.push({ selector: rule.selector, scope: scopeOf(rule), line: rule.source.start.line });
        });
        tree.walkDecls((declaration) => {
            if (declaration.prop.startsWith('--')) {
                tokens.push({ name: declaration.prop, value: declaration.value, scope: scopeOf(declaration), line: declaration.source.start.line });
            }
        });
        tree.walkAtRules((rule) => {
            directives.push({ name: rule.name, value: rule.params, scope: scopeOf(rule), line: rule.source.start.line });
        });
        inventory[path] = { selectors, tokens, directives };
    }
}
await writeFile(resolve(destination, 'sources.json'), `${JSON.stringify(sources, null, 2)}\n`);
await writeFile(resolve(destination, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
const tokenNames = [...new Set(Object.values(inventory).flatMap((sheet) => sheet.tokens.map((token) => token.name)))].sort();
const routes = sections.map((path) => path.split('/').at(-1).replace('.html', ''))
    .filter((route) => !['about', 'getting-started', 'icons'].includes(route));
const interactionSelectors = {
    buttons: '#content-inner button.btn',
    details: '#content-inner summary',
    dialogs: '#content-inner [data-open="dlg-medium"]',
    menus: '#content-inner [popovertarget="menu-popover"]',
    'combobox-single': '#content-inner .combobox__field[popovertarget]',
    'combobox-multi': '#content-inner .combobox__chevron-btn[popovertarget]',
    datepicker: '#content-inner .datepicker__trigger',
    timepicker: '#content-inner .timepicker__trigger',
    tooltip: '#content-inner button[interestfor]',
    'wc-menu': '#content-inner [popovertarget="wc-demo-menu"]',
    'wc-tooltip': '#content-inner button:has(neon-tooltip)',
    'wc-combobox': '#content-inner neon-combobox .combobox__field',
    'wc-multicombobox': '#content-inner neon-multicombobox .combobox__field',
    'wc-datepicker': '#content-inner neon-datepicker .datepicker__trigger',
    'wc-timepicker': '#content-inner neon-timepicker .timepicker__trigger',
    'jsx-menu': '[data-jsx-menu-demo="basic"] button[popovertarget]',
    'jsx-tooltip': '[data-jsx-tooltip-demo="basic"] button',
};

async function renderedState(page) {
    return page.evaluate((names) => {
        const content = document.querySelector('#content-inner');
        const rootStyle = getComputedStyle(document.documentElement);
        return {
            markup: content.outerHTML,
            tokens: Object.fromEntries(names.map((name) => [name, rootStyle.getPropertyValue(name).trim()])),
            classes: [...new Set([...content.querySelectorAll('[class]')].flatMap((element) => [...element.classList]))].sort(),
            hosts: [...content.querySelectorAll('*')].filter((element) => element.localName.startsWith('neon-')).map((element) => ({
                tag: element.localName, shadowRoot: Boolean(element.shadowRoot),
            })),
            openPopovers: [...content.querySelectorAll(':popover-open')].map((element) => element.outerHTML),
            focus: document.activeElement?.outerHTML,
            fontFamily: getComputedStyle(content).fontFamily,
        };
    }, tokenNames);
}

let server;
let browser;
const captures = [];
try {
    server = await createServer({
        configFile: resolve(repository, 'vite.config.mjs'),
        server: { host: '127.0.0.1', port: 0, open: false },
    });
    await server.listen();
    const origin = server.resolvedUrls.local[0];
    browser = await chromium.launch({ headless: true });
    for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({
            viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1,
            locale: 'en-US', timezoneId: 'Europe/Berlin', colorScheme: theme,
            reducedMotion: 'reduce',
        });
        // Record a deterministic system-font baseline. Remote Google Fonts
        // are document-owned and must be assessed separately during cutover.
        await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.fulfill({ body: '', contentType: 'text/css' }));
        await context.addInitScript((mode) => localStorage.setItem('theme', mode), theme);
        for (const route of routes) {
            const page = await context.newPage();
            page.setDefaultTimeout(15000);
            await page.clock.setFixedTime(new Date('2026-10-07T12:00:00Z'));
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            await page.goto(new URL(`${route}/`, origin).href);
            await page.locator('#content-inner h1').first().waitFor();
            // JSX demos and icon examples initialize through dynamic imports.
            if (route.startsWith('jsx-')) {
                await page.locator(`[data-jsx-${route.slice(4)}-demo="basic"] button`).first().waitFor();
            }
            if (route === 'icon-web-component') {
                await page.locator('#content-inner neon-icon svg').first().waitFor();
            }
            await page.evaluate(() => document.fonts.ready);
            const directory = resolve(destination, theme);
            await mkdir(directory, { recursive: true });
            const record = { route, theme, errors, idle: await renderedState(page), screenshots: [] };
            const idlePath = resolve(directory, `${route}.png`);
            await page.screenshot({ path: idlePath, fullPage: true, animations: 'disabled' });
            record.screenshots.push(relative(destination, idlePath));
            if (interactionSelectors[route]) {
                const trigger = page.locator(interactionSelectors[route]).first();
                await trigger.scrollIntoViewIfNeeded();
                if (route.includes('tooltip')) {
                    await trigger.hover();
                    await page.locator('#content-inner :popover-open').first().waitFor();
                } else if (route === 'buttons') {
                    await trigger.focus();
                } else {
                    await trigger.click();
                    if (route !== 'details') {
                        await page.locator('#content-inner :popover-open, #content-inner dialog[open]').first().waitFor();
                    }
                }
                record.interaction = { action: route.includes('tooltip') ? 'hover' : route === 'buttons' ? 'focus' : 'click', selector: interactionSelectors[route], ...await renderedState(page) };
                const interactionPath = resolve(directory, `${route}-interaction.png`);
                await page.screenshot({ path: interactionPath, animations: 'disabled' });
                record.screenshots.push(relative(destination, interactionPath));
            }
            if (errors.length > 0) {
                throw new Error(`${theme}/${route}: ${errors.join('; ')}`);
            }
            await writeFile(resolve(directory, `${route}.json`), `${JSON.stringify(record, null, 2)}\n`);
            captures.push({ route, theme, screenshots: record.screenshots });
            await page.close();
            console.log(`Captured ${theme}/${route}`);
        }
        await context.close();
    }
    await writeFile(resolve(destination, 'manifest.json'), `${JSON.stringify({
        sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(),
        capturedAt: new Date().toISOString(), browser: browser.version(),
        playwright: require('playwright/package.json').version,
        vite: require('vite/package.json').version, postcss: require('postcss/package.json').version,
        viewport: { width: 1440, height: 1000 }, date: '2026-10-07T12:00:00Z',
        fonts: 'Google Fonts disabled; platform sans-serif fallback',
        serving: 'Vite development server with the repository config; not packed-package validation',
        captures,
    }, null, 2)}\n`);
} finally {
    await browser?.close();
    await server?.close();
}
