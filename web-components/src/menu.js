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

import {
    createMenuController,
    createMenuLabelController,
    createMenuRootController,
    getPopoverTarget,
    isOpenPopover,
} from '@neon-kit/core/menu';
import { isDisabled } from '@neon-kit/core/utils';

const ITEM_SELECTOR = 'neon-menu-item';
const MENU_SELECTOR = 'neon-menu';
const OWNED_ITEM_SELECTOR = `:scope ${ITEM_SELECTOR}:not(:scope ${MENU_SELECTOR} ${ITEM_SELECTOR})`;
const MENU_SELECTORS = {
    menu: MENU_SELECTOR,
    item: ITEM_SELECTOR,
    ownedItem: OWNED_ITEM_SELECTOR,
};

/**
 * @typedef {import('@neon-kit/core/menu').MenuRootController} MenuRootController
 */

/** @type {import('@slimlib/element').Context<symbol, MenuRootController>} */
const MenuRootContext = createContext(Symbol());

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
        () => rootController,
        () => itemQuery(),
        MENU_SELECTORS,
    );
    const labelController = createMenuLabelController(/** @type {HTMLElement} */ (host));

    effect(() => {
        void itemQuery();
        menuController.refreshItems();
    }, 1);

    onMount(() => {
        const abortController = new AbortController();
        const listenerOptions = { signal: abortController.signal };
        host.addEventListener('keydown', menuController.handleKeyDown, listenerOptions);
        host.addEventListener('focusin', menuController.handleFocusIn, listenerOptions);
        host.addEventListener('toggle', /** @type {EventListener} */ ((event) => {
            labelController.sync(
                /** @type {ToggleEvent & { source?: HTMLElement | null }} */ (event).source,
            );
            menuController.handleToggle(/** @type {ToggleEvent} */ (event));
        }), listenerOptions);
        menuController.refreshItems();
        labelController.sync();

        const labelObserver = new MutationObserver(() => {
            labelController.sync();
        });
        labelObserver.observe(host.getRootNode(), {
            attributeFilter: ['aria-label', 'aria-labelledby', 'id', 'popovertarget'],
            attributes: true,
            childList: true,
            subtree: true,
        });

        return () => {
            rootController?.unregisterOpenMenu(/** @type {HTMLElement} */ (host));
            menuController.clearItems();
            labelObserver.disconnect();
            labelController.clear();
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
                    rootController?.closeAll();
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
