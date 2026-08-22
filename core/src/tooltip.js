import { DEV } from 'esm-env';

import { generateId, getActiveElement, isFocusable } from './utils.js';

const PLACEMENTS = /** @type {const} */ (['top', 'bottom', 'left', 'right']);

const HOVER_OPEN_DELAY_MS = 400;
const HOVER_CLOSE_DELAY_MS = 500;

/** @type {HTMLElement | undefined} */
let hoverDelayOwnerElement = undefined;

/**
 * @typedef {'hover' | 'focus' | 'click'} TooltipTrigger
 * @typedef {'top' | 'bottom' | 'left' | 'right'} TooltipPlacement
 * @typedef {HTMLElement & { showPopover: () => void, hidePopover: () => void }} TooltipPopoverElement
 * @typedef {[
 *   update: (options: TooltipControllerUpdate) => void,
 *   destroy: () => void,
 * ]} TooltipController
 * @typedef {{ placement?: string, trigger?: string }} TooltipControllerUpdate
 * @typedef {[
 *   tooltipElement: HTMLElement,
 *   triggerElement: HTMLElement,
 *   placement?: string,
 *   trigger?: string,
 * ]} TooltipControllerOptions
 */

/** @type {Record<TooltipTrigger, Array<{ $_target: 'trigger' | 'tooltip', $_event: string, $_action: '$_showNow' | '$_hideNow' | '$_scheduleShow' | '$_scheduleHide' | '$_toggle' | '$_cancelHide' }>>} */
const TRIGGER_BINDINGS = {
    hover: [
        { $_target: 'trigger', $_event: 'pointerenter', $_action: '$_scheduleShow' },
        { $_target: 'trigger', $_event: 'pointerleave', $_action: '$_scheduleHide' },
        { $_target: 'tooltip', $_event: 'pointerenter', $_action: '$_cancelHide' },
        { $_target: 'tooltip', $_event: 'pointerleave', $_action: '$_scheduleHide' },
    ],
    focus: [
        { $_target: 'trigger', $_event: 'focusin', $_action: '$_showNow' },
        { $_target: 'trigger', $_event: 'focusout', $_action: '$_hideNow' },
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
 * @param {TooltipControllerOptions} controllerOptions
 * @returns {TooltipController}
 */
export function createTooltipController(controllerOptions) {
    const [tooltipElement, triggerElement, placement, trigger] = controllerOptions;

    tooltipElement.setAttribute('popover', 'manual');
    if (!tooltipElement.id) {
        tooltipElement.id = generateId('neon-tooltip');
    }
    tooltipElement.classList.add('tooltip');

    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let delayTimer = undefined;
    /** @type {AbortController | undefined} */
    let listenerController = undefined;
    let anchorName = '';
    let currentPlacement = readTooltipPlacement(placement);
    let currentTriggerSet = readTooltipTriggerSet(trigger);

    const clearTimer = () => {
        if (delayTimer) {
            clearTimeout(delayTimer);
            delayTimer = undefined;
        }
    };

    const releaseHoverDelay = () => {
        if (hoverDelayOwnerElement === tooltipElement) {
            hoverDelayOwnerElement = undefined;
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
        releaseHoverDelay();
    };

    /** @param {KeyboardEvent} event */
    const hideOnEscape = (event) => {
        if (event.key === 'Escape') {
            hidePopoverNow();
        }
    };

    const shouldStayOpen = () => {
        const activeElement = getActiveElement(tooltipElement);
        return tooltipElement.matches(':hover')
            || triggerElement.matches(':hover')
            || activeElement === triggerElement
            || (activeElement !== null && tooltipElement.contains(activeElement));
    };

    const hidePopoverIfInactive = () => {
        clearTimer();
        if (!shouldStayOpen()) {
            if (isTooltipOpen(tooltipElement)) {
                /** @type {TooltipPopoverElement} */ (tooltipElement).hidePopover();
            }
            releaseHoverDelay();
        }
    };

    const showPopoverOnHover = () => {
        clearTimer();
        if (!isTooltipOpen(tooltipElement)) {
            /** @type {TooltipPopoverElement} */ (tooltipElement).showPopover();
        }
        hoverDelayOwnerElement = tooltipElement;
    };

    const scheduleShow = () => {
        clearTimer();
        if (hoverDelayOwnerElement) {
            showPopoverOnHover();
        } else {
            delayTimer = setTimeout(() => {
                showPopoverOnHover();
            }, HOVER_OPEN_DELAY_MS);
        }
    };

    const scheduleHide = () => {
        clearTimer();
        delayTimer = setTimeout(() => {
            hidePopoverIfInactive();
        }, HOVER_CLOSE_DELAY_MS);
    };

    /** @type {Record<'$_showNow' | '$_hideNow' | '$_scheduleShow' | '$_scheduleHide' | '$_toggle' | '$_cancelHide', () => void>} */
    const actions = {
        $_showNow: () => showPopoverNow(),
        $_hideNow: () => hidePopoverIfInactive(),
        $_scheduleShow: () => scheduleShow(),
        $_scheduleHide: () => scheduleHide(),
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
    };

    wireAnchor();

    const describedByIds = triggerElement.getAttribute('aria-describedby')?.trim();
    triggerElement.setAttribute(
        'aria-describedby',
        describedByIds ? `${describedByIds} ${tooltipElement.id}` : tooltipElement.id,
    );

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
        releaseHoverDelay();
        listenerController?.abort();
        listenerController = undefined;
        const describedByIds = triggerElement.getAttribute('aria-describedby')
            ?.trim()
            .split(/\s+/)
            .filter((id) => id !== tooltipElement.id) ?? [];
        if (describedByIds.length) {
            triggerElement.setAttribute('aria-describedby', describedByIds.join(' '));
        } else {
            triggerElement.removeAttribute('aria-describedby');
        }
        if (anchorName && triggerElement.style.getPropertyValue('anchor-name') === anchorName) {
            triggerElement.style.removeProperty('anchor-name');
        }
        anchorName = '';
    };

    return [update, destroy];
}
