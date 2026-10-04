import { describe, expect, it } from 'vitest';
import { compileStyle } from '../src/index.js';

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
    });
});
