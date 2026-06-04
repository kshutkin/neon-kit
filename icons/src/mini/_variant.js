/**
 * `@neon-kit/icons/mini` — 20×20 filled variant.
 *
 * Owns the per-variant viewBox + shell/path attribute defaults. Each
 * generated icon module imports `icon` and calls `icon(pathData)`. The
 * generator (`scripts/build-icons.mjs`) reads the three named exports
 * below to keep its emitted output in sync with these defaults — edit
 * them here when heroicons changes its mini conventions, then re-run
 * `pnpm --filter @neon-kit/icons run gen`.
 *
 * @import { IconDef } from '../types.js'
 */

export const VIEWBOX = '0 0 20 20';
export const WIDTH = 20;
export const HEIGHT = 20;
export const SVG_ATTRS = { fill: 'currentColor' };
export const PATH_ATTRS = { 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' };

/**
 * @param {string} pathData
 * @returns {IconDef}
 */
export function icon(pathData) {
    return [WIDTH, HEIGHT, SVG_ATTRS, PATH_ATTRS, pathData];
}
