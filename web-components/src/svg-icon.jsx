import { svg } from '@slimlib/jsx';

/**
 * @import { IconDef } from '@neon-kit/icons'
 */

/**
 * Lightweight SVG icon built with `@slimlib/jsx`.
 *
 * When `def` is provided, the icon's own shell and path attributes are
 * rendered. Otherwise the `children` thunk is evaluated inside the active
 * SVG namespace so the shapes it returns (`<path>`, `<circle>`, …) are
 * created via `createElementNS`.
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
export function SvgIcon({ def, class: className, viewBox, strokeWidth, children }) {
    const [width, height, iconAttrs, pathAttrs, ...paths] = def ?? [];
    const attrs = iconAttrs ? { ...iconAttrs } : {
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': String(strokeWidth ?? '2'),
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
    };
    if (strokeWidth != null) attrs['stroke-width'] = String(strokeWidth);

    return /** @type {SVGElement} */ (svg(() => (
        <svg
            class={className}
            viewBox={viewBox ?? (width && height ? `0 0 ${width} ${height}` : '0 0 24 24')}
            {...attrs}
            width="1em"
            height="1em"
            aria-hidden="true"
        >
            {children ? children() : paths.map((pathData) => <path d={pathData} {...pathAttrs} />)}
        </svg>
    )));
}
