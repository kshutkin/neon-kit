import { SvgIcon } from '../web-components/src/svg-icon.jsx';

/** @typedef {import('@neon-kit/icons').IconDef} IconDef */

/** @type {Promise<unknown> | null} */
let iconElementReady = null;

function ensureIconElement() {
    iconElementReady ??= import('@neon-kit/web-components/icon');
    return iconElementReady;
}

const modules = /** @type {Record<string, () => Promise<{ default: IconDef }>>} */ (
    import.meta.glob('../icons/src/{outline,solid,mini,micro}/*.js')
);

const VARIANTS = /** @type {const} */ (['outline', 'solid', 'mini', 'micro']);
const ICON_PAGE_SIZE = 48;

/** @type {Map<string, () => Promise<{ default: IconDef }>>} */
const lookup = new Map();
/** @type {Record<typeof VARIANTS[number], string[]>} */
const namesByVariant = {
    outline: [],
    solid: [],
    mini: [],
    micro: [],
};
for (const [path, load] of Object.entries(modules)) {
    const m = path.match(/\/(outline|solid|mini|micro)\/([^/]+)\.js$/);
    if (!m) continue;
    if (m[2] === 'index' || m[2] === '_variant') continue;
    lookup.set(`${m[1]}/${m[2]}`, load);
    namesByVariant[/** @type {typeof VARIANTS[number]} */ (m[1])].push(m[2]);
}

for (const names of Object.values(namesByVariant)) {
    names.sort();
}

/** @type {Map<string, Promise<IconDef | undefined>>} */
const cache = new Map();
/** @type {WeakMap<Element, { variant: typeof VARIANTS[number], query: string, page: number }>} */
const galleryState = new WeakMap();

/** @param {string} name */
function loadIcon(name) {
    const cached = cache.get(name);
    if (cached) return cached;
    const load = lookup.get(name);
    if (!load) return Promise.resolve(undefined);
    const promise = load().then((mod) => mod.default).catch(() => undefined);
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
    if (force) /** @type {any} */ (el).icon = undefined;
    Promise.all([ensureIconElement(), loadIcon(name)]).then(([, def]) => {
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
    hydrateSvgIconMarkers(root);
    hydrateIconGalleries(root);
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

/**
 * @param {ParentNode | Element} root
 */
function hydrateSvgIconMarkers(root) {
    const markers = root instanceof Element && root.matches('[data-svg-icon]')
        ? [root]
        : [];
    if (root.querySelectorAll) markers.push(...root.querySelectorAll('[data-svg-icon]'));
    for (const el of markers) hydrateSvgIconMarker(el);
}

/**
 * @param {Element} el
 */
function hydrateSvgIconMarker(el) {
    const name = el.getAttribute('data-svg-icon');
    if (!name) return;
    loadIcon(name).then((def) => {
        if (!def || el.getAttribute('data-svg-icon') !== name) return;
        el.replaceChildren(SvgIcon(def, {
            class: el.getAttribute('data-icon-class') ?? '',
            'aria-hidden': 'true',
        }));
    });
}

/**
 * @param {ParentNode | Element} root
 */
function hydrateIconGalleries(root) {
    const galleries = root instanceof Element && root.matches('[data-icon-gallery]')
        ? [root]
        : [];
    if (root.querySelectorAll) galleries.push(...root.querySelectorAll('[data-icon-gallery]'));
    for (const gallery of galleries) hydrateIconGallery(gallery);
}

/**
 * @param {Element} gallery
 */
function hydrateIconGallery(gallery) {
    if (!galleryState.has(gallery)) {
        galleryState.set(gallery, { variant: activeIconVariant(gallery), query: '', page: 1 });
        gallery.addEventListener('input', (event) => {
            const target = event.target instanceof HTMLInputElement ? event.target : null;
            if (!target || !target.matches('[data-icon-search]')) return;
            const state = galleryState.get(gallery);
            if (!state) return;
            state.query = target.value.trim().toLowerCase();
            state.page = 1;
            renderIconGallery(gallery);
        });
        gallery.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target.closest('button[data-icon-page]') : null;
            if (!target) return;
            const state = galleryState.get(gallery);
            if (!state) return;
            state.page += target.getAttribute('data-icon-page') === 'next' ? 1 : -1;
            renderIconGallery(gallery);
        });
    }
    renderIconGallery(gallery);
}

/**
 * @param {Element} gallery
 * @returns {typeof VARIANTS[number]}
 */
function activeIconVariant(gallery) {
    const section = gallery.closest('section');
    const activeButton = section?.querySelector('[data-icon-variant-nav] button.-active[data-variant]');
    const variant = activeButton?.getAttribute('data-variant');
    return VARIANTS.includes(/** @type {typeof VARIANTS[number]} */ (variant))
        ? /** @type {typeof VARIANTS[number]} */ (variant)
        : 'outline';
}

/**
 * @param {Element} gallery
 */
function renderIconGallery(gallery) {
    const state = galleryState.get(gallery);
    const grid = gallery.querySelector('[data-icon-grid]');
    const resultStatus = gallery.querySelector('[data-icon-result-status]');
    const pageStatus = gallery.querySelector('[data-icon-page-status]');
    const previousButton = /** @type {HTMLButtonElement | null} */ (gallery.querySelector('button[data-icon-page="prev"]'));
    const nextButton = /** @type {HTMLButtonElement | null} */ (gallery.querySelector('button[data-icon-page="next"]'));
    if (!state || !grid || !resultStatus || !pageStatus) return;

    const allNames = namesByVariant[state.variant];
    const filteredNames = state.query
        ? allNames.filter((name) => name.includes(state.query))
        : allNames;
    const pageCount = Math.max(1, Math.ceil(filteredNames.length / ICON_PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), pageCount);
    const start = (state.page - 1) * ICON_PAGE_SIZE;
    const pageNames = filteredNames.slice(start, start + ICON_PAGE_SIZE);

    grid.replaceChildren(...pageNames.map((name) => iconGalleryItem(state.variant, name)));
    hydrateSvgIconMarkers(grid);

    resultStatus.textContent = `${filteredNames.length} ${state.variant} icons`;
    pageStatus.textContent = `${state.page} / ${pageCount}`;
    if (previousButton) previousButton.disabled = state.page <= 1;
    if (nextButton) nextButton.disabled = state.page >= pageCount;
}

/**
 * @param {typeof VARIANTS[number]} variant
 * @param {string} name
 * @returns {HTMLLIElement}
 */
function iconGalleryItem(variant, name) {
    const item = document.createElement('li');
    item.className = 'flex h-24 w-32 min-w-0 flex-col items-center justify-center gap-2 rounded-md border border-border bg-surface p-2';

    const icon = document.createElement('span');
    icon.setAttribute('data-svg-icon', `${variant}/${name}`);
    icon.setAttribute('data-icon-class', 'text-[30px]');
    item.append(icon);

    const label = document.createElement('span');
    label.className = 'max-w-full text-center font-mono text-xs leading-tight text-ink-secondary break-words';
    label.title = name;
    label.textContent = name;
    item.append(label);

    return item;
}

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
    const gallery = nav.closest('section')?.querySelector('[data-icon-gallery]');
    if (gallery) {
        const state = galleryState.get(gallery);
        if (state && VARIANTS.includes(/** @type {typeof VARIANTS[number]} */ (variant))) {
            state.variant = /** @type {typeof VARIANTS[number]} */ (variant);
            state.page = 1;
            renderIconGallery(gallery);
        }
    }
});
