/**
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
import { effect, signal } from '@slimlib/store';
import { SvgIcon } from './svg-icon.jsx';

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
    () => {
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
            return def ? SvgIcon(def) : null;
        };
    },
);

export {};
