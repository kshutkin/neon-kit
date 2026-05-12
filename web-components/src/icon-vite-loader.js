/**
 * Vite-only adapter that wires `<neon-icon name="…">` to a
 * statically-analyzable `import.meta.glob` over `@neon-kit/icons`.
 *
 * Side-effect import:
 *
 *     import '@neon-kit/web-components/icon';            // registers the element
 *     import '@neon-kit/web-components/icon-vite-loader'; // wires dynamic loading
 *
 * Trade-offs:
 * - Vite emits one lazy chunk per icon module — they are fetched on
 *   demand, not bundled into a single blob.
 * - The import is Vite-coupled. For other bundlers, see
 *   `setIconLoader` in `@neon-kit/web-components/icon`.
 * - For the bundler-agnostic, tree-shakeable path, import the icon
 *   module directly and assign it via the `icon` property:
 *
 *       import bars from '@neon-kit/icons/outline/bars-3';
 *       el.icon = bars;
 */

import { setIconLoader } from './icon.js';

/** @typedef {import('@neon-kit/icons').IconDef} IconDef */

const modules = /** @type {Record<string, () => Promise<{ default: IconDef }>>} */ (
    import.meta.glob('../../icons/src/{outline,solid,mini,micro}/*.js')
);

/** @type {Map<string, () => Promise<{ default: IconDef }>>} */
const lookup = new Map();
for (const [path, load] of Object.entries(modules)) {
    const m = path.match(/\/(outline|solid|mini|micro)\/([^/]+)\.js$/);
    if (!m) continue;
    if (m[2] === 'index' || m[2] === '_variant') continue;
    lookup.set(`${m[1]}/${m[2]}`, load);
}

setIconLoader(async (name) => {
    const load = lookup.get(name);
    if (!load) throw new Error(`[neon-icon] no module registered for "${name}"`);
    const mod = await load();
    return mod.default;
});
