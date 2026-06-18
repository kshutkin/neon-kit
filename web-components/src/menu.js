/**
 * `<neon-menu>` — keyboard navigation + roving tabindex for
 * `<neon-menu-item>` children styled by `@neon-kit/theme`.
 *
 * The element is Light DOM: it expects items to be authored as
 * `<neon-menu-item>` elements. Menu item contents remain fully
 * consumer-authored.
 *
 * - Roving tabindex across registered `<neon-menu-item>` rows. Disabled items are
 *   skipped (`[disabled]` or `aria-disabled="true"`).
 * - Arrow Up / Down move between items, Home / End jump to first / last.
 * - Enter / Space activate the focused item via `click()`.
 * - `role="menu"` on the host. `<neon-menu-item>` provides item role.
 *
 * Per ADR 0001 the element renders into Light DOM (no shadow root).
 */
import {
    ContextRequestEvent,
    attributes,
    booleanAttribute,
    contextProvider,
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
import { effect } from '@slimlib/store';

import { getActiveElement } from './utils.js';

const ITEM_SELECTOR = 'neon-menu-item';
const MENU_SELECTOR = 'neon-menu';

/**
 * @typedef {{
 *     $_registerMenu: (controller: MenuController) => void;
 *     $_unregisterMenu: (controller: MenuController) => void;
 *     $_registerOpenMenu: (menu: HTMLElement) => void;
 *     $_unregisterOpenMenu: (menu: HTMLElement) => void;
 *     $_closeAll: () => void;
 * }} MenuRootController
 *
 * @typedef {{
 *     $_element: HTMLElement;
 *     $_disabled: boolean;
 * }} MenuItemRecord
 *
 * @typedef {{
 *     $_host: HTMLElement;
 *     $_setRootController: (controller: MenuRootController) => void;
 *     $_registerItem: (item: HTMLElement) => void;
 *     $_unregisterItem: (item: HTMLElement) => void;
 *     $_updateItemState: (item: HTMLElement) => void;
 *     $_refreshItems: () => void;
 *     $_handleKeyDown: (event: KeyboardEvent) => void;
 *     $_handleFocusIn: (event: FocusEvent) => void;
 *     $_handleToggle: (event: ToggleEvent) => void;
 *     $_closeRootMenus: () => void;
 * }} MenuController
 */

/** @type {import('@slimlib/element').Context<symbol, MenuRootController>} */
const MenuRootContext = createContext(Symbol());

/** @type {import('@slimlib/element').Context<symbol, MenuController>} */
const MenuContext = createContext(Symbol());

/** @type {WeakMap<HTMLElement, MenuController>} */
const menuControllers = new WeakMap();

/**
 * @param {Element} element
 * @returns {boolean}
 */
function isDisabled(element) {
    return element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
}

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
    /** @type {Set<MenuController>} */
    const menuControllerSet = new Set();
    /** @type {Set<HTMLElement>} */
    const openMenus = new Set();

    return {
        $_registerMenu(controller) {
            menuControllerSet.add(controller);
        },
        $_unregisterMenu(controller) {
            menuControllerSet.delete(controller);
            openMenus.delete(controller.$_host);
        },
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
 * @param {MenuItemRecord} firstRecord
 * @param {MenuItemRecord} secondRecord
 * @returns {number}
 */
function compareItemRecords(firstRecord, secondRecord) {
    const position = firstRecord.$_element.compareDocumentPosition(secondRecord.$_element);
    if ((position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
        return -1;
    }
    if ((position & Node.DOCUMENT_POSITION_PRECEDING) !== 0) {
        return 1;
    }
    return 0;
}

/**
 * @param {HTMLElement} host
 * @returns {MenuController}
 */
function createMenuController(host) {
    /** @type {Map<HTMLElement, MenuItemRecord>} */
    const itemRecords = new Map();
    /** @type {MenuRootController | undefined} */
    let rootController;
    /** @type {HTMLElement | undefined} */
    let restoreFocusElement;

    /** @returns {MenuItemRecord[]} */
    const getItemRecords = () => Array.from(itemRecords.values()).sort(compareItemRecords);
    /** @returns {HTMLElement[]} */
    const getItems = () => getItemRecords().map((record) => record.$_element);
    /** @returns {HTMLElement[]} */
    const getFocusableItems = () => getItemRecords()
        .filter((record) => !record.$_disabled)
        .map((record) => record.$_element);
    /** @returns {HTMLElement | undefined} */
    const getActiveItem = () => {
        const activeElement = getActiveElement(host);
        return activeElement instanceof HTMLElement && itemRecords.has(activeElement)
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
                if (closestItem instanceof HTMLElement && itemRecords.has(closestItem)) {
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
        if (itemRecords.size === 0) {
            return;
        }
        const activeItem = getActiveItem();
        const rovingItem = activeItem !== undefined && !isDisabled(activeItem)
            ? activeItem
            : getFocusableItems()[0];
        setRovingTabindex(rovingItem);
    };

    /** @param {HTMLElement} item */
    const focusItem = (item) => {
        setRovingTabindex(item);
        item.focus();
    };

    return {
        $_host: host,
        $_setRootController(controller) {
            rootController = controller;
        },
        $_registerItem(item) {
            itemRecords.set(item, {
                $_element: item,
                $_disabled: isDisabled(item),
            });
            refreshItems();
        },
        $_unregisterItem(item) {
            if (itemRecords.delete(item)) {
                item.removeAttribute('tabindex');
                refreshItems();
            }
        },
        $_updateItemState(item) {
            const record = itemRecords.get(item);
            if (record !== undefined) {
                record.$_disabled = isDisabled(item);
                refreshItems();
            }
        },
        $_refreshItems: refreshItems,
        $_handleKeyDown(event) {
            const items = getFocusableItems();
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
                    case 'Enter':
                    case ' ':
                        if (currentItem !== undefined) {
                            event.preventDefault();
                            currentItem.click();
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
            if (focusedItem !== undefined && !isDisabled(focusedItem)) {
                setRovingTabindex(focusedItem);
            }
        },
        $_handleToggle(event) {
            if (event.target === host) {
                const activeElement = getActiveElement(host);
                if (event.newState === 'open') {
                    rootController?.$_registerOpenMenu(host);
                    restoreFocusElement = canRestoreFocusTo(activeElement)
                        && !canRestoreFocusFrom(activeElement)
                        ? activeElement
                        : undefined;
                    const firstFocusableItem = getFocusableItems()[0];
                    if (firstFocusableItem !== undefined) {
                        focusItem(firstFocusableItem);
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
        $_closeRootMenus() {
            rootController?.$_closeAll();
        },
    };
}

/**
 * @param {HTMLElement} host
 */
const renderMenu = (host) => {
    const elementInternals = internals();
    elementInternals.role = 'menu';
    const menuController = /** @type {MenuController} */ (menuControllers.get(host));
    const rootController = requestContext(MenuRootContext);
    if (rootController !== undefined) {
        menuController.$_setRootController(rootController);
    }

    onMount(() => {
        const abortController = new AbortController();
        const listenerOptions = { signal: abortController.signal };
        rootController?.$_registerMenu(menuController);
        host.addEventListener('keydown', menuController.$_handleKeyDown, listenerOptions);
        host.addEventListener('focusin', menuController.$_handleFocusIn, listenerOptions);
        host.addEventListener('toggle', /** @type {EventListener} */ (menuController.$_handleToggle), listenerOptions);
        menuController.$_refreshItems();

        return () => {
            rootController?.$_unregisterMenu(menuController);
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
    contextProvider(MenuContext, (host) => {
        const menuController = createMenuController(/** @type {HTMLElement} */ (host));
        menuControllers.set(/** @type {HTMLElement} */ (host), menuController);
        return menuController;
    }),
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
 * @returns {MenuController | undefined}
 */
function requestMenuController(host) {
    /** @type {MenuController | undefined} */
    let menuController;
    host.dispatchEvent(new ContextRequestEvent(MenuContext, (providedMenuController) => {
        menuController = providedMenuController;
    }));
    return menuController;
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

    /** @type {MenuController | undefined} */
    let menuController;
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
        menuController?.$_updateItemState(host);
    };

    const syncMenuController = () => {
        const nextMenuController = requestMenuController(host);
        if (nextMenuController !== menuController) {
            menuController?.$_unregisterItem(host);
            menuController = nextMenuController;
            menuController?.$_registerItem(host);
        }
        menuController?.$_updateItemState(host);
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
                    menuController?.$_closeRootMenus();
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
        syncMenuController();
    });

    onDisconnect(() => {
        menuController?.$_unregisterItem(host);
        menuController = undefined;
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
            menuController?.$_unregisterItem(host);
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
