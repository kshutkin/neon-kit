/**
 * `@neon-kit/icons/outline` — 24×24 line variant.
 *
 * Owns the per-variant viewBox + shell/path attribute defaults. Each
 * generated icon module imports `icon` and calls `icon([…])`. The
 * generator (`scripts/build-icons.mjs`) reads the three named exports
 * below to keep its emitted output in sync with these defaults — edit
 * them here when heroicons changes its outline conventions, then
 * re-run `pnpm --filter @neon-kit/icons run gen`.
 *
 * @import { IconDef } from '../types.js'
 */

export const VIEWBOX = '0 0 24 24';
export const WIDTH = 24;
export const HEIGHT = 24;
export const SVG_ATTRS = { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' };
export const PATH_ATTRS = { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };

/**
 * @param {ReadonlyArray<string>} paths
 * @returns {IconDef}
 */
export function icon(paths) {
    return [WIDTH, HEIGHT, SVG_ATTRS, PATH_ATTRS, ...paths];
}
