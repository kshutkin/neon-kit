/**
 * `serialize(iconDef, opts?) -> string` — DOM-free SVG string emitter
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
 * @param {string | null | undefined} raw
 * @returns {string}
 */
function parseSize(raw) {
    if (raw == null || raw === '') return '1em';
    const s = String(raw);
    return /^-?\d+(\.\d+)?$/.test(s.trim()) ? `${s.trim()}px` : s;
}

/**
 * @param {IconDef} def
 * @param {string} size
 * @param {string | null} ariaLabel
 * @returns {[string, string][]}
 */
function svgAttrEntries(def, size, ariaLabel) {
    /** @type {[string, string][]} */
    const entries = [
        ['xmlns', SVG_NS],
        ['viewBox', def.viewBox],
    ];
    if (def.attrs) for (const [k, v] of Object.entries(def.attrs)) entries.push([k, v]);
    entries.push(['width', size], ['height', size]);
    if (ariaLabel) entries.push(['role', 'img']);
    else entries.push(['aria-hidden', 'true']);
    return entries;
}

/**
 * @param {IconPath} p
 * @returns {[string, string][]}
 */
function pathAttrEntries(p) {
    /** @type {[string, string][]} */
    const entries = [['d', p.d]];
    if (p.attrs) for (const [k, v] of Object.entries(p.attrs)) entries.push([k, v]);
    return entries;
}

/**
 * @param {string} s
 * @returns {string}
 */
function escapeAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * @param {string} s
 * @returns {string}
 */
function escapeText(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Serialize an `IconDef` to an SVG string.
 *
 * @param {IconDef} def
 * @param {{ size?: string | number, ariaLabel?: string }} [opts]
 * @returns {string}
 */
export function serialize(def, opts) {
    const size = parseSize(opts?.size == null ? null : String(opts.size));
    const label = opts?.ariaLabel ?? null;
    const svgAttrStr = svgAttrEntries(def, size, label)
        .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
        .join(' ');
    const title = label ? `<title>${escapeText(label)}</title>` : '';
    const paths = def.paths.map((p) => {
        const attrStr = pathAttrEntries(p)
            .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
            .join(' ');
        return `<path ${attrStr}/>`;
    }).join('');
    return `<svg ${svgAttrStr}>${title}${paths}</svg>`;
}
