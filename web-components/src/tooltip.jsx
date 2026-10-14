/**
 * `<neon-tooltip>` — autonomous custom element that turns its own
 * markup into a popover-based tooltip and wires its parent element as
 * the trigger.
 *
 * The host is the popover (via the native `popover` attribute). Its
 * shadow root contains a default slot and the decorative arrow. The parent element is
 * the trigger; the tooltip body is whatever you put inside
 * `<neon-tooltip>`.
 *
 * Attributes:
 *
 *   placement   `top` (default) | `bottom` | `left` | `right`.
 *   trigger     Space-separated: `hover` `focus` `click`. Defaults
 *               to `hover focus` when the attribute is absent.
 *
 * Authored content stays in light DOM and is projected through a default slot.
 *
 * Attribute changes flow through `props()` and normal reactive effects,
 * so placement / trigger changes commit on Slimlib's effect schedule.
 */
import {
    attributes,
    defineElement,
    shadowStyles,
    internals,
    onConnect,
    onDisconnect,
    props,
    stringAttribute,
    withInternals,
} from '@slimlib/element';
import * as styles from '@neon-kit/theme/components/tooltip.module.css?neon&host=tooltip';
import { sheets as shadowBase } from '@neon-kit/theme/shadow-base.css?neon';
import { effect } from '@slimlib/store';

import {
    createTooltipController,
    isPopoverSupported,
    readTooltipPlacement,
} from '@neon-kit/core/tooltip';
import { generateId } from '@neon-kit/core/utils';

const placements = /** @type {const} */ (['top', 'bottom', 'left', 'right']);

/**
 * @param {HTMLElement} host
 */
const renderTooltip = (host) => {
    const elementInternals = internals();

    host.setAttribute('popover', 'manual');
    host.id = generateId('neon-tooltip');
    host.classList.add(...styles.tooltip.split(' '));
    elementInternals.role = 'tooltip';

    const state = props({
        placement: /** @type {string | undefined} */ (undefined),
        trigger: /** @type {string | undefined} */ (undefined),
    });

    /** @type {import('@neon-kit/core/tooltip').TooltipController[0] | undefined} */
    let updateTooltipController = undefined;
    /** @type {import('@neon-kit/core/tooltip').TooltipController[1] | undefined} */
    let destroyTooltipController = undefined;

    effect(() => {
        const placement = state.placement;
        const trigger = state.trigger;
        if (updateTooltipController) {
            updateTooltipController({ placement, trigger });
        } else {
            host.classList.remove(...placements.map((name) => styles[`-${name}`]));
            host.classList.add(styles[`-${readTooltipPlacement(placement)}`]);
        }
    });

    onConnect(() => {
        const triggerElement = host.parentElement;
        if (triggerElement) {
            [updateTooltipController, destroyTooltipController] = createTooltipController([
                host,
                triggerElement,
                state.placement,
                state.trigger,
                [styles.tooltip, Object.fromEntries(placements.map((name) => [name, styles[`-${name}`]]))],
            ]);
        }
    });

    onDisconnect(() => {
        destroyTooltipController?.();
        updateTooltipController = undefined;
        destroyTooltipController = undefined;
    });

    return [<slot />, <div class={styles.tooltip__arrow} aria-hidden="true" />];
};

/**
 * Public instance type of the `<neon-tooltip>` element.
 *
 * @typedef {HTMLElement} NeonTooltipElement
 */

if (isPopoverSupported()) {
    defineElement(
        'neon-tooltip',
        [
            shadowStyles([...new Set([...shadowBase, ...styles.sheets])]),
            withInternals(),
            attributes({
                placement: [stringAttribute[0]],
                trigger: [stringAttribute[0]],
            }),
        ],
        renderTooltip,
    );
}
