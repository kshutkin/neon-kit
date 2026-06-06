/**
 * `@neon-kit/icons/micro` — 16×16 filled variant.
 *
 * Owns the per-variant viewBox + shell/path attribute defaults. Each
 * generated icon module imports `icon` and calls `icon(...paths)`.
 * The constants stay private so only the helper is part of the
 * module's public surface.
 *
 * @import { IconDef } from '../types.js'
 */

/**
 * @param {...string} paths
 * @returns {IconDef}
 */
export function icon(...paths) {
    return [
        16, // Natural icon width; paired with height to form `viewBox`.
        16, // Natural icon height; paired with width to form `viewBox`.
        { fill: 'currentColor' }, // Attributes applied to the root `<svg>`.
        { 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' }, // Default attributes applied to every `<path>`.
        ...paths,
    ];
}
