import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    mkdtemp,
    mkdir,
    readFile,
    readdir,
    writeFile,
    rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { buildVanilla } from '../scripts/build.mjs';
import { catalogue } from '../scripts/catalogue.mjs';

const theme = dirname(
    new URL('../../theme/package.json', import.meta.url).pathname
);

function readRootDefaults(stylesheet) {
    const defaults = [];
    stylesheet.walkDecls((declaration) => {
        if (
            declaration.prop.startsWith('--') &&
            !declaration.prop.startsWith('--neon-') &&
            declaration.parent.type === 'rule' &&
            declaration.parent.selector.includes(':root')
        ) {
            defaults.push([declaration.prop, declaration.value]);
        }
    });
    return defaults;
}

test('complete and selective outputs contain only mapped public classes and native CSS', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'neon-vanilla-build-'));
    try {
        await buildVanilla(theme, directory);
        const names = new Set(
            catalogue.flatMap(([, roles]) => Object.values(roles))
        );
        const files = [
            ...(await readdir(directory)),
            ...(await readdir(resolve(directory, 'components'))).map(
                (name) => `components/${name}`
            ),
        ];
        const tokens = postcss.parse(
            await readFile(resolve(directory, 'tokens.css'), 'utf8')
        );
        const defaults = readRootDefaults(tokens);
        assert.ok(defaults.some(([name]) => name === '--font-sans'));
        assert.ok(defaults.some(([name]) => name === '--spacing'));
        tokens.walkDecls((declaration) => {
            assert.ok(
                declaration.prop.startsWith('--'),
                `tokens.css must not apply document styling: ${declaration.prop}`
            );
        });
        for (const file of files.filter((name) => name.endsWith('.css'))) {
            const css = await readFile(resolve(directory, file), 'utf8');
            assert.doesNotMatch(
                css,
                /@import|@apply|@theme|@utility|composes:|--tw-|--neon-spacing\(|--theme\(/
            );
            const stylesheet = postcss.parse(css);
            assert.deepEqual(
                readRootDefaults(stylesheet),
                ['tokens.css', 'index.css'].includes(file) ? defaults : [],
                `${file}: token defaults belong only in the shared base and aggregate`
            );
            stylesheet.walkRules((rule) => {
                selectorParser()
                    .astSync(rule.selector)
                    .walkClasses((node) => {
                        assert.ok(
                            names.has(node.value),
                            `${file}: unexpected class ${node.value}`
                        );
                    });
            });
        }
        const buttons = await readFile(
            resolve(directory, 'components/button.css'),
            'utf8'
        );
        assert.match(buttons, /\.btn/);
        assert.match(buttons, /:focus-visible/);
        assert.match(buttons, /:disabled/);
        assert.doesNotMatch(buttons, /\.menu|\.input|\.foil|@keyframes/);
        const pickers = await readFile(
            resolve(directory, 'components/pickers.css'),
            'utf8'
        );
        assert.match(pickers, /\.input/);
        assert.match(pickers, /\.combobox__option/);
        assert.match(pickers, /\.datepicker/);
        assert.match(pickers, /\.timepicker/);
        assert.match(pickers, /:has\(\.datepicker__input:disabled\)/);
        assert.match(pickers, /:has\(\.timepicker__input:disabled\)/);
        const effects = await readFile(
            resolve(directory, 'effects.css'),
            'utf8'
        );
        assert.match(effects, /@keyframes/);
        assert.match(effects, /\.border-foil/);
        assert.match(effects, /--neon-glow-color/);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('independent public owners conflict; composition re-exports are accepted', async () => {
    const directory = await mkdtemp(
        resolve(tmpdir(), 'neon-vanilla-conflict-')
    );
    try {
        await assert.rejects(
            buildVanilla(theme, directory, [
                ['components/button.module.css', { btn: 'control' }],
                ['components/forms.module.css', { input: 'control' }],
            ]),
            /Conflicting public role control/
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('selective asset URLs resolve within the package and preserve query and fragment suffixes', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'neon-vanilla-assets-'));
    const source = resolve(directory, 'source');
    const output = resolve(directory, 'dist');
    try {
        await mkdir(resolve(source, 'components'), { recursive: true });
        await writeFile(
            resolve(source, 'theme.css'),
            ':root { color-scheme: light dark; }'
        );
        await writeFile(
            resolve(source, 'tokens.css'),
            ':root { --art-color: red; }'
        );
        await writeFile(resolve(source, 'reset-normalize.css'), '');
        await writeFile(
            resolve(source, 'components/icon.svg'),
            '<svg xmlns="http://www.w3.org/2000/svg"/>'
        );
        await writeFile(
            resolve(source, 'components/art.module.css'),
            '.art:hover { background: url("./icon.svg?test=1#mark"); }'
        );
        await buildVanilla(
            source,
            output,
            [['components/art.module.css', { art: 'picture' }]],
            { art: ['art'] }
        );
        for (const file of ['index.css', 'components/art.css']) {
            const css = await readFile(resolve(output, file), 'utf8');
            const url = /url\("?([^"\)]+)"?\)/.exec(css)[1];
            assert.ok(url.endsWith('?test=1#mark'));
            assert.equal(
                await readFile(
                    resolve(output, dirname(file), url.split('?')[0]),
                    'utf8'
                ),
                '<svg xmlns="http://www.w3.org/2000/svg"/>'
            );
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
