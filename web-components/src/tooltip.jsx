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
import { DEV } from 'esm-env';

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

import { generateId, getActiveElement, isFocusable } from './utils.js';

const PLACEMENTS = /** @type {const} */ (['top', 'bottom', 'left', 'right']);

const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 100;

/**
 * @typedef {'hover' | 'focus' | 'click'} Trigger
 * @typedef {HTMLElement & { showPopover: () => void, hidePopover: () => void }} TooltipHost
 */

/** @type {Record<Trigger, Array<{ $_target: 'parent' | 'self', $_event: string, $_action: '$_show' | '$_hide' | '$_toggle' | '$_cancelHide' }>>} */
const TRIGGER_BINDINGS = {
    hover: [
        { $_target: 'parent', $_event: 'pointerenter', $_action: '$_show' },
        { $_target: 'parent', $_event: 'pointerleave', $_action: '$_hide' },
        { $_target: 'self', $_event: 'pointerenter', $_action: '$_cancelHide' },
        { $_target: 'self', $_event: 'pointerleave', $_action: '$_hide' },
    ],
    focus: [
        { $_target: 'parent', $_event: 'focusin', $_action: '$_show' },
        { $_target: 'parent', $_event: 'focusout', $_action: '$_hide' },
    ],
    click: [
        { $_target: 'parent', $_event: 'click', $_action: '$_toggle' },
    ],
};

const isPopoverSupported = () => 'popover' in HTMLElement.prototype;

/**
 * @param {string | undefined} value
 * @returns {'top' | 'bottom' | 'left' | 'right'}
 */
function readPlacement(value) {
    return /** @type {any} */ (PLACEMENTS.includes(/** @type {any} */ (value)) ? value : 'top');
}

/**
 * @param {string | undefined} value
 * @returns {Set<Trigger>}
 */
function readTriggerSet(value) {
    /** @type {Set<Trigger>} */
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

/**
 * @param {HTMLElement} host
 */
function isTooltipOpen(host) {
    return host.matches(':popover-open');
}

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

    /** @type {HTMLElement | null | undefined} */
    let triggerElement;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let delayTimer;
    /** @type {AbortController | undefined} */
    let listenerController = undefined;
    let ownsAriaDescribedBy = false;
    let anchorName = '';

    const clearTimer = () => {
        if (delayTimer) {
            clearTimeout(delayTimer);
            delayTimer = undefined;
        }
    };

    const showPopoverNow = () => {
        clearTimer();
        /** @type {TooltipHost} */ (host).showPopover();
    };

    const hidePopoverNow = () => {
        clearTimer();
        if (isTooltipOpen(host)) {
            /** @type {TooltipHost} */ (host).hidePopover();
        }
    };

    /** @param {KeyboardEvent} event */
    const hideOnEscape = (event) => {
        if (event.key === 'Escape') {
            hidePopoverNow();
        }
    };

    /** @param {number} delay */
    const scheduleShow = (delay = OPEN_DELAY_MS) => {
        clearTimer();
        delayTimer = setTimeout(() => {
            if (!isTooltipOpen(host)) {
                /** @type {TooltipHost} */ (host).showPopover();
            }
        }, delay);
    };

    /** @param {number} delay */
    const scheduleHide = (delay = CLOSE_DELAY_MS) => {
        clearTimer();
        delayTimer = setTimeout(() => {
            const activeElement = getActiveElement(host);
            const shouldStayOpen = host.matches(':hover')
                || triggerElement?.matches(':hover') === true
                || activeElement === triggerElement
                || (activeElement !== null && host.contains(activeElement));
            if (!shouldStayOpen) {
                if (isTooltipOpen(host)) {
                    /** @type {TooltipHost} */ (host).hidePopover();
                }
            }
        }, delay);
    };

    /** @type {Record<'$_show' | '$_hide' | '$_toggle' | '$_cancelHide', () => void>} */
    const actions = {
        $_show: () => scheduleShow(),
        $_hide: () => scheduleHide(),
        $_toggle: () => {
            if (isTooltipOpen(host)) {
                hidePopoverNow();
            } else {
                showPopoverNow();
            }
        },
        $_cancelHide: () => clearTimer(),
    };

    /** @param {'top' | 'bottom' | 'left' | 'right'} value */
    const applyPlacementClass = (value) => {
        host.classList.remove('-top', '-bottom', '-left', '-right');
        host.classList.add(`-${value}`);
    };

    /** @param {Set<Trigger>} triggers */
    const applyTriggers = (triggers) => {
        listenerController?.abort();
        if (triggerElement) {
            const listenerControllerForTriggers = new AbortController();
            listenerController = listenerControllerForTriggers;
            const listenerOptions = { signal: listenerControllerForTriggers.signal };
            triggerElement.addEventListener('keydown', hideOnEscape, listenerOptions);
            for (const trigger of triggers) {
                for (const binding of TRIGGER_BINDINGS[trigger]) {
                    const target = binding.$_target === 'parent' ? triggerElement : host;
                    target.addEventListener(binding.$_event, actions[binding.$_action], listenerOptions);
                }
            }
        }
    };

    effect(() => {
        applyPlacementClass(readPlacement(state.placement));
    });

    effect(() => {
        applyTriggers(readTriggerSet(state.trigger));
    });

    onConnect(() => {
        triggerElement = host.parentElement;
        if (triggerElement) {
            const existingAnchorName = triggerElement.style.getPropertyValue('anchor-name');
            if (existingAnchorName) {
                anchorName = '';
                if (!host.style.getPropertyValue('position-anchor')) {
                    host.style.setProperty('position-anchor', existingAnchorName);
                }
            } else {
                anchorName = `--neon-tooltip-anchor-${host.id}`;
                triggerElement.style.setProperty('anchor-name', anchorName);
                if (!host.style.getPropertyValue('position-anchor')) {
                    host.style.setProperty('position-anchor', anchorName);
                }
            }

            if (!triggerElement.hasAttribute('aria-describedby')) {
                triggerElement.setAttribute('aria-describedby', host.id);
                ownsAriaDescribedBy = true;
            }

            const triggerSet = readTriggerSet(state.trigger);
            applyPlacementClass(readPlacement(state.placement));
            applyTriggers(triggerSet);

            if (DEV && triggerSet.has('focus') && !isFocusable(triggerElement)) {
                // eslint-disable-next-line no-console
                console.debug(
                    '<neon-tooltip>: parent element is not focusable; the `focus` trigger will not fire.',
                    triggerElement,
                );
            }
        }
    });

    onDisconnect(() => {
        clearTimer();
        listenerController?.abort();
        listenerController = undefined;
        if (triggerElement) {
            if (ownsAriaDescribedBy && triggerElement.getAttribute('aria-describedby') === host.id) {
                triggerElement.removeAttribute('aria-describedby');
            }
            if (anchorName && triggerElement.style.getPropertyValue('anchor-name') === anchorName) {
                triggerElement.style.removeProperty('anchor-name');
            }
        }
        triggerElement = undefined;
        ownsAriaDescribedBy = false;
        anchorName = '';
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
