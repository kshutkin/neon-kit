import { describe, expect, it } from 'vitest';

import * as rootExports from '../src/index.js';
import { serialize } from '../src/serialize.js';

/** @type {Record<string, { width: number, height: number, shellFill: string, shellStroke?: string, pathAttrs: Record<string,string> }>} */
const VARIANT_META = {
    outline: {
        width: 24,
        height: 24,
        shellFill: 'none',
        shellStroke: 'currentColor',
        pathAttrs: { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    },
    solid: {
        width: 24,
        height: 24,
        shellFill: 'currentColor',
        pathAttrs: { 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' },
    },
    mini: {
        width: 20,
        height: 20,
        shellFill: 'currentColor',
        pathAttrs: { 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' },
    },
    micro: {
        width: 16,
        height: 16,
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
        it(`exposes every generated ${variant} icon via default map`, async () => {
            const variantModule = await import(`../src/${variant}/index.js`);
            const names = Object.keys(variantModule.default).sort();
            expect(names.length).toBeGreaterThan(300);
            for (const name of names) {
                const icon = variantModule.default[name];
                const [width, height, svgAttrs, pathAttrs, ...paths] = icon;
                expect(icon, `missing "${name}" in ${variant} default map`).toBeTruthy();
                expect(width).toBe(variantMeta.width);
                expect(height).toBe(variantMeta.height);
                expect(svgAttrs.fill).toBe(variantMeta.shellFill);
                if (variantMeta.shellStroke) {
                    expect(svgAttrs.stroke).toBe(variantMeta.shellStroke);
                }
                expect(pathAttrs).toEqual(variantMeta.pathAttrs);
                expect(paths.length).toBeGreaterThan(0);
                expect(typeof paths[0]).toBe('string');
                expect(paths[0].length).toBeGreaterThan(0);
            }
        });
    });
}

describe('subpath import shape', () => {
    it('keeps variant factory exports private except icon', async () => {
        for (const variant of Object.keys(VARIANT_META)) {
            const variantModule = await import(`../src/${variant}/_variant.js`);
            expect(Object.keys(variantModule)).toEqual(['icon']);
        }
    });

    it('outline/bars-3 default import has correct shape', async () => {
        /** @type {{ default: import('../src/types.js').IconDef }} */
        const barsIconModule = await import('../src/outline/bars-3.js');
        const [width, height, svgAttrs, pathAttrs, firstPath] = barsIconModule.default;
        expect(width).toBe(24);
        expect(height).toBe(24);
        expect(svgAttrs).toEqual({ fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' });
        expect(firstPath).toContain('M');
        expect(pathAttrs).toEqual({ 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    });

    it('solid/bars-3 default import has correct shape', async () => {
        const barsIconModule = await import('../src/solid/bars-3.js');
        const [, , svgAttrs, pathAttrs] = barsIconModule.default;
        expect(svgAttrs).toEqual({ fill: 'currentColor' });
        expect(pathAttrs).toEqual({ 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' });
    });

    it('includes icons even when another variant does not have that name', async () => {
        const outlineIconModule = await import('../src/outline/arrow-small-down.js');
        const miniIconModule = await import('../src/mini/arrow-small-down.js');
        expect(outlineIconModule.default[0]).toBe(24);
        expect(miniIconModule.default[0]).toBe(20);
    });

    it('mini/bars-3 has the 20×20 box', async () => {
        const barsIconModule = await import('../src/mini/bars-3.js');
        expect(barsIconModule.default[0]).toBe(20);
        expect(barsIconModule.default[1]).toBe(20);
    });

    it('micro/bars-3 has the 16×16 box', async () => {
        const barsIconModule = await import('../src/micro/bars-3.js');
        expect(barsIconModule.default[0]).toBe(16);
        expect(barsIconModule.default[1]).toBe(16);
    });
});

describe('serialize()', () => {
    it('emits an <svg> with xmlns, viewBox, and at least one <path>', async () => {
        const barsIconModule = await import('../src/outline/bars-3.js');
        const svgText = serialize(barsIconModule.default);
        expect(svgText.startsWith('<svg ')).toBe(true);
        expect(svgText).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(svgText).toContain('viewBox="0 0 24 24"');
        expect(svgText).toMatch(/<path [^/]*d="[^"]+"[^/]*\/>/);
    });

    it('round-trips through DOMParser with matching attrs', async () => {
        const cogIconModule = await import('../src/solid/cog-6-tooth.js');
        const iconDef = cogIconModule.default;
        const [width, height, svgAttrs, pathAttrs, ...paths] = iconDef;
        const parsedSvgDocument = new DOMParser().parseFromString(serialize(iconDef), 'image/svg+xml');
        const svgElement = parsedSvgDocument.documentElement;
        expect(svgElement.tagName.toLowerCase()).toBe('svg');
        expect(svgElement.getAttribute('viewBox')).toBe(`0 0 ${width} ${height}`);
        for (const [attrName, attrValue] of Object.entries(svgAttrs)) {
            expect(svgElement.getAttribute(attrName)).toBe(attrValue);
        }
        const pathElements = Array.from(svgElement.querySelectorAll('path'));
        expect(pathElements.length).toBe(iconDef.length - 4);
        for (let pathIndex = 0; pathIndex < pathElements.length; pathIndex += 1) {
            expect(pathElements[pathIndex].getAttribute('d')).toBe(paths[pathIndex]);
            for (const [attrName, attrValue] of Object.entries(pathAttrs)) {
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
