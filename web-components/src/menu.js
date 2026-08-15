/**
 * `<neon-menu>` — keyboard navigation + roving tabindex for
 * `<neon-menu-item>` children styled by `@neon-kit/theme`.
 *
 * The element is Light DOM: it expects items to be authored as
 * `<neon-menu-item>` elements. Menu item contents remain fully
 * consumer-authored.
 *
 * - Roving tabindex across owned `<neon-menu-item>` rows, including disabled
 *   items as required by the APG menu pattern.
 * - Arrow Up / Down move between items, Home / End jump to first / last.
 * - Arrow Right opens a submenu; Arrow Left closes it and restores focus.
 * - Enter / Space activate an enabled focused item via `click()`.
 * - `role="menu"` on the host. `<neon-menu-item>` provides item role.
 *
 * Per ADR 0001 the element renders into Light DOM (no shadow root).
 */
import {
    ContextRequestEvent,
    attributes,
    booleanAttribute,
    createContext,
    defineElement,
    internals,
    onConnect,
    onDisconnect,
    onMount,
    props,
    requestContext,
    rootContextProvider,
    stringAttribute,
    withInternals,
} from '@slimlib/element';
import { queryChildren } from '@slimlib/jsx/query-children';
import { effect } from '@slimlib/store';

import { generateId, getActiveElement, isDisabled } from '@neon-kit/core/utils';

const ITEM_SELECTOR = 'neon-menu-item';
const MENU_SELECTOR = 'neon-menu';
const OWNED_ITEM_SELECTOR = `:scope ${ITEM_SELECTOR}:not(:scope ${MENU_SELECTOR} ${ITEM_SELECTOR})`;

/**
 * @typedef {{
 *     $_registerOpenMenu: (menu: HTMLElement) => void;
 *     $_unregisterOpenMenu: (menu: HTMLElement) => void;
 *     $_closeAll: () => void;
 * }} MenuRootController
 *
 * @typedef {{
 *     $_host: HTMLElement;
 *     $_refreshItems: () => void;
 *     $_clearItems: () => void;
 *     $_handleKeyDown: (event: KeyboardEvent) => void;
 *     $_handleFocusIn: (event: FocusEvent) => void;
 *     $_handleToggle: (event: ToggleEvent) => void;
 * }} MenuController
 */

/** @type {import('@slimlib/element').Context<symbol, MenuRootController>} */
const MenuRootContext = createContext(Symbol());

/**
 * @param {HTMLElement} target
 * @returns {boolean}
 */
function isOpenPopover(target) {
    return target.matches(':popover-open');
}

/**
 * @returns {MenuRootController}
 */
function createMenuRootController() {
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
 * @param {HTMLElement} host
 * @param {MenuRootController | undefined} rootController
 * @param {import('@slimlib/store').Signal<readonly HTMLElement[]>} itemQuery
 * @returns {MenuController}
 */
function createMenuController(host, rootController, itemQuery) {
    /** @type {HTMLElement | undefined} */
    let restoreFocusElement;
    /** @type {readonly HTMLElement[]} */
    let previousItems = [];

    /** @returns {readonly HTMLElement[]} */
    const getItems = () => itemQuery();
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
            const closestMenu = target.closest(MENU_SELECTOR);
            if (closestMenu === host) {
                const closestItem = target.closest(ITEM_SELECTOR);
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
        $_host: host,
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
                            : getMenuPopoverTarget(currentItem);
                        if (submenu !== undefined) {
                            event.preventDefault();
                            if (!isOpenPopover(submenu)) {
                                /** @type {HTMLElement & { showPopover: (options?: { source?: HTMLElement }) => void }} */ (submenu)
                                    .showPopover({ source: currentItem });
                            }
                            const firstSubmenuItem = /** @type {HTMLElement | null} */ (
                                submenu.querySelector(OWNED_ITEM_SELECTOR)
                            );
                            firstSubmenuItem?.focus();
                            handled = true;
                        }
                        break;
                    }
                    case 'ArrowLeft': {
                        const parentItem = getParentMenuItem(host, restoreFocusElement);
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
 * @param {HTMLElement} item
 * @returns {HTMLElement | undefined}
 */
function getMenuPopoverTarget(item) {
    const popoverTarget = getPopoverTarget(item);
    return popoverTarget?.matches(`${MENU_SELECTOR}[popover]`) === true
        && item.getAttribute('popovertargetaction') !== 'hide'
        ? popoverTarget
        : undefined;
}

/**
 * @param {HTMLElement} menu
 * @param {HTMLElement | undefined} restoreFocusElement
 * @returns {HTMLElement | undefined}
 */
function getParentMenuItem(menu, restoreFocusElement) {
    let parentItem;
    if (
        restoreFocusElement?.matches(ITEM_SELECTOR) === true
        && restoreFocusElement.closest(MENU_SELECTOR) !== null
        && getPopoverTarget(restoreFocusElement) === menu
    ) {
        parentItem = restoreFocusElement;
    } else {
        const root = menu.getRootNode();
        if (root instanceof Document || root instanceof ShadowRoot) {
            parentItem = /** @type {HTMLElement | undefined} */ (
                Array.from(root.querySelectorAll(ITEM_SELECTOR)).find((item) => (
                    item instanceof HTMLElement
                    && item.closest(MENU_SELECTOR) !== null
                    && getPopoverTarget(item) === menu
                ))
            );
        }
    }
    return parentItem;
}

/**
 * @param {HTMLElement} menu
 * @param {HTMLElement | null | undefined} preferredTrigger
 * @returns {HTMLElement | undefined}
 */
function getPopoverTrigger(menu, preferredTrigger) {
    let trigger;
    if (preferredTrigger instanceof HTMLElement && getPopoverTarget(preferredTrigger) === menu) {
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
 */
function createMenuLabelController(host) {
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
        /** @param {HTMLElement | null | undefined} [preferredTrigger] */
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

/**
 * @param {HTMLElement} host
 */
const renderMenu = (host) => {
    const elementInternals = internals();
    elementInternals.role = 'menu';
    const rootController = requestContext(MenuRootContext);
    /** @type {import('@slimlib/store').Signal<readonly HTMLElement[]>} */
    const itemQuery = queryChildren(/** @type {HTMLElement} */ (host), OWNED_ITEM_SELECTOR);
    const menuController = createMenuController(
        /** @type {HTMLElement} */ (host),
        rootController,
        itemQuery,
    );
    const labelController = createMenuLabelController(/** @type {HTMLElement} */ (host));

    effect(() => {
        void itemQuery();
        menuController.$_refreshItems();
    }, 1);

    onMount(() => {
        const abortController = new AbortController();
        const listenerOptions = { signal: abortController.signal };
        host.addEventListener('keydown', menuController.$_handleKeyDown, listenerOptions);
        host.addEventListener('focusin', menuController.$_handleFocusIn, listenerOptions);
        host.addEventListener('toggle', /** @type {EventListener} */ ((event) => {
            labelController.$_sync(
                /** @type {ToggleEvent & { source?: HTMLElement | null }} */ (event).source,
            );
            menuController.$_handleToggle(/** @type {ToggleEvent} */ (event));
        }), listenerOptions);
        menuController.$_refreshItems();
        labelController.$_sync();

        const labelObserver = new MutationObserver(() => {
            labelController.$_sync();
        });
        labelObserver.observe(host.getRootNode(), {
            attributeFilter: ['aria-label', 'aria-labelledby', 'id', 'popovertarget'],
            attributes: true,
            childList: true,
            subtree: true,
        });

        return () => {
            rootController?.$_unregisterOpenMenu(/** @type {HTMLElement} */ (host));
            menuController.$_clearItems();
            labelObserver.disconnect();
            labelController.$_clear();
            abortController.abort();
        };
    });

    return null;
};

/**
 * Public instance type of the `<neon-menu>` element.
 *
 * @typedef {HTMLElement} NeonMenuElement
 */

defineElement('neon-menu', [
    withInternals(),
    rootContextProvider(MenuRootContext, () => createMenuRootController()),
], renderMenu);

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
 * @param {HTMLElement} host
 * @returns {MenuRootController | undefined}
 */
function requestMenuRootController(host) {
    /** @type {MenuRootController | undefined} */
    let rootController;
    host.dispatchEvent(new ContextRequestEvent(MenuRootContext, (providedRootController) => {
        rootController = providedRootController;
    }));
    return rootController;
}

/**
 * @param {HTMLElement} host
 */
const renderMenuItem = (host) => {
    const elementInternals = internals();
    elementInternals.role = 'menuitem';

    // Reactive attribute state. The attributes() middleware routes
    // `disabled` / `aria-disabled` / `popovertarget` changes through
    // props(), so the item no longer needs a self-targeted attribute
    // MutationObserver — the effect below reacts to those changes.
    const state = props({
        disabled: false,
        'aria-disabled': /** @type {string | null} */ (null),
        popovertarget: /** @type {string | null} */ (null),
    });

    /** @type {MenuRootController | undefined} */
    let rootController;
    /** @type {AbortController | undefined} */
    let popoverTargetAbortController;
    /** @type {HTMLElement | undefined} */
    let observedPopoverTarget;

    const syncAccessibility = () => {
        const popoverTarget = getPopoverTarget(host);
        elementInternals.ariaDisabled = isDisabled(host) ? 'true' : null;
        elementInternals.ariaHasPopup = popoverTarget === undefined ? null : 'menu';
        elementInternals.ariaExpanded = popoverTarget === undefined ? null : String(isOpenPopover(popoverTarget));
    };

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

    const syncRootController = () => {
        rootController = requestMenuRootController(host);
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
            } else {
                queueMicrotask(() => {
                    rootController?.$_closeAll();
                });
            }
        }
    };

    // Re-sync whenever the consumer toggles disabled / aria-disabled /
    // popovertarget. EAGER (1) runs the first pass synchronously at mount,
    // matching the previous observer-driven behavior; later runs are
    // batched by the scheduler like the MutationObserver they replace.
    effect(() => {
        void state.disabled;
        void state['aria-disabled'];
        void state.popovertarget;
        syncObservedPopoverTarget();
    }, 1);

    onConnect(() => {
        syncRootController();
    });

    onDisconnect(() => {
        rootController = undefined;
    });

    onMount(() => {
        const abortController = new AbortController();
        const listenerOptions = { signal: abortController.signal };
        host.addEventListener('click', onClick, listenerOptions);

        // The popover target is an external element referenced by id, with
        // no lifecycle tie to this item. Watch the root subtree so the item
        // notices the target being inserted or removed and keeps its toggle
        // listener and aria-haspopup / aria-expanded state in sync.
        const popoverTargetObserver = new MutationObserver(syncObservedPopoverTarget);
        popoverTargetObserver.observe(host.getRootNode(), {
            childList: true,
            subtree: true,
        });

        return () => {
            abortController.abort();
            popoverTargetAbortController?.abort();
            popoverTargetAbortController = undefined;
            observedPopoverTarget = undefined;
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

defineElement('neon-menu-item', [
    withInternals(),
    attributes({
        disabled: [booleanAttribute[0]],
        'aria-disabled': [stringAttribute[0]],
        popovertarget: [stringAttribute[0]],
    }),
], renderMenuItem);
