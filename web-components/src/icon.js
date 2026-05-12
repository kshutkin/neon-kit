/**
 * `<neon-icon>` — Light-DOM custom element that renders an icon as
 * inline SVG.
 *
 * Icon data lives in `@neon-kit/icons`; this element loads it on
 * demand via dynamic import, keyed by `<variant>/<icon-name>`:
 *
 *     <neon-icon name="outline/bars-3"></neon-icon>
 *     <neon-icon name="solid/x-mark" size="20" aria-label="Close"></neon-icon>
 *
 * For tree-shake-friendly use (or when the runtime can't resolve the
 * subpath dynamically), assign an `IconDef` to the `icon` property
 * directly — that takes precedence over `name`:
 *
 *     import bars from '@neon-kit/icons/outline/bars-3';
 *     const el = document.querySelector('neon-icon');
 *     el.icon = bars;
 *
 * If the default `await import(\`@neon-kit/icons/${name}\`)` doesn't
 * work in your bundler, swap the loader with `setIconLoader(fn)`.
 *
 * Per ADR 0001 the element renders into Light DOM (no shadow root).
 *
 * @import { IconDef } from '@neon-kit/icons'
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @typedef {(name: string) => Promise<IconDef>} IconLoader
 */

/** @type {IconLoader} */
const defaultLoader = async (name) => {
    // The dynamic specifier is intentional — see `setIconLoader` for
    // an override hook when a bundler can't resolve it statically.
    const mod = await import(/* @vite-ignore */ `@neon-kit/icons/${name}`);
    return mod.default;
};

/** @type {IconLoader} */
let loader = defaultLoader;

/**
 * Replace the default `import('@neon-kit/icons/<name>')` loader with
 * a custom function. Useful when the bundler can't analyze the
 * dynamic specifier (e.g. a Vite-backed site wiring an
 * `import.meta.glob` adapter). Clears the in-flight cache so the new
 * loader takes effect on next request.
 *
 * @param {IconLoader} fn
 */
export function setIconLoader(fn) {
    loader = fn;
    cache.clear();
}

/** @type {Map<string, Promise<IconDef>>} */
const cache = new Map();

/**
 * @param {string} name
 * @returns {Promise<IconDef>}
 */
function loadIcon(name) {
    let p = cache.get(name);
    if (!p) {
        p = loader(name);
        cache.set(name, p);
        // On failure, drop the cache entry so a retry can be attempted
        // (e.g. after a `setIconLoader` swap).
        p.catch(() => cache.delete(name));
    }
    return p;
}

/**
 * @param {string | null | undefined} raw
 * @returns {string}
 */
function parseSize(raw) {
    if (raw == null || raw === '') return '1em';
    const s = String(raw);
    return /^-?\d+(\.\d+)?$/.test(s.trim()) ? `${s.trim()}px` : s;
}

/**
 * @param {IconDef} def
 * @param {string} size
 * @param {string | null} ariaLabel
 * @returns {[string, string][]}
 */
function svgAttrEntries(def, size, ariaLabel) {
    /** @type {[string, string][]} */
    const entries = [
        ['xmlns', SVG_NS],
        ['viewBox', def.viewBox],
    ];
    if (def.attrs) for (const [k, v] of Object.entries(def.attrs)) entries.push([k, v]);
    entries.push(['width', size], ['height', size]);
    if (ariaLabel) entries.push(['role', 'img']);
    else entries.push(['aria-hidden', 'true']);
    return entries;
}

export class NeonIconElement extends HTMLElement {
    /** @type {IconDef | null} */
    #iconOverride = null;
    #renderToken = 0;

    static get observedAttributes() {
        return ['name', 'size', 'aria-label', 'title'];
    }

    connectedCallback() {
        this.#render();
    }

    /**
     * @param {string} _name
     * @param {string | null} _oldValue
     * @param {string | null} _newValue
     */
    attributeChangedCallback(_name, _oldValue, _newValue) {
        if (!this.isConnected) return;
        this.#render();
    }

    /** @returns {IconDef | null} */
    get icon() {
        return this.#iconOverride;
    }

    /** @param {IconDef | null | undefined} value */
    set icon(value) {
        this.#iconOverride = value || null;
        this.#render();
    }

    #render() {
        const token = ++this.#renderToken;
        const override = this.#iconOverride;
        if (override) {
            this.#paint(override);
            return;
        }
        const name = this.getAttribute('name');
        if (!name) {
            this.#paint(null);
            return;
        }
        loadIcon(name).then(
            (def) => {
                if (this.#renderToken !== token) return;
                this.#paint(def);
            },
            (error) => {
                if (this.#renderToken !== token) return;
                // eslint-disable-next-line no-console
                console.warn(`<neon-icon>: failed to load "${name}"`, error);
                this.#paint(null);
            },
        );
    }

    /** @param {IconDef | null} def */
    #paint(def) {
        const previous = this.querySelector(':scope > svg[data-neon-icon]');
        if (previous) previous.remove();
        if (!def) return;

        const size = parseSize(this.getAttribute('size'));
        const label = this.getAttribute('aria-label') || this.getAttribute('title');

        const svg = document.createElementNS(SVG_NS, 'svg');
        for (const [k, v] of svgAttrEntries(def, size, label)) svg.setAttribute(k, v);
        svg.setAttribute('data-neon-icon', '');

        if (label) {
            const titleEl = document.createElementNS(SVG_NS, 'title');
            titleEl.textContent = label;
            svg.appendChild(titleEl);
        }

        for (const p of def.paths) {
            const pathEl = document.createElementNS(SVG_NS, 'path');
            pathEl.setAttribute('d', p.d);
            if (p.attrs) for (const [k, v] of Object.entries(p.attrs)) pathEl.setAttribute(k, v);
            svg.appendChild(pathEl);
        }

        this.appendChild(svg);
    }
}

/**
 * Define `<neon-icon>` as an autonomous custom element. Idempotent.
 *
 * @param {string} [tagName] Optional override for the tag name.
 *   Defaults to `neon-icon`.
 */
export function registerIcon(tagName = 'neon-icon') {
    if (typeof globalThis.customElements === 'undefined') return;
    if (globalThis.customElements.get(tagName)) return;
    globalThis.customElements.define(tagName, NeonIconElement);
}

// Side-effect register on import.
registerIcon();
