import { DEV } from 'esm-env';

import { effect } from '@slimlib/store';

import {
    createTooltipController,
    readTooltipPlacement,
} from './tooltip-controller.js';

/**
 * @import { Child } from '@slimlib/jsx'
 */

/**
 * @typedef {'top' | 'bottom' | 'left' | 'right'} TooltipPlacement
 * @typedef {{
 *   children: Child,
 *   content: Child,
 *   placement?: TooltipPlacement | string | (() => TooltipPlacement | string | undefined),
 *   trigger?: string | (() => string | undefined),
 * }} TooltipProps
 */

/**
 * @param {unknown} value
 * @returns {value is HTMLElement}
 */
function isHTMLElement(value) {
    return value instanceof HTMLElement;
}

/**
 * @param {Child} children
 * @returns {HTMLElement | undefined}
 */
function resolveTriggerElement(children) {
    let triggerElement = undefined;
    if (isHTMLElement(children)) {
        triggerElement = children;
    } else if (Array.isArray(children) && children.length === 1 && isHTMLElement(children[0])) {
        triggerElement = children[0];
    }
    return triggerElement;
}

/**
 * @param {TooltipProps['placement']} placement
 */
function readPlacementProp(placement) {
    return typeof placement === 'function' ? placement() : placement;
}

/**
 * @param {TooltipProps['trigger']} trigger
 */
function readTriggerProp(trigger) {
    return typeof trigger === 'function' ? trigger() : trigger;
}

/**
 * Decorates one trigger element with a Neon tooltip popover.
 *
 * @param {TooltipProps} props
 */
export function Tooltip(props) {
    const triggerElement = resolveTriggerElement(props.children);

    if (!triggerElement) {
        if (DEV) {
            // eslint-disable-next-line no-console
            console.debug(
                'Tooltip: expected exactly one HTMLElement child to use as the trigger.',
                props.children,
            );
        }
        return props.children;
    }

    /** @type {import('./tooltip-controller.js').TooltipController[0] | undefined} */
    let updateTooltipController;
    /** @type {import('./tooltip-controller.js').TooltipController[1] | undefined} */
    let destroyTooltipController;

    /** @param {Element | null} tooltipNode */
    const attachTooltip = (tooltipNode) => {
        destroyTooltipController?.();
        updateTooltipController = undefined;
        destroyTooltipController = undefined;

        if (!(tooltipNode instanceof HTMLElement)) {
            return;
        }

        [updateTooltipController, destroyTooltipController] = createTooltipController({
            $_tooltipElement: tooltipNode,
            $_triggerElement: triggerElement,
            $_placement: readPlacementProp(props.placement),
            $_trigger: readTriggerProp(props.trigger),
        });
    };

    const tooltipElement = /** @type {HTMLDivElement} */ (
        <div
            ref={attachTooltip}
            class={`tooltip -${readTooltipPlacement(readPlacementProp(props.placement))}`}
            role="tooltip"
            popover="manual"
        >
            {props.content}
            <div class="tooltip__arrow" />
        </div>
    );

    triggerElement.appendChild(tooltipElement);

    if (typeof props.placement === 'function' || typeof props.trigger === 'function') {
        effect(() => {
            updateTooltipController?.({
                placement: readPlacementProp(props.placement),
                trigger: readTriggerProp(props.trigger),
            });
        });
    }

    return triggerElement;
}
