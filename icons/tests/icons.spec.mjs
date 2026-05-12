import { describe, expect, it } from 'vitest';

import * as root from '../src/index.js';
import { serialize } from '../src/serialize.js';

const NAMES = [
    'arrow-path',
    'bars-3',
    'calendar',
    'check',
    'chevron-down',
    'chevron-left',
    'chevron-right',
    'chevron-up',
    'clock',
    'cog-6-tooth',
    'exclamation-triangle',
    'information-circle',
    'magnifying-glass',
    'minus',
    'pencil',
    'plus',
    'trash',
    'x-mark',
];

/** @type {Record<string, { viewBox: string, shellFill: string, shellStroke?: string, pathAttrs: Record<string,string> }>} */
const VARIANT_META = {
    outline: {
        viewBox: '0 0 24 24',
        shellFill: 'none',
        shellStroke: 'currentColor',
        pathAttrs: { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    },
    solid: {
        viewBox: '0 0 24 24',
        shellFill: 'currentColor',
        pathAttrs: { 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' },
    },
    mini: {
        viewBox: '0 0 20 20',
        shellFill: 'currentColor',
        pathAttrs: { 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' },
    },
    micro: {
        viewBox: '0 0 16 16',
        shellFill: 'currentColor',
        pathAttrs: { 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' },
    },
};

describe('@neon-kit/icons root aggregate', () => {
    it('exposes the four variant default maps', () => {
        for (const v of Object.keys(VARIANT_META)) {
            const ns = /** @type {any} */ (root)[v];
            expect(ns, `missing namespace "${v}"`).toBeTruthy();
            expect(ns['bars-3'], `${v}['bars-3'] missing`).toBeTruthy();
        }
    });

    it('re-exports serialize from ./serialize.js', () => {
        expect(typeof root.serialize).toBe('function');
    });
});

for (const variant of Object.keys(VARIANT_META)) {
    const meta = VARIANT_META[variant];

    describe(`@neon-kit/icons/${variant} aggregate`, () => {
        it(`exposes all 18 ${variant} icons via default map`, async () => {
            const mod = await import(`../src/${variant}/index.js`);
            for (const name of NAMES) {
                const icon = mod.default[name];
                expect(icon, `missing "${name}" in ${variant} default map`).toBeTruthy();
                expect(icon.viewBox).toBe(meta.viewBox);
                expect(icon.attrs).toBeTruthy();
                expect(icon.attrs.fill).toBe(meta.shellFill);
                if (meta.shellStroke) expect(icon.attrs.stroke).toBe(meta.shellStroke);
                expect(Array.isArray(icon.paths)).toBe(true);
                expect(icon.paths.length).toBeGreaterThan(0);
                const p0 = icon.paths[0];
                expect(typeof p0.d).toBe('string');
                expect(p0.d.length).toBeGreaterThan(0);
                for (const [k, v] of Object.entries(meta.pathAttrs)) {
                    expect(p0.attrs[k]).toBe(v);
                }
            }
        });
    });
}

describe('subpath import shape', () => {
    it('outline/bars-3 default import has correct shape', async () => {
        /** @type {{ default: import('../src/types.js').IconDef }} */
        const mod = await import('../src/outline/bars-3.js');
        expect(mod.default.viewBox).toBe('0 0 24 24');
        expect(mod.default.attrs).toEqual({ fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' });
        expect(mod.default.paths[0].d).toContain('M');
        expect(mod.default.paths[0].attrs).toEqual({ 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    });

    it('solid/bars-3 default import has correct shape', async () => {
        const mod = await import('../src/solid/bars-3.js');
        expect(mod.default.attrs).toEqual({ fill: 'currentColor' });
        expect(mod.default.paths[0].attrs).toEqual({ 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' });
    });

    it('mini/bars-3 has the 20×20 viewBox', async () => {
        const mod = await import('../src/mini/bars-3.js');
        expect(mod.default.viewBox).toBe('0 0 20 20');
    });

    it('micro/bars-3 has the 16×16 viewBox', async () => {
        const mod = await import('../src/micro/bars-3.js');
        expect(mod.default.viewBox).toBe('0 0 16 16');
    });
});

describe('serialize()', () => {
    it('emits an <svg> with xmlns, viewBox, and at least one <path>', async () => {
        const mod = await import('../src/outline/bars-3.js');
        const str = serialize(mod.default);
        expect(str.startsWith('<svg ')).toBe(true);
        expect(str).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(str).toContain(`viewBox="${mod.default.viewBox}"`);
        expect(str).toMatch(/<path [^/]*d="[^"]+"[^/]*\/>/);
    });

    it('round-trips through DOMParser with matching attrs', async () => {
        const mod = await import('../src/solid/cog-6-tooth.js');
        const def = mod.default;
        const doc = new DOMParser().parseFromString(serialize(def), 'image/svg+xml');
        const svg = doc.documentElement;
        expect(svg.tagName.toLowerCase()).toBe('svg');
        expect(svg.getAttribute('viewBox')).toBe(def.viewBox);
        for (const [k, v] of Object.entries(def.attrs ?? {})) {
            expect(svg.getAttribute(k)).toBe(v);
        }
        const paths = Array.from(svg.querySelectorAll('path'));
        expect(paths.length).toBe(def.paths.length);
        for (let i = 0; i < paths.length; i += 1) {
            expect(paths[i].getAttribute('d')).toBe(def.paths[i].d);
            for (const [k, v] of Object.entries(def.paths[i].attrs ?? {})) {
                expect(paths[i].getAttribute(k)).toBe(v);
            }
        }
    });

    it('honors ariaLabel by emitting <title> + role="img"', async () => {
        const mod = await import('../src/outline/bars-3.js');
        const str = serialize(mod.default, { ariaLabel: 'Open menu' });
        expect(str).toContain('role="img"');
        expect(str).not.toContain('aria-hidden');
        expect(str).toContain('<title>Open menu</title>');
    });

    it('passes numeric size through as pixels', async () => {
        const mod = await import('../src/outline/bars-3.js');
        const str = serialize(mod.default, { size: 24 });
        expect(str).toContain('width="24px"');
        expect(str).toContain('height="24px"');
    });
});
