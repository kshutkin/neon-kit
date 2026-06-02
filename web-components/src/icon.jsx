/**
 * `<neon-icon>` — Light-DOM custom element that renders an icon as
 * inline SVG, built on `@slimlib/element`, `@slimlib/store` and
 * `@slimlib/jsx`.
 *
 * Icon data lives in `@neon-kit/icons`; this element loads it on
 * demand via a dynamic `import('@neon-kit/icons/<name>')`, keyed by
 * `<variant>/<icon-name>`:
 *
 *     <neon-icon name="outline/bars-3"></neon-icon>
 *     <neon-icon name="solid/x-mark" aria-label="Close"></neon-icon>
 *
 * For tree-shake-friendly use (or when the runtime can't resolve the
 * subpath dynamically), assign an `IconDef` to the `icon` property
 * directly — that takes precedence over `name`.
 *
 * Per ADR 0001 the element renders into Light DOM (no shadow root).
 *
 * @import { IconDef } from '@neon-kit/icons'
 */
import {
    attributes,
    defineElement,
    props,
} from '@slimlib/element';
import { svg } from '@slimlib/jsx';
import { effect, signal } from '@slimlib/store';

/**
 * Like `stringAttribute`, but reflects an empty string as attribute
 * removal (the legacy `<neon-icon>` behavior).
 *
 * @type {[ (raw: string | null) => string | null, (value: unknown) => string | null ]}
 */
const reflectedString = [
    (raw) => raw,
    (value) => (value == null || value === '' ? null : String(value)),
];

/**
 * @param {IconDef} def
 * @param {string | null} ariaLabel
 * @returns {[string, string][]}
 */
function svgAttrEntries(def, ariaLabel) {
    /** @type {[string, string][]} */
    const entries = [
        ['viewBox', def.viewBox],
    ];
    if (def.attrs) for (const [k, v] of Object.entries(def.attrs)) entries.push([k, v]);
    entries.push(['width', '1em'], ['height', '1em']);
    if (ariaLabel) entries.push(['role', 'img']);
    else entries.push(['aria-hidden', 'true']);
    return entries;
}

/**
 * @param {IconDef} def
 * @param {string | null} label
 * @returns {SVGElement}
 */
function IconSvg(def, label) {
    const attrs = Object.fromEntries(svgAttrEntries(def, label));
    return /** @type {SVGElement} */ (svg(() => (
        <svg {...attrs}>
            {label ? <title>{label}</title> : null}
            {def.paths.map((p) => <path d={p.d} {...(p.attrs ?? {})} />)}
        </svg>
    )));
}

const renderIcon = () => {
    const state = props({
        name: '',
        'aria-label': '',
        title: '',
        icon: /** @type {IconDef | null} */ (null),
    });

    /** @type {import('@slimlib/store').Signal<IconDef | null>} */
    const loadedSig = signal(/** @type {IconDef | null} */ (null));
    let token = 0;

    effect(() => {
        const override = state.icon;
        const name = state.name;
        if (override) {
            loadedSig.set(null);
            return;
        }
        const current = ++token;
        if (!name) {
            loadedSig.set(null);
            return;
        }
        import(/* @vite-ignore */ `@neon-kit/icons/${name}`).then(
            (mod) => {
                if (token === current) loadedSig.set(mod.default);
            },
            (error) => {
                if (token !== current) return;
                // eslint-disable-next-line no-console
                console.warn(`<neon-icon>: failed to load "${name}"`, error);
                loadedSig.set(null);
            },
        );
    });

    return () => {
        const def = state.icon || loadedSig();
        if (!def) return null;
        const label = state['aria-label'] || state.title || null;
        return IconSvg(def, label);
    };
};

/**
 * Public instance type of the `<neon-icon>` element.
 *
 * @typedef {HTMLElement & {
 *   name: string,
 *   'aria-label': string,
 *   title: string,
 *   icon: IconDef | null,
 * }} NeonIconElement
 */

defineElement(
    'neon-icon',
    [
        attributes({
            name: reflectedString,
            'aria-label': reflectedString,
            title: reflectedString,
        }),
    ],
    renderIcon,
);

export {};
