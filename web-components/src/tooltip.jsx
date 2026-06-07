/**
 * `<neon-tooltip>` — autonomous custom element that turns its own
 * markup into a popover-based tooltip and wires its parent element as
 * the trigger.
 *
 * The element IS the popover (via the native `popover` attribute), so
 * there is no extra DOM created or torn down. The parent element is
 * the trigger; the tooltip body is whatever you put inside
 * `<neon-tooltip>`.
 *
 * Attributes:
 *
 *   placement   `top` (default) | `bottom` | `left` | `right`.
 *   trigger     Space-separated: `hover` `focus` `click`. Defaults
 *               to `hover focus` when the attribute is absent.
 *
 * Per ADR 0001 the element renders into Light DOM (no shadow root).
 *
 * Attribute changes flow through `props()` and normal reactive effects,
 * so placement / trigger changes commit on Slimlib's effect schedule.
 */
import {
    attributes,
    defineElement,
    internals,
    onConnect,
    onDisconnect,
    props,
    stringAttribute,
    withInternals,
} from '@slimlib/element';
import { effect } from '@slimlib/store';

import {
    createTooltipController,
    isPopoverSupported,
    readTooltipPlacement,
} from './tooltip-controller.js';
import { generateId } from './utils.js';

/**
 * @param {HTMLElement} host
 */
const renderTooltip = (host) => {
    const elementInternals = internals();

    host.setAttribute('popover', 'manual');
    host.id = generateId('neon-tooltip');
    host.classList.add('tooltip');
    elementInternals.role = 'tooltip';

    const state = props({
        placement: /** @type {string | undefined} */ (undefined),
        trigger: /** @type {string | undefined} */ (undefined),
    });

    /** @type {import('./tooltip-controller.js').TooltipController[0] | undefined} */
    let updateTooltipController = undefined;
    /** @type {import('./tooltip-controller.js').TooltipController[1] | undefined} */
    let destroyTooltipController = undefined;

    effect(() => {
        host.classList.remove('-top', '-bottom', '-left', '-right');
        host.classList.add(`-${readTooltipPlacement(state.placement)}`);
        updateTooltipController?.({
            placement: state.placement,
            trigger: state.trigger,
        });
    });

    onConnect(() => {
        const triggerElement = host.parentElement;
        if (triggerElement) {
            [updateTooltipController, destroyTooltipController] = createTooltipController({
                $_tooltipElement: host,
                $_triggerElement: triggerElement,
                $_placement: state.placement,
                $_trigger: state.trigger,
            });
        }
    });

    onDisconnect(() => {
        destroyTooltipController?.();
        updateTooltipController = undefined;
        destroyTooltipController = undefined;
    });

    return <div class="tooltip__arrow" />;
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
            withInternals(),
            attributes({
                placement: [stringAttribute[0]],
                trigger: [stringAttribute[0]],
            }),
        ],
        renderTooltip,
    );
}
