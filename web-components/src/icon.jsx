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
 *     <neon-icon name="solid/x-mark" role="img" aria-label="Close"></neon-icon>
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
    internals,
    props,
    stringAttribute,
    withInternals,
} from '@slimlib/element';
import { svg } from '@slimlib/jsx';
import { effect, signal } from '@slimlib/store';

/**
 * @param {IconDef} def
 * @returns {[string, string][]}
 */
function svgAttrEntries(def) {
    /** @type {[string, string][]} */
    return [
        ['viewBox', def.viewBox],
        ...def.attrs ? Object.entries(def.attrs) : [],
        ['width', '1em'],
        ['height', '1em']
    ];
}

/**
 * @param {IconDef} def
 * @returns {SVGElement}
 */
function IconSvg(def) {
    const attrs = Object.fromEntries(svgAttrEntries(def));
    return /** @type {SVGElement} */ (svg(() => (
        <svg {...attrs}>
            {def.paths.map((p) => <path d={p.d} {...(p.attrs ?? {})} />)}
        </svg>
    )));
}

/**
 * @param {HTMLElement} host
 */
const renderIcon = (host) => {
    const elementInternals = internals();
    const state = props({
        name: undefined,
        label: undefined,
        icon: /** @type {IconDef | undefined} */ (undefined),
    });

    /** @type {import('@slimlib/store').Signal<IconDef | undefined>} */
    const loadedIconDef = signal(/** @type {IconDef | undefined} */ (undefined));

    effect(async () => {
        const override = state.icon;
        const name = state.name;
        if (override || !name) {
            loadedIconDef.set(undefined);
            return;
        }
        import(/* @vite-ignore */ `@neon-kit/icons/${name}`).then(
            (mod) => {
                if (name === state.name) {
                    loadedIconDef.set(mod.default);
                }
            },
            (error) => {
                if (name === state.name) {
                    loadedIconDef.set(undefined);
                }
            },
        );
    });

    effect(() => {
        const label = state.label;
        elementInternals.ariaLabel = label;
        elementInternals.ariaHidden = label ? null : 'true';
        elementInternals.ariaRole = label ? 'img' : null;
    });

    return () => {
        const def = state.icon || loadedIconDef();
        return def ? IconSvg(def) : null;
    };
};

/**
 * Public instance type of the `<neon-icon>` element.
 *
 * @typedef {HTMLElement & {
 *   name: string,
 *   label: string,
 *   icon: IconDef | undefined,
 * }} NeonIconElement
 */

defineElement(
    'neon-icon',
    [
        withInternals(),
        attributes({
            label: stringAttribute,
            name: stringAttribute,
        }),
    ],
    renderIcon,
);

export {};
