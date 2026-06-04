/**
 * `serialize(iconDef, options?) -> string` — DOM-free SVG string emitter
 * for `IconDef` values. Output mirrors what the `<neon-icon>` custom
 * element (in `@neon-kit/web-components/icon`) renders for the same
 * inputs, modulo attribute ordering.
 *
 * @import { IconDef } from './types.js'
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Parse a `size` option into a CSS length. Bare numbers become
 * `<n>px`; anything else passes through (e.g. `1.5rem`, `24px`).
 *
 * @param {string | null | undefined} rawSize
 * @returns {string}
 */
function parseSize(rawSize) {
    let size = '1em';

    if (rawSize != null && rawSize !== '') {
        const sizeText = String(rawSize);
        const trimmedSize = sizeText.trim();
        size = /^-?\d+(\.\d+)?$/.test(trimmedSize) ? `${trimmedSize}px` : sizeText;
    }

    return size;
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Record<string, string>} svgAttrs
 * @param {string} size
 * @param {string | null} ariaLabel
 * @returns {[string, string][]}
 */
function svgAttrEntries(width, height, svgAttrs, size, ariaLabel) {
    /** @type {[string, string][]} */
    const entries = [
        ['xmlns', SVG_NS],
        ['viewBox', `0 0 ${width} ${height}`],
    ];
    for (const [attributeName, attributeValue] of Object.entries(svgAttrs)) {
        entries.push([attributeName, attributeValue]);
    }
    entries.push(['width', size], ['height', size]);
    if (ariaLabel) {
        entries.push(['role', 'img']);
    } else {
        entries.push(['aria-hidden', 'true']);
    }
    return entries;
}

/**
 * @param {string} pathData
 * @param {Record<string, string>} pathAttrs
 * @returns {[string, string][]}
 */
function pathAttrEntries(pathData, pathAttrs) {
    /** @type {[string, string][]} */
    const entries = [['d', pathData]];
    for (const [attributeName, attributeValue] of Object.entries(pathAttrs)) {
        entries.push([attributeName, attributeValue]);
    }
    return entries;
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeAttr(text) {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeText(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Serialize an `IconDef` to an SVG string.
 *
 * @param {IconDef} iconDef
 * @param {{ size?: string | number, ariaLabel?: string }} [options]
 * @returns {string}
 */
export function serialize(iconDef, options) {
    const [width, height, svgAttrs, pathAttrs, ...paths] = iconDef;
    const size = parseSize(options?.size == null ? null : String(options.size));
    const label = options?.ariaLabel ?? null;
    const svgAttrStr = svgAttrEntries(width, height, svgAttrs, size, label)
        .map(([attributeName, attributeValue]) => `${attributeName}="${escapeAttr(attributeValue)}"`)
        .join(' ');
    const title = label ? `<title>${escapeText(label)}</title>` : '';
    const pathElements = paths.map((pathData) => {
        const attrStr = pathAttrEntries(pathData, pathAttrs)
            .map(([attributeName, attributeValue]) => `${attributeName}="${escapeAttr(attributeValue)}"`)
            .join(' ');
        return `<path ${attrStr}/>`;
    }).join('');
    return `<svg ${svgAttrStr}>${title}${pathElements}</svg>`;
}
