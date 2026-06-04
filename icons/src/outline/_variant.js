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
 * @import { IconDef, IconPath } from '../types.js'
 */

export const VIEWBOX = '0 0 24 24';
export const SVG_ATTRS = { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' };
export const PATH_ATTRS = { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };

/**
 * @param {ReadonlyArray<string | IconPath>} paths
 * @param {{ viewBox?: string, attrs?: Record<string,string>, pathAttrs?: Record<string,string> }} [overrides]
 * @returns {IconDef}
 */
export function icon(paths, overrides) {
    return {
        viewBox: overrides?.viewBox ?? VIEWBOX,
        attrs: { ...SVG_ATTRS, ...(overrides?.attrs ?? {}) },
        paths: paths.map((pathDefinition) => {
            const isPathData = typeof pathDefinition === 'string';
            const pathData = isPathData ? pathDefinition : pathDefinition.d;
            const pathAttrs = isPathData ? undefined : pathDefinition.attrs;
            return {
                d: pathData,
                attrs: {
                    ...PATH_ATTRS,
                    ...(overrides?.pathAttrs ?? {}),
                    ...(pathAttrs ?? {}),
                },
            };
        }),
    };
}
