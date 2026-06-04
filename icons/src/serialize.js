/**
 * `serialize(iconDef, options?) -> string` — DOM-free SVG string emitter
 * for `IconDef` values. Output mirrors what the `<neon-icon>` custom
 * element (in `@neon-kit/web-components/icon`) renders for the same
 * inputs, modulo attribute ordering.
 *
 * @import { IconDef, IconPath } from './types.js'
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
 * @param {IconDef} iconDef
 * @param {string} size
 * @param {string | null} ariaLabel
 * @returns {[string, string][]}
 */
function svgAttrEntries(iconDef, size, ariaLabel) {
    /** @type {[string, string][]} */
    const entries = [
        ['xmlns', SVG_NS],
        ['viewBox', iconDef.viewBox],
    ];
    for (const [attributeName, attributeValue] of Object.entries(iconDef.attrs)) {
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
 * @param {IconPath} iconPath
 * @returns {[string, string][]}
 */
function pathAttrEntries(iconPath) {
    /** @type {[string, string][]} */
    const entries = [['d', iconPath.d]];
    for (const [attributeName, attributeValue] of Object.entries(iconPath.attrs)) {
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
    const size = parseSize(options?.size == null ? null : String(options.size));
    const label = options?.ariaLabel ?? null;
    const svgAttrStr = svgAttrEntries(iconDef, size, label)
        .map(([attributeName, attributeValue]) => `${attributeName}="${escapeAttr(attributeValue)}"`)
        .join(' ');
    const title = label ? `<title>${escapeText(label)}</title>` : '';
    const paths = iconDef.paths.map((iconPath) => {
        const attrStr = pathAttrEntries(iconPath)
            .map(([attributeName, attributeValue]) => `${attributeName}="${escapeAttr(attributeValue)}"`)
            .join(' ');
        return `<path ${attrStr}/>`;
    }).join('');
    return `<svg ${svgAttrStr}>${title}${paths}</svg>`;
}
