import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import bars from '@neon-kit/icons/outline/bars-3';
import xMark from '@neon-kit/icons/outline/x-mark';
import barsSolid from '@neon-kit/icons/solid/bars-3';
import check from '@neon-kit/icons/solid/check';
import { serialize } from '@neon-kit/icons';

// Side-effect import registers `<neon-icon>`.
import '../src/icon.jsx';

/** @typedef {import('../src/icon.jsx').NeonIconElement} NeonIconElement */

/** @typedef {import('@neon-kit/icons').IconDef} IconDef */

// The component uses `import(/* @vite-ignore */ '@neon-kit/icons/<name>')`
// which is intentionally opaque to Vite. In vitest browser mode that
// dynamic specifier reaches the browser verbatim and fails to resolve,
// so we mirror the docs-site adapter: pre-assign `el.icon` from an
// `import.meta.glob` lookup before the component's inline import fires.
//
// Consequence: the hydrator below pre-empts the component's inline
// `import('@neon-kit/icons/${name}')`, so the inline-import success
// path is intentionally NOT covered in browser-mode tests. It is
// exercised end-to-end via the docs site build and by Node-ESM
// consumers that resolve bare specifiers natively.
const iconModules = /** @type {Record<string, () => Promise<{ default: IconDef }>>} */ (
    import.meta.glob('../../icons/src/{outline,solid,mini,micro}/*.js')
);
/** @type {Map<string, () => Promise<{ default: IconDef }>>} */
const iconLookup = new Map();
for (const [path, load] of Object.entries(iconModules)) {
    const m = path.match(/\/(outline|solid|mini|micro)\/([^/]+)\.js$/);
    if (!m) continue;
    if (m[2] === 'index' || m[2] === '_variant') continue;
    iconLookup.set(`${m[1]}/${m[2]}`, load);
}
/** @param {Element} el */
function hydrateIcon(el) {
    if (el.tagName !== 'NEON-ICON') return;
    const name = el.getAttribute('name');
    if (!name) return;
    const load = iconLookup.get(name);
    if (!load) return;
    load().then((mod) => {
        if (el.getAttribute('name') === name && !(/** @type {any} */ (el).icon)) {
            /** @type {any} */ (el).icon = mod.default;
        }
    });
}
const iconObserver = new MutationObserver((records) => {
    for (const record of records) {
        for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue;
            if (node.tagName === 'NEON-ICON') hydrateIcon(node);
            if (node.querySelectorAll) {
                for (const el of node.querySelectorAll('neon-icon')) hydrateIcon(el);
            }
        }
        if (record.type === 'attributes' && record.target instanceof Element) {
            hydrateIcon(record.target);
        }
    }
});
iconObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['name'],
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

    it('renders the assigned `icon` property', async () => {
        const el = /** @type {NeonIconElement} */ (document.createElement('neon-icon'));
        document.body.appendChild(el);
        el.icon = bars;
        // Paint settles on a microtask.
        await settle();
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

    it('renders SVG at 1em × 1em', async () => {
        document.body.innerHTML = `<neon-icon name="outline/bars-3"></neon-icon>`;
        await settle();
        const svg = /** @type {SVGSVGElement} */ (document.querySelector('neon-icon > svg'));
        expect(svg.getAttribute('width')).toBe('1em');
        expect(svg.getAttribute('height')).toBe('1em');
    });

    it('uses `aria-label` to emit a <title> and role="img"', async () => {
        document.body.innerHTML = `<neon-icon name="outline/bars-3" aria-label="Open menu"></neon-icon>`;
        await settle();
        const svg = /** @type {SVGSVGElement} */ (document.querySelector('neon-icon > svg'));
        expect(svg.getAttribute('role')).toBe('img');
        expect(svg.hasAttribute('aria-hidden')).toBe(false);
        expect(svg.querySelector('title')?.textContent).toBe('Open menu');
    });

    it('matches serialize() output structurally', async () => {
        const el = /** @type {NeonIconElement} */ (document.createElement('neon-icon'));
        document.body.appendChild(el);
        el.icon = barsSolid;
        await settle();
        const live = /** @type {SVGSVGElement} */ (el.querySelector('svg'));
        const str = serialize(barsSolid);
        const parsed = new DOMParser().parseFromString(str, 'image/svg+xml').documentElement;

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

    it('reflects name/aria-label/title properties to attributes', async () => {
        const el = /** @type {NeonIconElement} */ (document.createElement('neon-icon'));
        document.body.appendChild(el);

        el.name = 'outline/x-mark';
        /** @type {any} */ (el)['aria-label'] = 'Close';
        el.title = 'Dismiss';
        await settle();
        expect(el.getAttribute('name')).toBe('outline/x-mark');
        expect(el.getAttribute('aria-label')).toBe('Close');
        expect(el.getAttribute('title')).toBe('Dismiss');

        // Empty string removes the attribute (legacy behavior).
        el.name = '';
        /** @type {any} */ (el)['aria-label'] = '';
        el.title = '';
        await settle();
        expect(el.hasAttribute('name')).toBe(false);
        expect(el.hasAttribute('aria-label')).toBe(false);
        expect(el.hasAttribute('title')).toBe(false);
    });

    it('renders nothing when neither `name` nor `icon` is set', async () => {
        const el = /** @type {NeonIconElement} */ (document.createElement('neon-icon'));
        document.body.appendChild(el);
        await settle();
        expect(el.querySelector('svg')).toBeNull();
    });

    it('renders an `IconDef` that omits `attrs` on the def and on its paths', async () => {
        const el = /** @type {NeonIconElement} */ (document.createElement('neon-icon'));
        document.body.appendChild(el);
        el.icon = /** @type {IconDef} */ ({
            viewBox: '0 0 24 24',
            paths: [{ d: 'M4 4h16v16H4z' }],
        });
        await settle();
        const svg = el.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
        const path = svg?.querySelector('path');
        expect(path?.getAttribute('d')).toBe('M4 4h16v16H4z');
        // The path has no `attrs`, so only `d` is set on it.
        expect(path?.getAttributeNames()).toEqual(['d']);
    });
});
