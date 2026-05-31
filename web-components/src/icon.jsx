/**
 * `<neon-icon>` — Light-DOM custom element that renders an icon as
 * inline SVG, built on `@slimlib/element`, `@slimlib/store` and
 * `@slimlib/jsx`.
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
 * directly — that takes precedence over `name`. The `icon` setter
 * commits synchronously.
 *
 * Per ADR 0001 the element renders into Light DOM (no shadow root).
 *
 * @import { IconDef } from '@neon-kit/icons'
 */
import {
    attributes,
    defineElement,
    onConnect,
    stringAttribute,
} from '@slimlib/element';
import { svg } from '@slimlib/jsx';

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

/**
 * @param {IconDef} def
 * @param {string | null} label
 * @returns {SVGElement}
 */
function IconSvg(def, label) {
    const attrs = Object.fromEntries(svgAttrEntries(def, label));
    return /** @type {SVGElement} */ (svg(() => (
        <svg {...attrs}>
            {label ? <title>{label}</title> : null}
            {def.paths.map((p) => <path d={p.d} {...(p.attrs ?? {})} />)}
        </svg>
    )));
}

/**
 * @param {HTMLElement} host
 */
const renderIcon = (host) => {
    // ---- Adopt any pre-set own data props ------------------------------
    // attributes() middleware writes `host[key] = parsed` from
    // attributeChangedCallback for initial attributes BEFORE render runs.
    // Snapshot then strip so defineProperty wins.
    /** @type {Record<string, unknown>} */
    const preset = {};
    for (const key of ['name', 'aria-label', 'title', 'icon']) {
        if (Object.hasOwn(host, key)) {
            preset[key] = /** @type {any} */ (host)[key];
            delete /** @type {any} */ (host)[key];
        }
    }

    let nameVal = typeof preset.name === 'string'
        ? preset.name
        : (host.getAttribute('name') ?? '');
    let labelVal = typeof preset['aria-label'] === 'string'
        ? /** @type {string} */ (preset['aria-label'])
        : (host.getAttribute('aria-label') ?? '');
    let titleVal = typeof preset.title === 'string'
        ? preset.title
        : (host.getAttribute('title') ?? '');
    /** @type {IconDef | null} */
    let override = /** @type {IconDef | null} */ (preset.icon ?? null);
    /** @type {IconDef | null} */
    let loaded = null;
    let token = 0;

    const paint = () => {
        const def = override || loaded;
        if (!def) {
            host.replaceChildren();
            return;
        }
        const label = labelVal || titleVal || null;
        host.replaceChildren(IconSvg(def, label));
    };

    /** @param {string} name */
    const loadName = (name) => {
        const current = ++token;
        if (override) return;
        if (!name) {
            loaded = null;
            paint();
            return;
        }
        import(/* @vite-ignore */ `@neon-kit/icons/${name}`).then(
            (mod) => {
                if (token !== current) return;
                loaded = mod.default;
                paint();
            },
            (error) => {
                if (token !== current) return;
                // eslint-disable-next-line no-console
                console.warn(`<neon-icon>: failed to load "${name}"`, error);
                loaded = null;
                paint();
            },
        );
    };

    // ---- Public host API ----------------------------------------------
    Object.defineProperty(host, 'icon', {
        configurable: true, enumerable: true,
        get: () => override,
        set: (v) => {
            const next = /** @type {IconDef | null} */ (v || null);
            override = next;
            if (next) {
                // property wins; cancel any pending name load
                token++;
                loaded = null;
            }
            paint();
            if (!next) {
                // re-trigger name load if any
                loadName(nameVal);
            }
        },
    });
    Object.defineProperty(host, 'name', {
        configurable: true, enumerable: true,
        get: () => nameVal,
        set: (v) => {
            const next = v == null ? '' : String(v);
            if (next === nameVal) {
                // still ensure attribute reflection idempotency
                if (next === '') {
                    if (host.hasAttribute('name')) host.removeAttribute('name');
                } else if (host.getAttribute('name') !== next) {
                    host.setAttribute('name', next);
                }
                return;
            }
            nameVal = next;
            if (next === '') {
                if (host.hasAttribute('name')) host.removeAttribute('name');
            } else if (host.getAttribute('name') !== next) {
                host.setAttribute('name', next);
            }
            loadName(next);
        },
    });
    Object.defineProperty(host, 'aria-label', {
        configurable: true, enumerable: true,
        get: () => labelVal,
        set: (v) => {
            const next = v == null ? '' : String(v);
            if (next === labelVal) return;
            labelVal = next;
            if (next === '') {
                if (host.hasAttribute('aria-label')) host.removeAttribute('aria-label');
            } else if (host.getAttribute('aria-label') !== next) {
                host.setAttribute('aria-label', next);
            }
            paint();
        },
    });
    Object.defineProperty(host, 'title', {
        configurable: true, enumerable: true,
        get: () => titleVal,
        set: (v) => {
            const next = v == null ? '' : String(v);
            if (next === titleVal) return;
            titleVal = next;
            if (next === '') {
                if (host.hasAttribute('title')) host.removeAttribute('title');
            } else if (host.getAttribute('title') !== next) {
                host.setAttribute('title', next);
            }
            paint();
        },
    });

    // ---- Initial paint -------------------------------------------------
    onConnect(() => {
        if (override) {
            paint();
        } else {
            loadName(nameVal);
        }
    });

    return null;
};

/**
 * Public instance type of the `<neon-icon>` element.
 *
 * @typedef {HTMLElement & {
 *   name: string,
 *   title: string,
 *   icon: IconDef | null,
 * }} NeonIconElement
 */

defineElement(
    'neon-icon',
    [
        attributes({
            name: [stringAttribute[0]],
            'aria-label': [stringAttribute[0]],
            title: [stringAttribute[0]],
        }),
    ],
    renderIcon,
);

export {};
