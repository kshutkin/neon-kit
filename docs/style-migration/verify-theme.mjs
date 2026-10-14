import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
    cp,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    writeFile,
    realpath,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { chromium, firefox } from 'playwright';
import { build, createServer, preview } from 'vite';
import { styleBuild } from '@neon-kit/vite-plugin-style-build';

const repository = resolve(import.meta.dirname, '../..');
const execute = promisify(execFile);
const require = createRequire(resolve(repository, 'package.json'));
const directory = await realpath(
    await mkdtemp(resolve(tmpdir(), 'neon-theme-proof-'))
);
const app = resolve(directory, 'app');
const reports = resolve(process.argv[2] ?? resolve(directory, 'reports'));
await mkdir(app);
await mkdir(reports, { recursive: true });

async function pack(name) {
    const source = resolve(repository, name);
    const staged = resolve(directory, name);
    await mkdir(staged);
    const metadata = JSON.parse(
        await readFile(resolve(source, 'package.json'), 'utf8')
    );
    for (const file of metadata.files) {
        if (file === './*.css') {
            for (const entry of (await readdir(source)).filter((entry) =>
                entry.endsWith('.css')
            )) {
                await cp(resolve(source, entry), resolve(staged, entry));
            }
        } else {
            await cp(resolve(source, file), resolve(staged, file), {
                recursive: true,
            });
        }
    }
    await writeFile(resolve(staged, 'package.json'), JSON.stringify(metadata));
    await execute(resolve(repository, 'node_modules/.bin/pkgprn'), [], {
        cwd: staged,
    });
    const result = await execute(
        'npm',
        ['pack', '--ignore-scripts', '--json', '--pack-destination', directory],
        { cwd: staged }
    );
    return resolve(directory, JSON.parse(result.stdout)[0].filename);
}

const packages = await Promise.all(['theme', 'theme-vanilla'].map(pack));
await writeFile(
    resolve(app, 'package.json'),
    '{"private":true,"type":"module"}'
);
await execute(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...packages],
    { cwd: app }
);
const packed = JSON.parse(
    await readFile(
        resolve(app, 'node_modules/@neon-kit/theme-vanilla/package.json'),
        'utf8'
    )
);
assert.equal(packed.dependencies, undefined);
for (const target of Object.values(packed.exports)) {
    await readFile(
        resolve(app, 'node_modules/@neon-kit/theme-vanilla', target)
    );
}
const theme = JSON.parse(
    await readFile(
        resolve(app, 'node_modules/@neon-kit/theme/package.json'),
        'utf8'
    )
);
for (const target of Object.values(theme.exports)) {
    await readFile(resolve(app, 'node_modules/@neon-kit/theme', target));
}
const markup =
    '<button id="probe" class="btn">Default</button><button class="btn cta">Primary</button><input class="input" placeholder="Value"><nav class="nav -segmented"><button class="nav__item -active">Selected</button></nav>';
const link = (entry) =>
    `<link rel="stylesheet" href="/node_modules/@neon-kit/theme-vanilla/${packed.exports[
        `./${entry}.css`
    ].slice(2)}">`;
await writeFile(
    resolve(app, 'vanilla.html'),
    `<!doctype html>${link('index')}${markup}`
);
await writeFile(
    resolve(app, 'selected.html'),
    `<!doctype html>${link('tokens')}${link('theme')}${link('reset-normalize')}${link(
        'components/button'
    )}${link('components/forms')}${link('components/navigation')}${markup}`
);
await writeFile(
    resolve(app, 'reversed.html'),
    `<!doctype html>${link('components/navigation')}${link(
        'components/forms'
    )}${link('components/button')}${link('reset-normalize')}${link(
        'theme'
    )}${link('tokens')}${markup}`
);
await writeFile(
    resolve(app, 'modules.html'),
    '<!doctype html><script type="module" src="/modules.js"></script>'
);
await writeFile(
    resolve(app, 'modules.js'),
    `import button from '@neon-kit/theme/components/button.module.css';
import forms from '@neon-kit/theme/components/forms.module.css';
import nav from '@neon-kit/theme/components/nav.module.css';
document.body.innerHTML = '<button id="probe" class="' + button.btn + '">Default</button><input class="' + forms.input + '" placeholder="Value">';
window.classes = { button, forms, nav }; window.ready = true;`
);
await writeFile(
    resolve(app, 'native.html'),
    '<!doctype html><div id="first"></div><div id="second"></div><script type="module" src="/native.js"></script>'
);
await writeFile(
    resolve(app, 'native.js'),
    `import { btn, cta, sheets } from '@neon-kit/theme/components/button.module.css?neon';
import { sheets as base } from '@neon-kit/theme/shadow-base.css?neon';
for (const id of ['first', 'second']) {
    const root = document.getElementById(id).attachShadow({mode: 'open'});
    root.adoptedStyleSheets = [...new Set([...base, ...sheets])];
    root.innerHTML = '<button id="probe" class="' + btn + '">Default</button><button class="' + btn + ' ' + cta + '">Primary</button><div id="nested"></div>';
}
const nested = document.getElementById('first').shadowRoot.getElementById('nested').attachShadow({mode:'open'});
nested.adoptedStyleSheets = [...new Set([...base,...sheets])]; nested.innerHTML = '<button id="probe" class="' + btn + '">Nested</button>';
window.ready = true;`
);
await writeFile(
    resolve(app, 'switcher.js'),
    await readFile(resolve(repository, 'site/theme-switcher.js'))
);
await writeFile(
    resolve(app, 'switcher.html'),
    `<!doctype html>${link(
        'index'
    )}<style>.docs-hidden { display:none; }</style><theme-switcher></theme-switcher><script type="module" src="/switcher.js"></script>`
);
await writeFile(
    resolve(app, 'customization.html'),
    `<!doctype html>${link('index')}
    <div id="wrapper" style="--neon-menu-item-padding-inline: 27px; --neon-menu-item-padding-block: 11px; --neon-tooltip-open-delay: 123ms; --neon-tooltip-close-delay: 456ms; --neon-tooltip-max-inline-size: 213px; --color-primary: hotpink; --primary-hue: 45">
      <div class="menu"><button class="menu__item" id="row">Item</button></div>
      <button id="interest" interestfor="tip">Interest</button>
      <div id="tip" class="tooltip" popover>Tip</div>
      <button class="btn cta" id="primary">Primary</button>
      <span id="token" style="color: var(--neon-color-primary, var(--_color-primary))">Token</span>
    </div>`
);
const config = {
    root: app,
    configFile: false,
    logLevel: 'warn',
    plugins: [styleBuild()],
    build: {
        outDir: resolve(app, 'dist'),
        cssTarget: ['chrome128', 'firefox128'],
        rolldownOptions: {
            input: Object.fromEntries(
                [
                    'vanilla',
                    'selected',
                    'reversed',
                    'modules',
                    'native',
                    'switcher',
                    'customization',
                ].map((name) => [name, resolve(app, `${name}.html`)])
            ),
        },
    },
};
let development;
let production;
const browsers = [];
const checks = [];
const palettes = {};
const switcherChecks = [];
const customizationChecks = [];
const properties = [
    'backgroundColor',
    'color',
    'borderColor',
    'borderWidth',
    'borderRadius',
    'padding',
    'boxShadow',
    'textShadow',
];
try {
    development = await createServer({
        ...config,
        server: { host: '127.0.0.1', port: 0 },
    });
    await development.listen();
    await build(config);
    production = await preview({
        ...config,
        preview: { host: '127.0.0.1', port: 0 },
    });
    for (const engine of [chromium, firefox]) {
        const browser = await engine.launch({ headless: true });
        browsers.push(browser);
        for (const [phase, server] of [
            ['development', development],
            ['production', production],
        ]) {
            const origin = server.resolvedUrls.local[0];
            for (const mode of ['light', 'dark']) {
                const context = await browser.newContext({
                    colorScheme: mode,
                    reducedMotion: 'reduce',
                });
                const states = [];
                for (const entry of [
                    'vanilla',
                    'selected',
                    'reversed',
                    'modules',
                    'native',
                ]) {
                    const page = await context.newPage();
                    const errors = [];
                    page.on('pageerror', (error) => errors.push(error.message));
                    await page.goto(new URL(`${entry}.html`, origin).href);
                    if (['modules', 'native'].includes(entry)) {
                        await page.waitForFunction(() => window.ready);
                    }
                    await page.evaluate(
                        () =>
                            (document.documentElement.style.colorScheme =
                                'light dark')
                    );
                    const probe = page
                        .locator(
                            entry === 'native' ? '#first #probe' : '#probe'
                        )
                        .first();
                    const read = () =>
                        probe.evaluate(
                            (element, names) =>
                                Object.fromEntries(
                                    names.map((name) => [
                                        name,
                                        getComputedStyle(element)[name],
                                    ])
                                ),
                            properties
                        );
                    const idle = await read();
                    await probe.hover();
                    const hover = await read();
                    await probe.focus();
                    const focus = await probe.evaluate((element) => ({
                        color: getComputedStyle(element).outlineColor,
                        style: getComputedStyle(element).outlineStyle,
                    }));
                    await probe.evaluate((element) => {
                        element.blur();
                        element.disabled = true;
                    });
                    const disabled = await read();
                    states.push({ entry, idle, hover, focus, disabled });
                    assert.equal(
                        focus.style,
                        'solid',
                        `${entry}: focus outline`
                    );
                    if (entry === 'native') {
                        assert.ok(
                            await page.evaluate(
                                () =>
                                    document.querySelector('#first').shadowRoot
                                        .adoptedStyleSheets[0] ===
                                    document.querySelector('#second').shadowRoot
                                        .adoptedStyleSheets[0]
                            )
                        );
                        const automatic = idle.backgroundColor;
                        await page.mouse.move(1100, 700);
                        await probe.evaluate((element) => element.blur());
                        await page.evaluate(
                            () =>
                                (document.documentElement.style.colorScheme =
                                    'light')
                        );
                        await probe.evaluate(
                            (element) => (element.disabled = false)
                        );
                        const light = (await read()).backgroundColor;
                        await page.evaluate(
                            () =>
                                (document.documentElement.style.colorScheme =
                                    'dark')
                        );
                        const dark = (await read()).backgroundColor;
                        assert.notEqual(light, dark);
                        assert.equal(automatic, mode === 'dark' ? dark : light);
                        await page.evaluate(
                            () =>
                                (document.querySelector(
                                    '#first'
                                ).style.colorScheme = 'light')
                        );
                        assert.equal((await read()).backgroundColor, light);
                        assert.equal(
                            await page
                                .locator('#first #nested #probe')
                                .evaluate(
                                    (element) =>
                                        getComputedStyle(element)
                                            .backgroundColor
                                ),
                            light
                        );
                        await page.evaluate(() =>
                            document
                                .querySelector('#first')
                                .style.setProperty(
                                    '--neon-color-surface',
                                    'rgb(12 34 56)'
                                )
                        );
                        assert.equal(
                            (await read()).backgroundColor,
                            'rgb(12, 34, 56)'
                        );
                        await page.evaluate(() => {
                            document
                                .querySelector('#first')
                                .style.removeProperty('--neon-color-surface');
                            document
                                .querySelector('#first')
                                .style.removeProperty('color-scheme');
                            document.documentElement.style.removeProperty(
                                'color-scheme'
                            );
                        });
                        assert.equal(
                            (await read()).backgroundColor,
                            light,
                            'unstyled page remains light under either OS preference'
                        );
                    }
                    if (entry === 'vanilla' && phase === 'production') {
                        const baseline = JSON.parse(
                            await readFile(
                                resolve(
                                    repository,
                                    `docs/style-migration/baseline/${mode}/buttons.json`
                                ),
                                'utf8'
                            )
                        ).idle.tokens;
                        const palette = await page.evaluate((tokens) => {
                            const result = {};
                            const root = getComputedStyle(
                                document.documentElement
                            );
                            for (const [name, value] of Object.entries(
                                tokens
                            ).filter(
                                ([name, value]) =>
                                    name.startsWith('--color-') && value
                            )) {
                                const element = document.createElement('span');
                                document.body.append(element);
                                element.style.color = value;
                                const before = getComputedStyle(element).color;
                                const suffix = name
                                    .slice(2)
                                    .replace('color-neon-', 'color-');
                                const publicName = `--neon-${suffix}`;
                                const privateName = `--_${suffix}`;
                                if (!root.getPropertyValue(privateName).trim()) {
                                    throw new Error(
                                        `Missing token default ${privateName}`
                                    );
                                }
                                element.style.color = `var(${publicName}, var(${privateName}))`;
                                result[name] = {
                                    before,
                                    after: getComputedStyle(element).color,
                                };
                                element.remove();
                            }
                            return result;
                        }, baseline);
                        for (const [name, pair] of Object.entries(palette)) {
                            assert.equal(
                                pair.after,
                                pair.before,
                                `${engine.name()}/${mode}: ${name}`
                            );
                        }
                        palettes[`${engine.name()}-${mode}`] = palette;
                        await page.screenshot({
                            path: resolve(
                                reports,
                                `${engine.name()}-${mode}-vanilla.png`
                            ),
                        });
                    }
                    assert.deepEqual(errors, []);
                    await page.close();
                }
                for (const state of states.slice(1)) {
                    for (const kind of ['idle', 'hover', 'focus', 'disabled']) {
                        assert.deepEqual(
                            state[kind],
                            states[0][kind],
                            `${engine.name()}/${phase}/${mode}/${
                                state.entry
                            }/${kind}`
                        );
                    }
                }
                checks.push({
                    browser: engine.name(),
                    phase,
                    mode,
                    entries: states,
                });
                const page = await context.newPage();
                await page.goto(new URL('switcher.html', origin).href);
                await page.waitForSelector('.theme-toggle-btn');
                const scheme = () =>
                    page.evaluate(
                        () => document.documentElement.style.colorScheme
                    );
                assert.equal(await scheme(), 'light dark');
                assert.equal(
                    await page.evaluate(() => localStorage.getItem('theme')),
                    null
                );
                await page.locator('.theme-toggle-btn').click();
                await page.locator('.theme-toggle').click();
                assert.equal(await scheme(), 'light');
                await page.reload();
                await page.waitForSelector('.theme-toggle-btn');
                assert.equal(await scheme(), 'light');
                assert.equal(
                    await page.locator('.theme-toggle').textContent(),
                    'Theme: Light'
                );
                await page.locator('.theme-toggle-btn').click();
                await page.locator('.theme-toggle').click();
                assert.equal(await scheme(), 'dark');
                await page.locator('.theme-toggle').click();
                assert.equal(await scheme(), 'light dark');
                assert.equal(
                    await page.evaluate(() => localStorage.getItem('theme')),
                    'auto'
                );
                const surface = () =>
                    page.evaluate(
                        () => getComputedStyle(document.body).backgroundColor
                    );
                await page.emulateMedia({ colorScheme: 'light' });
                const lightSurface = await surface();
                await page.emulateMedia({ colorScheme: 'dark' });
                assert.notEqual(await surface(), lightSurface);
                for (const selector of [
                    '.primary-l-slider',
                    '.primary-c-slider',
                    '.primary-h-slider',
                ]) {
                    await page.locator(selector).evaluate((element) => {
                        element.value = '0';
                        element.dispatchEvent(new Event('input'));
                    });
                }
                assert.deepEqual(
                    await page
                        .locator('theme-switcher')
                        .evaluate((element) => element.getPrimaryColor()),
                    { l: 0, c: 0, h: 0 }
                );
                await page.reload();
                await page.waitForSelector('.theme-toggle-btn');
                assert.deepEqual(
                    await page
                        .locator('theme-switcher')
                        .evaluate((element) => element.getPrimaryColor()),
                    { l: 0, c: 0, h: 0 }
                );
                await page.locator('.theme-toggle-btn').click();
                await page.locator('.reset-primary-btn').click();
                assert.deepEqual(
                    await page
                        .locator('theme-switcher')
                        .evaluate((element) => element.getPrimaryColor()),
                    { l: 38, c: 0.2, h: 245 }
                );
                assert.equal(
                    await page.evaluate(() =>
                        document.documentElement.hasAttribute('data-theme')
                    ),
                    false
                );
                switcherChecks.push({
                    browser: engine.name(),
                    phase,
                    mode,
                    automatic: true,
                    forcedAndPersisted: true,
                    liveOsChange: true,
                    zeroValuesAndReset: true,
                });
                await page.close();
                const customization = await context.newPage();
                await customization.goto(
                    new URL('customization.html', origin).href
                );
                const customValues = await customization.evaluate(() => {
                    const row = getComputedStyle(
                        document.querySelector('#row')
                    );
                    const tooltip = getComputedStyle(
                        document.querySelector('#tip')
                    );
                    const primary = getComputedStyle(
                        document.querySelector('#primary')
                    ).backgroundColor;
                    return {
                        paddingInline: row.paddingInline,
                        paddingBlock: row.paddingBlock,
                        tooltipWidth: tooltip.maxInlineSize,
                        interestDelay: getComputedStyle(
                            document.querySelector('#interest')
                        )
                            .getPropertyValue('--interest-delay')
                            .trim()
                            .replace(/\s+/g, ' '),
                        primary,
                        expectedPrimary: getComputedStyle(
                            document.querySelector('#token')
                        ).color,
                    };
                });
                assert.equal(customValues.paddingInline, '27px');
                assert.equal(customValues.paddingBlock, '11px');
                assert.equal(customValues.tooltipWidth, '213px');
                assert.equal(customValues.interestDelay, '123ms 456ms');
                assert.equal(
                    customValues.primary,
                    customValues.expectedPrimary,
                    'legacy generic inputs do not collide with public Neon variables'
                );
                await customization.evaluate(() =>
                    document.documentElement.style.setProperty(
                        '--neon-primary-hue',
                        '315'
                    )
                );
                assert.notEqual(
                    await customization
                        .locator('#primary')
                        .evaluate(
                            (element) =>
                                getComputedStyle(element).backgroundColor
                        ),
                    customValues.primary
                );
                customizationChecks.push({
                    browser: engine.name(),
                    phase,
                    mode,
                    ...customValues,
                    inheritedPublicSettings: true,
                    rootPrimaryOverride: true,
                });
                await customization.close();
                await context.close();
            }
        }
        console.log(
            `${engine.name()}: packed aggregate, selective, ordinary CSS Modules and native sheets passed`
        );
    }
    await writeFile(
        resolve(reports, 'summary.json'),
        `${JSON.stringify(
            {
                packages: ['theme', 'theme-vanilla'],
                consumer: 'isolated npm tarballs after pkgprn prepack',
                checks,
                palettes,
                switcherChecks,
                customizationChecks,
                browsers: browsers.map((browser) => ({
                    engine: browser.browserType().name(),
                    version: browser.version(),
                })),
                vite: require('vite/package.json').version,
            },
            null,
            2
        )}\n`
    );
    console.log(`Theme proof passed: ${reports}`);
} finally {
    await Promise.all(browsers.map((browser) => browser.close()));
    await development?.close();
    await production?.httpServer.close();
}
