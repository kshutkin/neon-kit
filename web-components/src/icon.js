/**
 * `<neon-icon>` — Light-DOM custom element that renders an icon as
 * inline SVG.
 *
 * Icon data lives in `@neon-kit/icons`; this element loads it on
 * demand via a dynamic `import('@neon-kit/icons/<name>')`, keyed by
 * `<variant>/<icon-name>`:
 *
 *     <neon-icon name="outline/bars-3"></neon-icon>
 *     <neon-icon name="solid/x-mark" aria-label="Close"></neon-icon>
 *
 * For tree-shake-friendly use (or when the runtime can't resolve the
 * subpath dynamically), assign an `IconDef` to the `icon` property
 * directly — that takes precedence over `name`:
 *
 *     import bars from '@neon-kit/icons/outline/bars-3';
 *     const el = document.querySelector('neon-icon');
 *     el.icon = bars;
 *
 * If your bundler can't resolve dynamic bare specifiers (e.g. Vite's
 * production build), pre-assign `el.icon = importedDef` from outside
 * the component — see the docs site's `site/icons.js` for an
 * `import.meta.glob`-driven example.
 *
 * Per ADR 0001 the element renders into Light DOM (no shadow root).
 *
 * @import { IconDef } from '@neon-kit/icons'
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {IconDef} def
 * @param {string | null} ariaLabel
 * @returns {[string, string][]}
 */
function svgAttrEntries(def, ariaLabel) {
    /** @type {[string, string][]} */
    const entries = [
        ['xmlns', SVG_NS],
        ['viewBox', def.viewBox],
    ];
    if (def.attrs) for (const [k, v] of Object.entries(def.attrs)) entries.push([k, v]);
    entries.push(['width', '1em'], ['height', '1em']);
    if (ariaLabel) entries.push(['role', 'img']);
    else entries.push(['aria-hidden', 'true']);
    return entries;
}

export class NeonIconElement extends HTMLElement {
    /** @type {IconDef | null} */
    #iconOverride = null;
    #renderToken = 0;

    static get observedAttributes() {
        return ['name', 'aria-label', 'title'];
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
        import(/* @vite-ignore */ `@neon-kit/icons/${name}`).then(
            (mod) => {
                if (this.#renderToken !== token) return;
                this.#paint(mod.default);
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
        if (!def) {
            this.replaceChildren();
            return;
        }

        const label = this.getAttribute('aria-label') || this.getAttribute('title');

        const svg = document.createElementNS(SVG_NS, 'svg');
        for (const [k, v] of svgAttrEntries(def, label)) svg.setAttribute(k, v);

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

        this.replaceChildren(svg);
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
