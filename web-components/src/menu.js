/**
 * `<neon-menu>` — keyboard navigation + roving tabindex for
 * `<neon-menu-item>` children styled by `@neon-kit/theme`.
 *
 * The element is Light DOM: it expects items to be authored as
 * `<neon-menu-item>` elements. Menu item contents remain fully
 * consumer-authored.
 *
 * - Roving tabindex across `<neon-menu-item>` rows. Disabled items are
 *   skipped (`[disabled]` or `aria-disabled="true"`).
 * - Arrow Up / Down move between items, Home / End jump to first / last.
 * - Enter / Space activate the focused item via `click()`.
 * - `role="menu"` on the host. `<neon-menu-item>` provides item role.
 *
 * Per ADR 0001 the element renders into Light DOM (no shadow root).
 */
import { defineElement, internals, onMount, withInternals } from '@slimlib/element';

import { getActiveElement } from './utils.js';

const ITEM_SELECTOR = 'neon-menu-item';

/**
 * @param {Element} element
 * @returns {boolean}
 */
function isDisabled(element) {
    return element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
}

/**
 * @param {HTMLElement} host
 */
const renderMenu = (host) => {
    const elementInternals = internals();
    elementInternals.role = 'menu';

    /** @returns {HTMLElement | undefined} */
    const getActiveItem = () => {
        const activeElement = getActiveElement(host);
        let activeItem;
        if (
            activeElement instanceof HTMLElement
            && host.contains(activeElement)
            && activeElement.matches(ITEM_SELECTOR)
        ) {
            activeItem = activeElement;
        }
        return activeItem;
    };
    /** @returns {HTMLElement[]} */
    const getItems = () => Array.from(host.children)
        .filter((item) => item.matches(ITEM_SELECTOR))
        .map((item) => /** @type {HTMLElement} */ (item));
    /** @returns {HTMLElement[]} */
    const getFocusableItems = () => getItems().filter((item) => !isDisabled(item));
    /**
     * @param {Element | undefined | null} element
     * @returns {element is HTMLElement}
     */
    const canRestoreFocusTo = (element) => element instanceof HTMLElement
        && element.isConnected
        && !isDisabled(element);
    /**
     * @param {Element | null} element
     * @returns {element is HTMLElement}
     */
    const canRestoreFocusFrom = (element) => element instanceof HTMLElement
        && host.contains(element);

    /** @type {HTMLElement | undefined} */
    let restoreFocusElement;

    const refreshItems = () => {
        const items = getItems();
        if (items.length > 0) {
            const activeItem = getActiveItem();
            let assignedRovingItem = false;
            for (const item of items) {
                if (isDisabled(item)) {
                    item.setAttribute('tabindex', '-1');
                } else if (activeItem === item) {
                    item.setAttribute('tabindex', '0');
                    assignedRovingItem = true;
                } else {
                    item.setAttribute('tabindex', '-1');
                }
            }

            if (!assignedRovingItem) {
                const firstFocusableItem = getFocusableItems()[0];
                if (firstFocusableItem !== undefined) {
                    firstFocusableItem.setAttribute('tabindex', '0');
                }
            }
        }
    };

    /** @param {HTMLElement} item */
    const focusItem = (item) => {
        for (const menuItem of getItems()) {
            menuItem.setAttribute('tabindex', menuItem === item ? '0' : '-1');
        }
        item.focus();
    };

    /** @param {KeyboardEvent} event */
    const onKeyDown = (event) => {
        const items = getFocusableItems();
        if (items.length > 0) {
            const currentItem = getActiveItem();
            const currentItemIndex = currentItem !== undefined ? items.indexOf(currentItem) : -1;

            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault();
                    focusItem(items[(currentItemIndex + 1 + items.length) % items.length]);
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    focusItem(items[(currentItemIndex - 1 + items.length) % items.length]);
                    break;
                case 'Home':
                    event.preventDefault();
                    focusItem(items[0]);
                    break;
                case 'End':
                    event.preventDefault();
                    focusItem(items[items.length - 1]);
                    break;
                case 'Enter':
                case ' ':
                    if (currentItem !== undefined) {
                        event.preventDefault();
                        currentItem.click();
                    }
                    break;
            }
        }
    };

    /** @param {FocusEvent} event */
    const onFocusIn = (event) => {
        if (
            event.target instanceof HTMLElement
            && event.target.matches(ITEM_SELECTOR)
            && !isDisabled(event.target)
        ) {
            for (const item of getItems()) {
                item.setAttribute('tabindex', item === event.target ? '0' : '-1');
            }
        }
    };

    /** @param {ToggleEvent} event */
    const onToggle = (event) => {
        const activeElement = getActiveElement(host);
        if (event.newState === 'open') {
            restoreFocusElement = canRestoreFocusTo(activeElement)
                && !canRestoreFocusFrom(activeElement)
                ? activeElement
                : undefined;
            const firstFocusableItem = getFocusableItems()[0];
            if (firstFocusableItem !== undefined) {
                focusItem(firstFocusableItem);
            }
        } else {
            if (
                canRestoreFocusFrom(activeElement)
                && canRestoreFocusTo(restoreFocusElement)
            ) {
                restoreFocusElement.focus();
            }
            restoreFocusElement = undefined;
        }
    };

    onMount(() => {
        const abortController = new AbortController();
        const listenerOptions = { signal: abortController.signal };
        host.addEventListener('keydown', onKeyDown, listenerOptions);
        host.addEventListener('focusin', onFocusIn, listenerOptions);
        host.addEventListener('toggle', /** @type {EventListener} */ (onToggle), listenerOptions);
        refreshItems();
        const mutationObserver = new MutationObserver(() => refreshItems());
        mutationObserver.observe(host, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['disabled', 'aria-disabled'],
        });

        return () => {
            abortController.abort();
            mutationObserver.disconnect();
        };
    });

    return null;
};

/**
 * Public instance type of the `<neon-menu>` element.
 *
 * @typedef {HTMLElement} NeonMenuElement
 */

defineElement('neon-menu', [withInternals()], renderMenu);

/**
 * @param {HTMLElement} host
 * @returns {HTMLElement | undefined}
 */
function getPopoverTarget(host) {
    const targetId = host.getAttribute('popovertarget');
    const root = host.getRootNode();
    let target = undefined;
    if (targetId !== null && (root instanceof Document || root instanceof ShadowRoot)) {
        const candidate = root.getElementById(targetId);
        if (candidate instanceof HTMLElement) {
            target = candidate;
        }
    }
    return target;
}

/**
 * @param {HTMLElement} target
 * @returns {boolean}
 */
function isOpenPopover(target) {
    return target.matches(':popover-open');
}

/**
 * @param {HTMLElement} host
 */
const renderMenuItem = (host) => {
    const elementInternals = internals();
    elementInternals.role = 'menuitem';

    const syncAccessibility = () => {
        const popoverTarget = getPopoverTarget(host);
        elementInternals.ariaDisabled = isDisabled(host) ? 'true' : null;
        elementInternals.ariaHasPopup = popoverTarget === undefined ? null : 'menu';
        elementInternals.ariaExpanded = popoverTarget === undefined ? null : String(isOpenPopover(popoverTarget));
    };

    /** @param {MouseEvent} event */
    const onClick = (event) => {
        if (isDisabled(host)) {
            event.preventDefault();
            event.stopImmediatePropagation();
        } else {
            const popoverTarget = getPopoverTarget(host);
            if (popoverTarget !== undefined) {
                const popoverTargetAction = host.getAttribute('popovertargetaction') ?? 'toggle';
                if (popoverTargetAction === 'show') {
                    /** @type {HTMLElement & { showPopover: (options?: { source?: HTMLElement }) => void }} */ (popoverTarget)
                        .showPopover({ source: host });
                } else if (popoverTargetAction === 'hide') {
                    popoverTarget.hidePopover();
                } else {
                    /** @type {HTMLElement & { togglePopover: (options?: { source?: HTMLElement }) => boolean }} */ (popoverTarget)
                        .togglePopover({ source: host });
                }
            }
        }
    };

    onMount(() => {
        const abortController = new AbortController();
        const listenerOptions = { signal: abortController.signal };
        host.addEventListener('click', onClick, listenerOptions);
        /** @type {AbortController | undefined} */
        let popoverTargetAbortController;
        /** @type {HTMLElement | undefined} */
        let observedPopoverTarget;

        const syncObservedPopoverTarget = () => {
            const nextPopoverTarget = getPopoverTarget(host);
            if (nextPopoverTarget !== observedPopoverTarget) {
                popoverTargetAbortController?.abort();
                observedPopoverTarget = nextPopoverTarget;
                if (observedPopoverTarget !== undefined) {
                    popoverTargetAbortController = new AbortController();
                    observedPopoverTarget.addEventListener('toggle', syncAccessibility, {
                        signal: popoverTargetAbortController.signal,
                    });
                } else {
                    popoverTargetAbortController = undefined;
                }
            }
            syncAccessibility();
        };

        syncObservedPopoverTarget();

        const mutationObserver = new MutationObserver(syncObservedPopoverTarget);
        mutationObserver.observe(host, {
            attributes: true,
            attributeFilter: ['disabled', 'aria-disabled', 'popovertarget'],
        });

        const popoverTargetObserver = new MutationObserver(syncObservedPopoverTarget);
        popoverTargetObserver.observe(host.getRootNode(), {
            childList: true,
            subtree: true,
        });

        return () => {
            abortController.abort();
            popoverTargetAbortController?.abort();
            mutationObserver.disconnect();
            popoverTargetObserver.disconnect();
        };
    });

    return null;
};

/**
 * Public instance type of the `<neon-menu-item>` element.
 *
 * @typedef {HTMLElement} NeonMenuItemElement
 */

defineElement('neon-menu-item', [withInternals()], renderMenuItem);
