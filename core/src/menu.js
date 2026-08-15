import { generateId, getActiveElement, isDisabled } from './utils.js';

/**
 * @typedef {{
 *     menu: string;
 *     item: string;
 *     ownedItem: string;
 * }} MenuSelectors
 * @typedef {{
 *     $_registerOpenMenu: (menu: HTMLElement) => void;
 *     $_unregisterOpenMenu: (menu: HTMLElement) => void;
 *     $_closeAll: () => void;
 * }} MenuRootController
 * @typedef {{
 *     $_refreshItems: () => void;
 *     $_clearItems: () => void;
 *     $_handleKeyDown: (event: KeyboardEvent) => void;
 *     $_handleFocusIn: (event: FocusEvent) => void;
 *     $_handleToggle: (event: ToggleEvent) => void;
 * }} MenuController
 * @typedef {{
 *     $_sync: (preferredTrigger?: HTMLElement | null) => void;
 *     $_clear: () => void;
 * }} MenuLabelController
 */

/**
 * @param {HTMLElement} target
 * @returns {boolean}
 */
export function isOpenPopover(target) {
    return target.matches(':popover-open');
}

/**
 * @param {HTMLElement} host
 * @returns {HTMLElement | undefined}
 */
export function getPopoverTarget(host) {
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
 * @returns {MenuRootController}
 */
export function createMenuRootController() {
    /** @type {Set<HTMLElement>} */
    const openMenus = new Set();

    return {
        $_registerOpenMenu(menu) {
            openMenus.add(menu);
        },
        $_unregisterOpenMenu(menu) {
            openMenus.delete(menu);
        },
        $_closeAll() {
            for (const menu of Array.from(openMenus).reverse()) {
                if (menu.isConnected && isOpenPopover(menu)) {
                    menu.hidePopover();
                }
            }
            openMenus.clear();
        },
    };
}

/**
 * @param {HTMLElement} item
 * @param {MenuSelectors} selectors
 * @returns {HTMLElement | undefined}
 */
function getMenuPopoverTarget(item, selectors) {
    const popoverTarget = getPopoverTarget(item);
    return popoverTarget?.matches(`${selectors.menu}[popover]`) === true
        && item.getAttribute('popovertargetaction') !== 'hide'
        ? popoverTarget
        : undefined;
}

/**
 * @param {HTMLElement} menu
 * @param {HTMLElement | undefined} restoreFocusElement
 * @param {MenuSelectors} selectors
 * @returns {HTMLElement | undefined}
 */
function getParentMenuItem(menu, restoreFocusElement, selectors) {
    let parentItem;
    if (
        restoreFocusElement?.matches(selectors.item) === true
        && restoreFocusElement.closest(selectors.menu) !== null
        && getPopoverTarget(restoreFocusElement) === menu
    ) {
        parentItem = restoreFocusElement;
    } else {
        const root = menu.getRootNode();
        if (root instanceof Document || root instanceof ShadowRoot) {
            parentItem = /** @type {HTMLElement | undefined} */ (
                Array.from(root.querySelectorAll(selectors.item)).find((item) => (
                    item instanceof HTMLElement
                    && item.closest(selectors.menu) !== null
                    && getPopoverTarget(item) === menu
                ))
            );
        }
    }
    return parentItem;
}

/**
 * @param {HTMLElement} host
 * @param {() => MenuRootController | undefined} getRootController
 * @param {() => readonly HTMLElement[]} getItems
 * @param {MenuSelectors} selectors
 * @returns {MenuController}
 */
export function createMenuController(host, getRootController, getItems, selectors) {
    /** @type {HTMLElement | undefined} */
    let restoreFocusElement;
    /** @type {readonly HTMLElement[]} */
    let previousItems = [];

    /** @returns {HTMLElement | undefined} */
    const getActiveItem = () => {
        const activeElement = getActiveElement(host);
        return activeElement instanceof HTMLElement && getItems().includes(activeElement)
            ? activeElement
            : undefined;
    };
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
    /**
     * @param {EventTarget | null} target
     * @returns {HTMLElement | undefined}
     */
    const getEventItem = (target) => {
        let eventItem;
        if (target instanceof Element) {
            const closestMenu = target.closest(selectors.menu);
            if (closestMenu === host) {
                const closestItem = target.closest(selectors.item);
                if (closestItem instanceof HTMLElement && getItems().includes(closestItem)) {
                    eventItem = closestItem;
                }
            }
        }
        return eventItem;
    };

    /** @param {HTMLElement | undefined} rovingItem */
    const setRovingTabindex = (rovingItem) => {
        for (const item of getItems()) {
            item.setAttribute('tabindex', item === rovingItem ? '0' : '-1');
        }
    };

    const refreshItems = () => {
        const items = getItems();
        for (const previousItem of previousItems) {
            if (!items.includes(previousItem)) {
                previousItem.removeAttribute('tabindex');
            }
        }
        previousItems = items;
        const activeItem = getActiveItem();
        const rovingItem = activeItem !== undefined
            ? activeItem
            : items[0];
        setRovingTabindex(rovingItem);
    };

    /** @param {HTMLElement} item */
    const focusItem = (item) => {
        setRovingTabindex(item);
        item.focus();
    };

    return {
        $_refreshItems: refreshItems,
        $_clearItems() {
            for (const item of previousItems) {
                item.removeAttribute('tabindex');
            }
            previousItems = [];
        },
        $_handleKeyDown(event) {
            const items = getItems();
            const shouldHandleEvent = event.target === host || getEventItem(event.target) !== undefined;
            if (items.length > 0 && shouldHandleEvent) {
                const currentItem = getActiveItem();
                const currentItemIndex = currentItem !== undefined ? items.indexOf(currentItem) : -1;
                let handled = false;

                switch (event.key) {
                    case 'ArrowDown':
                        event.preventDefault();
                        focusItem(items[(currentItemIndex + 1 + items.length) % items.length]);
                        handled = true;
                        break;
                    case 'ArrowUp':
                        event.preventDefault();
                        focusItem(items[(currentItemIndex - 1 + items.length) % items.length]);
                        handled = true;
                        break;
                    case 'Home':
                        event.preventDefault();
                        focusItem(items[0]);
                        handled = true;
                        break;
                    case 'End':
                        event.preventDefault();
                        focusItem(items[items.length - 1]);
                        handled = true;
                        break;
                    case 'ArrowRight': {
                        const submenu = currentItem === undefined || isDisabled(currentItem)
                            ? undefined
                            : getMenuPopoverTarget(currentItem, selectors);
                        if (submenu !== undefined) {
                            event.preventDefault();
                            if (!isOpenPopover(submenu)) {
                                /** @type {HTMLElement & { showPopover: (options?: { source?: HTMLElement }) => void }} */ (submenu)
                                    .showPopover({ source: currentItem });
                            }
                            const firstSubmenuItem = /** @type {HTMLElement | null} */ (
                                submenu.querySelector(selectors.ownedItem)
                            );
                            firstSubmenuItem?.focus();
                            handled = true;
                        }
                        break;
                    }
                    case 'ArrowLeft': {
                        const parentItem = getParentMenuItem(host, restoreFocusElement, selectors);
                        if (parentItem !== undefined && isOpenPopover(host)) {
                            event.preventDefault();
                            host.hidePopover();
                            parentItem.focus();
                            handled = true;
                        }
                        break;
                    }
                    case 'Enter':
                    case ' ':
                        if (currentItem !== undefined) {
                            event.preventDefault();
                            if (!isDisabled(currentItem)) {
                                currentItem.click();
                            }
                            handled = true;
                        }
                        break;
                }

                if (handled) {
                    event.stopPropagation();
                }
            }
        },
        $_handleFocusIn(event) {
            const focusedItem = getEventItem(event.target);
            if (focusedItem !== undefined) {
                setRovingTabindex(focusedItem);
            }
        },
        $_handleToggle(event) {
            if (event.target === host) {
                const activeElement = getActiveElement(host);
                const rootController = getRootController();
                if (event.newState === 'open') {
                    rootController?.$_registerOpenMenu(host);
                    const eventSource = /** @type {ToggleEvent & { source?: Element | null }} */ (event).source;
                    const focusCandidate = canRestoreFocusTo(eventSource)
                        ? eventSource
                        : activeElement;
                    restoreFocusElement = canRestoreFocusTo(focusCandidate)
                        && !canRestoreFocusFrom(focusCandidate)
                        ? focusCandidate
                        : undefined;
                    const firstItem = getItems()[0];
                    if (firstItem !== undefined) {
                        focusItem(firstItem);
                    }
                } else {
                    rootController?.$_unregisterOpenMenu(host);
                    if (
                        canRestoreFocusFrom(activeElement)
                        && canRestoreFocusTo(restoreFocusElement)
                    ) {
                        restoreFocusElement.focus();
                    }
                    restoreFocusElement = undefined;
                }
            }
        },
    };
}

/**
 * @param {HTMLElement} menu
 * @param {HTMLElement | null | undefined} preferredTrigger
 * @returns {HTMLElement | undefined}
 */
function getPopoverTrigger(menu, preferredTrigger) {
    let trigger;
    if (
        preferredTrigger instanceof HTMLElement
        && (
            getPopoverTarget(preferredTrigger) === menu
            || (
                !menu.isConnected
                && preferredTrigger.getAttribute('popovertarget') === menu.id
            )
        )
    ) {
        trigger = preferredTrigger;
    } else {
        const root = menu.getRootNode();
        if (root instanceof Document || root instanceof ShadowRoot) {
            trigger = /** @type {HTMLElement | undefined} */ (
                Array.from(root.querySelectorAll('[popovertarget]')).find((candidate) => (
                    candidate instanceof HTMLElement && getPopoverTarget(candidate) === menu
                ))
            );
        }
    }
    return trigger;
}

/**
 * @param {HTMLElement} host
 * @returns {MenuLabelController}
 */
export function createMenuLabelController(host) {
    /** @type {HTMLElement | undefined} */
    let generatedIdTrigger;
    /** @type {string | undefined} */
    let generatedTriggerId;
    /** @type {string | undefined} */
    let managedLabelledBy;

    const clearGeneratedId = () => {
        if (generatedIdTrigger !== undefined && generatedIdTrigger.id === generatedTriggerId) {
            generatedIdTrigger.removeAttribute('id');
        }
        generatedIdTrigger = undefined;
        generatedTriggerId = undefined;
    };

    const clearManagedLabel = () => {
        if (host.getAttribute('aria-labelledby') === managedLabelledBy) {
            host.removeAttribute('aria-labelledby');
        }
        managedLabelledBy = undefined;
        clearGeneratedId();
    };

    return {
        $_sync(preferredTrigger) {
            const currentLabelledBy = host.getAttribute('aria-labelledby');
            const hasConsumerLabel = host.hasAttribute('aria-label')
                || (currentLabelledBy !== null && currentLabelledBy !== managedLabelledBy);
            if (hasConsumerLabel) {
                clearManagedLabel();
            } else {
                const trigger = getPopoverTrigger(host, preferredTrigger);
                if (trigger === undefined) {
                    clearManagedLabel();
                } else {
                    if (generatedIdTrigger !== undefined && generatedIdTrigger !== trigger) {
                        clearGeneratedId();
                    }
                    if (trigger.id === '') {
                        generatedTriggerId = generateId('neon-menu-trigger');
                        generatedIdTrigger = trigger;
                        trigger.id = generatedTriggerId;
                    }
                    managedLabelledBy = trigger.id;
                    if (currentLabelledBy !== managedLabelledBy) {
                        host.setAttribute('aria-labelledby', managedLabelledBy);
                    }
                }
            }
        },
        $_clear() {
            clearManagedLabel();
        },
    };
}
