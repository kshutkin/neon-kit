import { svg } from '@slimlib/jsx';

/**
 * @import { IconDef } from '@neon-kit/icons'
 */

/**
 * Lightweight SVG icon built with `@slimlib/jsx`.
 *
 * Renders the icon's own shell and path attributes.
 *
 * @param {IconDef} def
 * @param {{
 *   class?: string,
 *   'stroke-width'?: string | number,
 *   'aria-hidden'?: string,
 * }} [props]
 * @returns {SVGElement}
 */
export function SvgIcon(def, props = {}) {
    const [width, height, iconAttrs, pathAttrs, ...paths] = def;

    return /** @type {SVGElement} */ (svg(() => (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            width="1em"
            height="1em"
            {...iconAttrs}
            {...props}
        >
            {paths.map((pathData) => <path d={pathData} {...pathAttrs} />)}
        </svg>
    )));
}
