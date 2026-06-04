/**
 * `@neon-kit/icons/micro` — 16×16 filled variant.
 *
 * Owns the per-variant viewBox + shell/path attribute defaults. Each
 * generated icon module imports `icon` and calls `icon([…])`. The
 * generator (`scripts/build-icons.mjs`) reads the three named exports
 * below to keep its emitted output in sync with these defaults — edit
 * them here when heroicons changes its micro conventions, then re-run
 * `pnpm --filter @neon-kit/icons run gen`.
 *
 * @import { IconDef } from '../types.js'
 */

export const VIEWBOX = '0 0 16 16';
export const SVG_ATTRS = { fill: 'currentColor' };
export const PATH_ATTRS = { 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' };

/**
 * @param {ReadonlyArray<string>} paths
 * @returns {IconDef}
 */
export function icon(paths) {
    return {
        viewBox: VIEWBOX,
        attrs: SVG_ATTRS,
        paths: paths.map((pathData) => ({
            d: pathData,
            attrs: PATH_ATTRS,
        })),
    };
}
