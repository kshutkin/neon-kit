import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import bars from '@neon-kit/icons/outline/bars-3';
import xMark from '@neon-kit/icons/outline/x-mark';
import barsSolid from '@neon-kit/icons/solid/bars-3';
import check from '@neon-kit/icons/solid/check';
import { serialize } from '@neon-kit/icons';

// Side-effect import registers `<neon-icon>`.
import { NeonIconElement, registerIcon, setIconLoader } from '../src/icon.js';

/** @typedef {import('@neon-kit/icons').IconDef} IconDef */

// Vite (and vitest browser mode) can't resolve a bare specifier from
// a dynamic import. Wire a workspace-relative `import.meta.glob`
// loader for the test run.
const iconModules = /** @type {Record<string, () => Promise<IconDef>>} */ (
    import.meta.glob('../../icons/src/{outline,solid,mini,micro}/*.js', { import: 'default' })
);
setIconLoader(async (name) => {
    const key = `../../icons/src/${name}.js`;
    const factory = iconModules[key];
    if (!factory) throw new Error(`Unknown icon "${name}"`);
    return factory();
});

/** Wait for the element's async load + paint to settle. */
async function settle() {
    for (let i = 0; i < 20; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

describe('<neon-icon>', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('registers as an autonomous custom element', () => {
        expect(customElements.get('neon-icon')).toBeTruthy();
    });

    it('renders the assigned `icon` property synchronously', async () => {
        const el = /** @type {NeonIconElement} */ (document.createElement('neon-icon'));
        document.body.appendChild(el);
        el.icon = bars;
        // Property setter is synchronous; no await needed.
        const svg = el.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
        expect(svg?.getAttribute('stroke')).toBe('currentColor');
    });

    it('dynamic-loads via `name` attribute', async () => {
        document.body.innerHTML = `<neon-icon name="outline/bars-3"></neon-icon>`;
        await settle();
        const svg = /** @type {SVGSVGElement | null} */ (document.querySelector('neon-icon > svg'));
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
        expect(svg?.getAttribute('stroke')).toBe('currentColor');
    });

    it('property takes precedence over `name` attribute', async () => {
        const el = /** @type {NeonIconElement} */ (document.createElement('neon-icon'));
        el.setAttribute('name', 'outline/bars-3');
        document.body.appendChild(el);
        el.icon = xMark;
        await settle();
        const path = el.querySelector('svg > path');
        expect(path?.getAttribute('d')).toBe(xMark.paths[0].d);
    });

    it('clearing the property falls back to `name` loading', async () => {
        const el = /** @type {NeonIconElement} */ (document.createElement('neon-icon'));
        document.body.appendChild(el);
        el.icon = xMark;
        el.icon = null;
        el.setAttribute('name', 'outline/bars-3');
        await settle();
        const path = el.querySelector('svg > path');
        expect(path?.getAttribute('d')).toBe(bars.paths[0].d);
    });

    it('only the latest name renders on rapid changes', async () => {
        const el = /** @type {NeonIconElement} */ (document.createElement('neon-icon'));
        document.body.appendChild(el);
        el.setAttribute('name', 'outline/bars-3');
        el.setAttribute('name', 'solid/check');
        await settle();
        // Give both promises a chance to resolve in either order.
        await settle();
        const svg = el.querySelector('svg');
        expect(svg?.getAttribute('fill')).toBe('currentColor');
        const path = svg?.querySelector('path');
        expect(path?.getAttribute('d')).toBe(check.paths[0].d);
    });

    it('warns and renders nothing for a bad name', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            document.body.innerHTML = `<neon-icon name="nonexistent/does-not-exist"></neon-icon>`;
            await settle();
            await settle();
            const host = /** @type {HTMLElement} */ (document.querySelector('neon-icon'));
            expect(host.querySelector('svg')).toBeNull();
            expect(warn).toHaveBeenCalled();
            const firstArg = warn.mock.calls[0]?.[0];
            expect(String(firstArg)).toContain('nonexistent/does-not-exist');
        } finally {
            warn.mockRestore();
        }
    });

    it('applies `size` as a pixel width', async () => {
        document.body.innerHTML = `<neon-icon name="outline/bars-3" size="32"></neon-icon>`;
        await settle();
        const svg = /** @type {SVGSVGElement} */ (document.querySelector('neon-icon > svg'));
        expect(svg.getAttribute('width')).toBe('32px');
        expect(svg.getAttribute('height')).toBe('32px');
    });

    it('uses `aria-label` to emit a <title> and role="img"', async () => {
        document.body.innerHTML = `<neon-icon name="outline/bars-3" aria-label="Open menu"></neon-icon>`;
        await settle();
        const svg = /** @type {SVGSVGElement} */ (document.querySelector('neon-icon > svg'));
        expect(svg.getAttribute('role')).toBe('img');
        expect(svg.hasAttribute('aria-hidden')).toBe(false);
        expect(svg.querySelector('title')?.textContent).toBe('Open menu');
    });

    it('registerIcon() is idempotent', () => {
        expect(() => {
            registerIcon();
            registerIcon();
        }).not.toThrow();
    });

    it('caches loader promises by name across instances', async () => {
        const stub = /** @type {IconDef} */ ({
            viewBox: '0 0 10 10',
            paths: [{ d: 'M0 0h10v10H0z' }],
        });
        const spy = vi.fn(async () => stub);
        setIconLoader(spy);
        try {
            const a = document.createElement('neon-icon');
            const b = document.createElement('neon-icon');
            a.setAttribute('name', 'stub/one');
            b.setAttribute('name', 'stub/one');
            document.body.append(a, b);
            await settle();
            expect(spy).toHaveBeenCalledTimes(1);
            expect(a.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 10 10');
            expect(b.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 10 10');
        } finally {
            setIconLoader(async (name) => {
                const key = `../../icons/src/${name}.js`;
                const factory = iconModules[key];
                if (!factory) throw new Error(`Unknown icon "${name}"`);
                return factory();
            });
        }
    });

    it('matches serialize() output structurally', async () => {
        const el = /** @type {NeonIconElement} */ (document.createElement('neon-icon'));
        el.setAttribute('size', '20');
        document.body.appendChild(el);
        el.icon = barsSolid;
        const live = /** @type {SVGSVGElement} */ (el.querySelector('svg'));
        const str = serialize(barsSolid, { size: 20 });
        const parsed = new DOMParser().parseFromString(str, 'image/svg+xml').documentElement;

        live.removeAttribute('data-neon-icon');

        const liveAttrs = Object.fromEntries(Array.from(live.attributes).map((a) => [a.name, a.value]));
        const parsedAttrs = Object.fromEntries(Array.from(parsed.attributes).map((a) => [a.name, a.value]));
        expect(parsedAttrs).toEqual(liveAttrs);

        const livePaths = Array.from(live.querySelectorAll('path'));
        const parsedPaths = Array.from(parsed.querySelectorAll('path'));
        expect(parsedPaths.length).toBe(livePaths.length);
        for (let i = 0; i < livePaths.length; i += 1) {
            const la = Object.fromEntries(Array.from(livePaths[i].attributes).map((a) => [a.name, a.value]));
            const pa = Object.fromEntries(Array.from(parsedPaths[i].attributes).map((a) => [a.name, a.value]));
            expect(pa).toEqual(la);
        }
    });
});
