// Side-effect import registers `<neon-icon>`. The component's own
// dynamic `import('@neon-kit/icons/<name>')` is unresolvable by
// Vite's production build, so we eagerly assign `el.icon` from an
// `import.meta.glob`-driven lookup before the component's fallback
// fires (and even if it does fire first and reject, the subsequent
// assignment re-renders correctly).
import '@neon-kit/web-components/icon';

/** @typedef {import('@neon-kit/icons').IconDef} IconDef */

const modules = /** @type {Record<string, () => Promise<{ default: IconDef }>>} */ (
    import.meta.glob('../icons/src/{outline,solid,mini,micro}/*.js')
);

/** @type {Map<string, () => Promise<{ default: IconDef }>>} */
const lookup = new Map();
for (const [path, load] of Object.entries(modules)) {
    const m = path.match(/\/(outline|solid|mini|micro)\/([^/]+)\.js$/);
    if (!m) continue;
    if (m[2] === 'index' || m[2] === '_variant') continue;
    lookup.set(`${m[1]}/${m[2]}`, load);
}

/** @type {Map<string, Promise<IconDef | null>>} */
const cache = new Map();

/** @param {string} name */
function loadIcon(name) {
    const cached = cache.get(name);
    if (cached) return cached;
    const load = lookup.get(name);
    if (!load) return Promise.resolve(null);
    const promise = load().then((mod) => mod.default).catch(() => null);
    cache.set(name, promise);
    return promise;
}

/**
 * @param {Element} el
 * @param {boolean} [force] when true, clear an existing `.icon`
 *   override and re-resolve. Used by the attribute-mutation path so
 *   the variant switcher (which flips `name=` on the same element)
 *   actually swaps the rendered icon instead of sticking on the
 *   first-assigned override.
 */
function hydrate(el, force) {
    if (el.tagName !== 'NEON-ICON') return;
    const name = el.getAttribute('name');
    if (!name) return;
    if (force) /** @type {any} */ (el).icon = null;
    loadIcon(name).then((def) => {
        if (def && el.getAttribute('name') === name && !(/** @type {any} */ (el).icon)) {
            /** @type {any} */ (el).icon = def;
        }
    });
}

function scan(root = document.body) {
    if (!root) return;
    if (root instanceof Element && root.tagName === 'NEON-ICON') hydrate(root);
    if (root.querySelectorAll) {
        for (const el of root.querySelectorAll('neon-icon')) hydrate(el);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scan(), { once: true });
} else {
    scan();
}

const observer = new MutationObserver((records) => {
    for (const record of records) {
        for (const node of record.addedNodes) {
            if (node instanceof Element) scan(node);
        }
        if (record.type === 'attributes' && record.target instanceof Element) {
            hydrate(record.target, true);
        }
    }
});
observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['name'],
});

// Variant switcher on the Icons docs page. Delegated at document
// level because section HTML is injected via innerHTML on soft-nav,
// so inline scripts inside the section would never run.
document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-icon-variant-nav] button[data-variant]') : null;
    if (!target) return;
    const nav = target.closest('[data-icon-variant-nav]');
    const variant = target.getAttribute('data-variant');
    if (!nav || !variant) return;
    for (const btn of nav.querySelectorAll('button[data-variant]')) {
        const active = btn === target;
        btn.classList.toggle('-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    for (const el of document.querySelectorAll('[data-icon-base]')) {
        const base = el.getAttribute('data-icon-base');
        if (base) el.setAttribute('name', `${variant}/${base}`);
    }
});
