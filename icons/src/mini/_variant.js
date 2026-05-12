/**
 * `@neon-kit/icons/mini` — 20×20 filled variant.
 *
 * Owns the per-variant viewBox + shell/path attribute defaults. Each
 * generated icon module imports `icon` and calls `icon([…])`. The
 * generator (`scripts/build-icons.mjs`) reads the three named exports
 * below to keep its emitted output in sync with these defaults — edit
 * them here when heroicons changes its mini conventions, then re-run
 * `pnpm --filter @neon-kit/icons run gen`.
 *
 * @import { IconDef, IconPath } from '../types.js'
 */

export const VIEWBOX = '0 0 20 20';
export const SVG_ATTRS = { fill: 'currentColor' };
export const PATH_ATTRS = { 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' };

/**
 * @param {ReadonlyArray<string | IconPath>} paths
 * @param {{ viewBox?: string, attrs?: Record<string,string>, pathAttrs?: Record<string,string> }} [overrides]
 * @returns {IconDef}
 */
export function icon(paths, overrides) {
    return {
        viewBox: overrides?.viewBox ?? VIEWBOX,
        attrs: { ...SVG_ATTRS, ...(overrides?.attrs ?? {}) },
        paths: paths.map((p) => {
            const isStr = typeof p === 'string';
            const d = isStr ? p : p.d;
            const own = isStr ? undefined : p.attrs;
            return {
                d,
                attrs: {
                    ...PATH_ATTRS,
                    ...(overrides?.pathAttrs ?? {}),
                    ...(own ?? {}),
                },
            };
        }),
    };
}
