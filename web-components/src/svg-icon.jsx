import { svg } from '@slimlib/jsx';

/**
 * @import { IconDef } from '@neon-kit/icons'
 */

/**
 * Lightweight stroked SVG icon built with `@slimlib/jsx`.
 *
 * When `def` is provided, the icon's paths are rendered. Otherwise the
 * `children` thunk is evaluated inside the active SVG namespace so the
 * shapes it returns (`<path>`, `<circle>`, …) are created via
 * `createElementNS`.
 *
 * @param {{
 *   def?: IconDef,
 *   class?: string,
 *   viewBox?: string,
 *   strokeWidth?: string | number,
 *   children?: () => import('@slimlib/jsx').Child,
 * }} props
 * @returns {SVGElement}
 */
export function SvgIcon({ def, class: className, viewBox, strokeWidth = '2', children }) {
    return /** @type {SVGElement} */ (svg(() => (
        <svg
            class={className}
            viewBox={viewBox ?? def?.viewBox ?? '0 0 24 24'}
            fill="none"
            stroke="currentColor"
            stroke-width={String(strokeWidth)}
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
        >
            {children ? children() : def?.paths.map((p) => <path d={p.d} />)}
        </svg>
    )));
}
