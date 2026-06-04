import { describe, expect, it } from 'vitest';

import * as rootExports from '../src/index.js';
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
        for (const variant of Object.keys(VARIANT_META)) {
            const variantIcons = /** @type {any} */ (rootExports)[variant];
            expect(variantIcons, `missing namespace "${variant}"`).toBeTruthy();
            expect(variantIcons['bars-3'], `${variant}['bars-3'] missing`).toBeTruthy();
        }
    });

    it('re-exports serialize from ./serialize.js', () => {
        expect(typeof rootExports.serialize).toBe('function');
    });
});

for (const variant of Object.keys(VARIANT_META)) {
    const variantMeta = VARIANT_META[variant];

    describe(`@neon-kit/icons/${variant} aggregate`, () => {
        it(`exposes all 18 ${variant} icons via default map`, async () => {
            const variantModule = await import(`../src/${variant}/index.js`);
            for (const name of NAMES) {
                const icon = variantModule.default[name];
                expect(icon, `missing "${name}" in ${variant} default map`).toBeTruthy();
                expect(icon.viewBox).toBe(variantMeta.viewBox);
                expect(icon.attrs).toBeTruthy();
                expect(icon.attrs.fill).toBe(variantMeta.shellFill);
                if (variantMeta.shellStroke) {
                    expect(icon.attrs.stroke).toBe(variantMeta.shellStroke);
                }
                expect(Array.isArray(icon.paths)).toBe(true);
                expect(icon.paths.length).toBeGreaterThan(0);
                const firstIconPath = icon.paths[0];
                expect(typeof firstIconPath.d).toBe('string');
                expect(firstIconPath.d.length).toBeGreaterThan(0);
                for (const [attrName, attrValue] of Object.entries(variantMeta.pathAttrs)) {
                    expect(firstIconPath.attrs[attrName]).toBe(attrValue);
                }
            }
        });
    });
}

describe('subpath import shape', () => {
    it('outline/bars-3 default import has correct shape', async () => {
        /** @type {{ default: import('../src/types.js').IconDef }} */
        const barsIconModule = await import('../src/outline/bars-3.js');
        expect(barsIconModule.default.viewBox).toBe('0 0 24 24');
        expect(barsIconModule.default.attrs).toEqual({ fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' });
        expect(barsIconModule.default.paths[0].d).toContain('M');
        expect(barsIconModule.default.paths[0].attrs).toEqual({ 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    });

    it('solid/bars-3 default import has correct shape', async () => {
        const barsIconModule = await import('../src/solid/bars-3.js');
        expect(barsIconModule.default.attrs).toEqual({ fill: 'currentColor' });
        expect(barsIconModule.default.paths[0].attrs).toEqual({ 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' });
    });

    it('mini/bars-3 has the 20×20 viewBox', async () => {
        const barsIconModule = await import('../src/mini/bars-3.js');
        expect(barsIconModule.default.viewBox).toBe('0 0 20 20');
    });

    it('micro/bars-3 has the 16×16 viewBox', async () => {
        const barsIconModule = await import('../src/micro/bars-3.js');
        expect(barsIconModule.default.viewBox).toBe('0 0 16 16');
    });
});

describe('serialize()', () => {
    it('emits an <svg> with xmlns, viewBox, and at least one <path>', async () => {
        const barsIconModule = await import('../src/outline/bars-3.js');
        const svgText = serialize(barsIconModule.default);
        expect(svgText.startsWith('<svg ')).toBe(true);
        expect(svgText).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(svgText).toContain(`viewBox="${barsIconModule.default.viewBox}"`);
        expect(svgText).toMatch(/<path [^/]*d="[^"]+"[^/]*\/>/);
    });

    it('round-trips through DOMParser with matching attrs', async () => {
        const cogIconModule = await import('../src/solid/cog-6-tooth.js');
        const iconDef = cogIconModule.default;
        const parsedSvgDocument = new DOMParser().parseFromString(serialize(iconDef), 'image/svg+xml');
        const svgElement = parsedSvgDocument.documentElement;
        expect(svgElement.tagName.toLowerCase()).toBe('svg');
        expect(svgElement.getAttribute('viewBox')).toBe(iconDef.viewBox);
        for (const [attrName, attrValue] of Object.entries(iconDef.attrs)) {
            expect(svgElement.getAttribute(attrName)).toBe(attrValue);
        }
        const pathElements = Array.from(svgElement.querySelectorAll('path'));
        expect(pathElements.length).toBe(iconDef.paths.length);
        for (let pathIndex = 0; pathIndex < pathElements.length; pathIndex += 1) {
            expect(pathElements[pathIndex].getAttribute('d')).toBe(iconDef.paths[pathIndex].d);
            for (const [attrName, attrValue] of Object.entries(iconDef.paths[pathIndex].attrs)) {
                expect(pathElements[pathIndex].getAttribute(attrName)).toBe(attrValue);
            }
        }
    });

    it('honors ariaLabel by emitting <title> + role="img"', async () => {
        const barsIconModule = await import('../src/outline/bars-3.js');
        const svgText = serialize(barsIconModule.default, { ariaLabel: 'Open menu' });
        expect(svgText).toContain('role="img"');
        expect(svgText).not.toContain('aria-hidden');
        expect(svgText).toContain('<title>Open menu</title>');
    });

    it('passes numeric size through as pixels', async () => {
        const barsIconModule = await import('../src/outline/bars-3.js');
        const svgText = serialize(barsIconModule.default, { size: 24 });
        expect(svgText).toContain('width="24px"');
        expect(svgText).toContain('height="24px"');
    });
});
