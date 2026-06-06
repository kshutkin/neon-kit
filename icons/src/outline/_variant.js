/**
 * `@neon-kit/icons/outline` — 24×24 line variant.
 *
 * Owns the per-variant viewBox + shell/path attribute defaults. Each
 * generated icon module imports `icon` and calls `icon(...paths)`. Keep
 * only the helper exported so these defaults remain private module
 * details.
 *
 * @import { IconDef } from '../types.js'
 */

/**
 * @param {...string} paths
 * @returns {IconDef}
 */
export function icon(...paths) {
    return [
        24, // Natural icon width; paired with height to form `viewBox`.
        24, // Natural icon height; paired with width to form `viewBox`.
        { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' }, // Attributes applied to the root `<svg>`.
        { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, // Default attributes applied to every `<path>`.
        ...paths,
    ];
}
