import { describe, expect, it } from 'vitest';
import { compileStyle, createStyleDeclaration, rewriteStyleUrls } from '../src/index.js';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

const sources = new Map([
    ['/styles/theme.css', ':host { --border-color: var(--app-border-color, rebeccapurple); }'],
    ['/styles/border.module.css', '@import "./theme.css"; .border { border: 1px solid var(--border-color); }'],
    ['/styles/link.module.css', '.link { composes: border from "./border.module.css"; animation: enter 180ms ease; } @keyframes enter { from { opacity: 0; } to { opacity: 1; } }'],
    ['/styles/card.module.css', '.card { composes: border from "./border.module.css"; padding: 1rem; }'],
]);

function createHost(files = sources) {
    return {
        async read(id) {
            const source = files.get(id);
            if (source === undefined) {
                throw new Error(`Missing source ${id}`);
            }
            return source;
        },
        async resolve(specifier, importer) {
            return new URL(specifier, `file://${importer}`).pathname;
        },
    };
}

describe('compileStyle()', () => {
    it('keeps shared and leaf assets separate and expands composed classes', async () => {
        const link = await compileStyle('/styles/link.module.css', createHost());
        const card = await compileStyle('/styles/card.module.css', createHost());

        expect(link.map((module) => module.id)).toEqual([
            '/styles/theme.css', '/styles/border.module.css', '/styles/link.module.css',
        ]);
        expect(card.map((module) => module.id)).toEqual([
            '/styles/theme.css', '/styles/border.module.css', '/styles/card.module.css',
        ]);
        expect(link[1].css).toBe(card[1].css);
        expect(link[1].exports.border).toBe(card[1].exports.border);
        expect(link[2].exports.link).toBe(`${link[2].exports.link.split(' ')[0]} ${link[1].exports.border}`);
        expect(link[2].css).toContain('@keyframes');
        expect(link[2].exports).not.toHaveProperty('enter');
        expect(link[0].css).toContain('--app-border-color');
        for (const module of link) {
            expect(module.css).not.toMatch(/@import|composes:/);
        }
    });

    it('reports missing composed exports', async () => {
        const files = new Map(sources);
        files.set('/styles/broken.module.css', '.broken { composes: missing from "./border.module.css"; }');
        await expect(compileStyle('/styles/broken.module.css', createHost(files)))
            .rejects.toThrow('missing composed export missing');
    });

    it('rejects dependency cycles and conditional imports', async () => {
        const files = new Map([
            ['/styles/a.css', '@import "./b.css";'],
            ['/styles/b.css', '@import "./a.css";'],
            ['/styles/conditional.css', '@import "./b.css" screen;'],
            ['/styles/layered.css', '@import "./b.css" layer(theme);'],
        ]);
        await expect(compileStyle('/styles/a.css', createHost(files))).rejects.toThrow('CSS dependency cycle');
        await expect(compileStyle('/styles/conditional.css', createHost(files))).rejects.toThrow('unsupported @import');
        await expect(compileStyle('/styles/layered.css', createHost(files))).rejects.toThrow('unsupported @import');
    });

    it('reports URL assets and leaves their references in emitted CSS', async () => {
        const files = new Map([['/styles/image.module.css', '.image { background: url("./image.png"); }']]);
        const [module] = await compileStyle('/styles/image.module.css', createHost(files));
        expect(module.assets).toEqual(['./image.png']);
        expect(module.css).toContain('url("./image.png")');
        expect(module.urls[0]).toMatchObject({ url: './image.png', loc: { filePath: '/styles/image.module.css' } });
        expect(module.map).toBeUndefined();
    });

    it('preserves authored import order instead of alphabetizing the cascade', async () => {
        const files = new Map([
            ['/styles/entry.css', '@import "./z.css"; @import "./a.css"; @import "./z.css";'],
            ['/styles/z.css', 'button { color: red; }'],
            ['/styles/a.css', 'button { color: blue; }'],
        ]);
        const modules = await compileStyle('/styles/entry.css', createHost(files));
        expect(modules.map((module) => module.id)).toEqual(['/styles/z.css', '/styles/a.css', '/styles/entry.css']);
    });

    it('maps rewritten URL rules to the authored source with unchanged source text', async () => {
        const source = '.image {\n  background-image: url("./image.png?v=1#icon");\n  color: red;\n}';
        const [module] = await compileStyle('/styles/image.module.css', createHost(new Map([
            ['/styles/image.module.css', source],
        ])), { sourceMap: true, projectRoot: '/styles' });
        const output = rewriteStyleUrls(module, { './image.png?v=1#icon': './image.abc.png?v=1#icon' });
        expect(output.css).toContain('./image.abc.png?v=1#icon');
        const map = new TraceMap(output.map);
        const position = originalPositionFor(map, { line: 1, column: 0 });
        expect(position.line).toBe(1);
        expect(map.sourcesContent).toEqual([source]);
        expect(map.sources).toEqual(['image.module.css']);
        expect(module.urls[0].placeholder).not.toBe('./image.png?v=1#icon');
    });

    it('generates native-sheet types with exact class exports and relative suffix patterns', () => {
        const module = { exports: { button: 'generated', 'button-label': 'generated-label' } };
        expect(createStyleDeclaration('@neon-kit/theme/button.module.css?neon', module)).toContain('declare module "@neon-kit/theme/button.module.css?neon"');
        expect(createStyleDeclaration('./button.module.css?neon', module)).toContain('declare module "*/button.module.css?neon"');
        expect(createStyleDeclaration('./button.module.css?neon', module)).toContain('as "button-label"');
        expect(createStyleDeclaration('./button.module.css?neon', module)).toContain('sheets: CSSStyleSheet[]');
        expect(() => createStyleDeclaration('./button.css?neon', { exports: { sheets: 'bad' } })).toThrow('reserved');
    });
});
