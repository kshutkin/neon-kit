import { DEV } from 'esm-env';

import { generateId, getActiveElement, isFocusable } from './utils.js';

const PLACEMENTS = /** @type {const} */ (['top', 'bottom', 'left', 'right']);

const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 100;

/**
 * @typedef {'hover' | 'focus' | 'click'} TooltipTrigger
 * @typedef {'top' | 'bottom' | 'left' | 'right'} TooltipPlacement
 * @typedef {HTMLElement & { showPopover: () => void, hidePopover: () => void }} TooltipPopoverElement
 * @typedef {[
 *   update: (options: TooltipControllerUpdate) => void,
 *   destroy: () => void,
 * ]} TooltipController
 * @typedef {{ placement?: string, trigger?: string }} TooltipControllerUpdate
 * @typedef {{
 *   $_tooltipElement: HTMLElement,
 *   $_triggerElement: HTMLElement,
 *   $_placement?: string,
 *   $_trigger?: string,
 * }} TooltipControllerOptions
 */

/** @type {Record<TooltipTrigger, Array<{ $_target: 'trigger' | 'tooltip', $_event: string, $_action: '$_show' | '$_hide' | '$_toggle' | '$_cancelHide' }>>} */
const TRIGGER_BINDINGS = {
    hover: [
        { $_target: 'trigger', $_event: 'pointerenter', $_action: '$_show' },
        { $_target: 'trigger', $_event: 'pointerleave', $_action: '$_hide' },
        { $_target: 'tooltip', $_event: 'pointerenter', $_action: '$_cancelHide' },
        { $_target: 'tooltip', $_event: 'pointerleave', $_action: '$_hide' },
    ],
    focus: [
        { $_target: 'trigger', $_event: 'focusin', $_action: '$_show' },
        { $_target: 'trigger', $_event: 'focusout', $_action: '$_hide' },
    ],
    click: [
        { $_target: 'trigger', $_event: 'click', $_action: '$_toggle' },
    ],
};

/**
 * @param {string | undefined} value
 * @returns {TooltipPlacement}
 */
export function readTooltipPlacement(value) {
    return /** @type {any} */ (PLACEMENTS.includes(/** @type {any} */ (value)) ? value : 'top');
}

/**
 * @param {string | undefined} value
 * @returns {Set<TooltipTrigger>}
 */
export function readTooltipTriggerSet(value) {
    /** @type {Set<TooltipTrigger>} */
    const triggerSet = new Set();
    if (value === undefined) {
        triggerSet.add('hover');
        triggerSet.add('focus');
    } else {
        for (const part of value.trim().split(/\s+/)) {
            if (part === 'hover' || part === 'focus' || part === 'click') {
                triggerSet.add(part);
            }
        }
    }
    return triggerSet;
}

export const isPopoverSupported = () => 'popover' in HTMLElement.prototype;

/**
 * @param {HTMLElement} tooltipElement
 */
function isTooltipOpen(tooltipElement) {
    return tooltipElement.matches(':popover-open');
}

/**
 * @param {TooltipControllerOptions} options
 * @returns {TooltipController}
 */
export function createTooltipController(options) {
    const tooltipElement = options.$_tooltipElement;
    const triggerElement = options.$_triggerElement;

    tooltipElement.setAttribute('popover', 'manual');
    if (!tooltipElement.id) {
        tooltipElement.id = generateId('neon-tooltip');
    }
    tooltipElement.classList.add('tooltip');

    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let delayTimer = undefined;
    /** @type {AbortController | undefined} */
    let listenerController = undefined;
    let ownsAriaDescribedBy = false;
    let anchorName = '';
    let currentPlacement = readTooltipPlacement(options.$_placement);
    let currentTriggerSet = readTooltipTriggerSet(options.$_trigger);

    const clearTimer = () => {
        if (delayTimer) {
            clearTimeout(delayTimer);
            delayTimer = undefined;
        }
    };

    const showPopoverNow = () => {
        clearTimer();
        /** @type {TooltipPopoverElement} */ (tooltipElement).showPopover();
    };

    const hidePopoverNow = () => {
        clearTimer();
        if (isTooltipOpen(tooltipElement)) {
            /** @type {TooltipPopoverElement} */ (tooltipElement).hidePopover();
        }
    };

    /** @param {KeyboardEvent} event */
    const hideOnEscape = (event) => {
        if (event.key === 'Escape') {
            hidePopoverNow();
        }
    };

    const scheduleShow = () => {
        clearTimer();
        delayTimer = setTimeout(() => {
            if (!isTooltipOpen(tooltipElement)) {
                /** @type {TooltipPopoverElement} */ (tooltipElement).showPopover();
            }
        }, OPEN_DELAY_MS);
    };

    const scheduleHide = () => {
        clearTimer();
        delayTimer = setTimeout(() => {
            const activeElement = getActiveElement(tooltipElement);
            const shouldStayOpen = tooltipElement.matches(':hover')
                || triggerElement.matches(':hover')
                || activeElement === triggerElement
                || (activeElement !== null && tooltipElement.contains(activeElement));
            if (!shouldStayOpen && isTooltipOpen(tooltipElement)) {
                /** @type {TooltipPopoverElement} */ (tooltipElement).hidePopover();
            }
        }, CLOSE_DELAY_MS);
    };

    /** @type {Record<'$_show' | '$_hide' | '$_toggle' | '$_cancelHide', () => void>} */
    const actions = {
        $_show: () => scheduleShow(),
        $_hide: () => scheduleHide(),
        $_toggle: () => {
            if (isTooltipOpen(tooltipElement)) {
                hidePopoverNow();
            } else {
                showPopoverNow();
            }
        },
        $_cancelHide: () => clearTimer(),
    };

    /** @param {TooltipPlacement} value */
    const applyPlacementClass = (value) => {
        tooltipElement.classList.remove('-top', '-bottom', '-left', '-right');
        tooltipElement.classList.add(`-${value}`);
    };

    /** @param {Set<TooltipTrigger>} triggers */
    const applyTriggers = (triggers) => {
        listenerController?.abort();
        const listenerControllerForTriggers = new AbortController();
        listenerController = listenerControllerForTriggers;
        const listenerOptions = { signal: listenerControllerForTriggers.signal };
        triggerElement.addEventListener('keydown', hideOnEscape, listenerOptions);
        for (const trigger of triggers) {
            for (const binding of TRIGGER_BINDINGS[trigger]) {
                const target = binding.$_target === 'trigger' ? triggerElement : tooltipElement;
                target.addEventListener(binding.$_event, actions[binding.$_action], listenerOptions);
            }
        }
    };

    const wireAnchor = () => {
        const existingAnchorName = triggerElement.style.getPropertyValue('anchor-name');
        let positionAnchor = existingAnchorName;

        if (existingAnchorName) {
            anchorName = '';
        } else {
            anchorName = `--neon-tooltip-anchor-${tooltipElement.id}`;
            positionAnchor = anchorName;
            triggerElement.style.setProperty('anchor-name', anchorName);
        }

        if (!tooltipElement.style.getPropertyValue('position-anchor')) {
            tooltipElement.style.setProperty('position-anchor', positionAnchor);
        }
    };

    const warnAboutMisuse = () => {
        if (DEV && currentTriggerSet.has('focus') && !isFocusable(triggerElement)) {
            // eslint-disable-next-line no-console
            console.debug(
                'Tooltip: parent element is not focusable; the `focus` trigger will not fire.',
                triggerElement,
            );
        }
        if (DEV && !ownsAriaDescribedBy && triggerElement.hasAttribute('aria-describedby')) {
            // eslint-disable-next-line no-console
            console.debug(
                'Tooltip: trigger already has aria-describedby; tooltip description wiring was skipped.',
                triggerElement,
            );
        }
    };

    wireAnchor();

    if (!triggerElement.hasAttribute('aria-describedby')) {
        triggerElement.setAttribute('aria-describedby', tooltipElement.id);
        ownsAriaDescribedBy = true;
    }

    applyPlacementClass(currentPlacement);
    applyTriggers(currentTriggerSet);
    warnAboutMisuse();

    /** @param {TooltipControllerUpdate} updateOptions */
    const update = (updateOptions) => {
        currentPlacement = readTooltipPlacement(updateOptions.placement);
        currentTriggerSet = readTooltipTriggerSet(updateOptions.trigger);
        applyPlacementClass(currentPlacement);
        applyTriggers(currentTriggerSet);
        warnAboutMisuse();
    };

    const destroy = () => {
        clearTimer();
        listenerController?.abort();
        listenerController = undefined;
        if (ownsAriaDescribedBy && triggerElement.getAttribute('aria-describedby') === tooltipElement.id) {
            triggerElement.removeAttribute('aria-describedby');
        }
        if (anchorName && triggerElement.style.getPropertyValue('anchor-name') === anchorName) {
            triggerElement.style.removeProperty('anchor-name');
        }
        ownsAriaDescribedBy = false;
        anchorName = '';
    };

    return [update, destroy];
}
