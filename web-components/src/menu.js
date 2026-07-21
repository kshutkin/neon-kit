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

import { getActiveElement } from './utils.js';

const ITEM_SELECTOR = 'neon-menu-item';
const MENU_SELECTOR = 'neon-menu';
const OWNED_ITEM_SELECTOR = `:scope ${ITEM_SELECTOR}:not(:scope ${MENU_SELECTOR} ${ITEM_SELECTOR})`;
const OWNED_FOCUSABLE_ITEM_SELECTOR = `${OWNED_ITEM_SELECTOR}:not([disabled]):not([aria-disabled="true"])`;

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
 * @param {import('@slimlib/store').Signal<readonly HTMLElement[]>} focusableItemQuery
 * @returns {MenuController}
 */
function createMenuController(host, rootController, itemQuery, focusableItemQuery) {
    /** @type {HTMLElement | undefined} */
    let restoreFocusElement;
    /** @type {readonly HTMLElement[]} */
    let previousItems = [];

    /** @returns {readonly HTMLElement[]} */
    const getItems = () => itemQuery();
    /** @returns {readonly HTMLElement[]} */
    const getFocusableItems = () => focusableItemQuery();
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
        $_refreshItems: refreshItems,
        $_clearItems() {
            for (const item of previousItems) {
                item.removeAttribute('tabindex');
            }
            previousItems = [];
        },
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
    };
}

/**
 * @param {HTMLElement} host
 */
const renderMenu = (host) => {
    const elementInternals = internals();
    elementInternals.role = 'menu';
    const rootController = requestContext(MenuRootContext);
    const itemQuery = queryChildren(/** @type {HTMLElement} */ (host), OWNED_ITEM_SELECTOR);
    const focusableItemQuery = queryChildren(
        /** @type {HTMLElement} */ (host),
        OWNED_FOCUSABLE_ITEM_SELECTOR,
    );
    const menuController = createMenuController(
        /** @type {HTMLElement} */ (host),
        rootController,
        itemQuery,
        focusableItemQuery,
    );

    effect(() => {
        void itemQuery();
        void focusableItemQuery();
        menuController.$_refreshItems();
    }, 1);

    onMount(() => {
        const abortController = new AbortController();
        const listenerOptions = { signal: abortController.signal };
        host.addEventListener('keydown', menuController.$_handleKeyDown, listenerOptions);
        host.addEventListener('focusin', menuController.$_handleFocusIn, listenerOptions);
        host.addEventListener('toggle', /** @type {EventListener} */ (menuController.$_handleToggle), listenerOptions);
        menuController.$_refreshItems();

        return () => {
            rootController?.$_unregisterOpenMenu(/** @type {HTMLElement} */ (host));
            menuController.$_clearItems();
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
