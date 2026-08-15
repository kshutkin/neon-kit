import { DEV } from 'esm-env';

import {
    createMenuController,
    createMenuLabelController,
    createMenuRootController,
    getPopoverTarget,
    isOpenPopover,
} from '@neon-kit/core/menu';
import { generateId, isDisabled } from '@neon-kit/core/utils';

/**
 * @import { Child } from '@slimlib/jsx'
 */

const MENU_SELECTOR = '.menu';
const ITEM_SELECTOR = '.menu__item';
const OWNED_ITEM_SELECTOR = `:scope ${ITEM_SELECTOR}:not(:scope ${MENU_SELECTOR} ${ITEM_SELECTOR})`;
const MENU_SELECTORS = {
    menu: MENU_SELECTOR,
    item: ITEM_SELECTOR,
    ownedItem: OWNED_ITEM_SELECTOR,
};
const PLACEMENTS = /** @type {const} */ ([
    'block-end',
    'block-start',
    'inline-end',
    'inline-start',
]);

/** @type {WeakMap<HTMLElement, import('@neon-kit/core/menu').MenuRootController>} */
const menuRootControllers = new WeakMap();

/**
 * @typedef {'block-end' | 'block-start' | 'inline-end' | 'inline-start'} MenuPlacement
 * @typedef {{
 *     children: Child;
 *     content: Child;
 *     placement?: MenuPlacement | string | (() => MenuPlacement | string | undefined);
 *     class?: string | (() => string | undefined);
 *     id?: string;
 *     ref?: (element: Element | null) => void;
 *     [key: string]: unknown;
 * }} MenuProps
 * @typedef {{
 *     children?: Child;
 *     disabled?: boolean | (() => boolean | undefined);
 *     class?: string | (() => string | undefined);
 *     ref?: (element: Element | null) => void;
 *     onClick?: (event: MouseEvent) => void;
 *     'on:click'?: (event: MouseEvent) => void;
 *     [key: string]: unknown;
 * }} MenuItemProps
 */

/**
 * @param {unknown} value
 */
function readReactiveValue(value) {
    return typeof value === 'function' ? value() : value;
}

/**
 * @param {Child} children
 * @returns {HTMLButtonElement | undefined}
 */
function resolveTriggerElement(children) {
    let triggerElement = undefined;
    if (children instanceof HTMLButtonElement) {
        triggerElement = children;
    } else if (
        Array.isArray(children)
        && children.length === 1
        && children[0] instanceof HTMLButtonElement
    ) {
        triggerElement = children[0];
    }
    return triggerElement;
}

/**
 * @param {MenuProps['placement']} placement
 * @returns {MenuPlacement}
 */
function readPlacement(placement) {
    const value = readReactiveValue(placement);
    return /** @type {MenuPlacement} */ (PLACEMENTS.includes(/** @type {any} */ (value))
        ? value
        : 'block-end');
}

/**
 * @param {MenuProps['class'] | MenuItemProps['class']} className
 * @returns {string}
 */
function readClassName(className) {
    const value = readReactiveValue(className);
    return typeof value === 'string' ? value : '';
}

/**
 * @param {HTMLElement} element
 * @returns {import('@neon-kit/core/menu').MenuRootController | undefined}
 */
function getMenuRootController(element) {
    let rootController;
    let menu = element.matches(MENU_SELECTOR)
        ? element
        : element.closest(MENU_SELECTOR);
    while (menu instanceof HTMLElement) {
        rootController = menuRootControllers.get(menu) ?? rootController;
        menu = menu.parentElement?.closest(MENU_SELECTOR);
    }
    return rootController;
}

/**
 * Decorates one button trigger and renders its Neon menu popover as a sibling.
 *
 * @param {MenuProps} props
 */
export function Menu(props) {
    const triggerElement = resolveTriggerElement(props.children);

    if (triggerElement === undefined) {
        if (DEV) {
            // eslint-disable-next-line no-console
            console.debug(
                'Menu: expected exactly one HTMLButtonElement child to use as the trigger.',
                props.children,
            );
        }
        return props.children;
    }

    const {
        children: _children,
        content,
        placement,
        class: className,
        id: providedId,
        ref: consumerRef,
        ...menuProps
    } = props;
    const menuId = providedId || generateId('neon-menu');
    const previousPopoverTarget = triggerElement.getAttribute('popovertarget');
    let ownsPopoverTarget = false;

    if (previousPopoverTarget === null) {
        triggerElement.setAttribute('popovertarget', menuId);
        ownsPopoverTarget = true;
    } else if (DEV && previousPopoverTarget !== menuId) {
        // eslint-disable-next-line no-console
        console.debug(
            'Menu: trigger already has popovertarget; menu trigger wiring was skipped.',
            triggerElement,
        );
    }

    /** @type {import('@neon-kit/core/menu').MenuRootController} */
    const ownRootController = createMenuRootController();
    /** @type {import('@neon-kit/core/menu').MenuController | undefined} */
    let menuController;
    /** @type {import('@neon-kit/core/menu').MenuLabelController | undefined} */
    let labelController;
    /** @type {MutationObserver | undefined} */
    let itemObserver;
    /** @type {MutationObserver | undefined} */
    let labelObserver;
    /** @type {AbortController | undefined} */
    let listenerController;
    let disposed = false;

    const readMenuClass = () => {
        const currentPlacement = readPlacement(placement);
        const placementClass = currentPlacement === 'block-end'
            ? ''
            : ` -${currentPlacement}`;
        const customClass = readClassName(className);
        return `menu${placementClass}${customClass === '' ? '' : ` ${customClass}`}`;
    };
    const menuClass = typeof placement === 'function' || typeof className === 'function'
        ? readMenuClass
        : readMenuClass();

    /** @param {Element | null} menuNode */
    const attachMenu = (menuNode) => {
        consumerRef?.(menuNode);

        if (!(menuNode instanceof HTMLElement)) {
            disposed = true;
            listenerController?.abort();
            listenerController = undefined;
            itemObserver?.disconnect();
            itemObserver = undefined;
            labelObserver?.disconnect();
            labelObserver = undefined;
            getMenuRootController(/** @type {HTMLElement} */ (menuElement))
                ?.$_unregisterOpenMenu(/** @type {HTMLElement} */ (menuElement));
            menuRootControllers.delete(/** @type {HTMLElement} */ (menuElement));
            menuController?.$_clearItems();
            menuController = undefined;
            labelController?.$_clear();
            labelController = undefined;
            if (
                ownsPopoverTarget
                && triggerElement.getAttribute('popovertarget') === menuId
            ) {
                triggerElement.removeAttribute('popovertarget');
            }
            ownsPopoverTarget = false;
            return;
        }

        disposed = false;
        menuRootControllers.set(menuNode, ownRootController);
        const getItems = () => Array.from(menuNode.querySelectorAll(OWNED_ITEM_SELECTOR))
            .filter((item) => item instanceof HTMLElement);
        menuController = createMenuController(
            menuNode,
            () => getMenuRootController(menuNode),
            getItems,
            MENU_SELECTORS,
        );
        labelController = createMenuLabelController(menuNode);

        listenerController = new AbortController();
        const listenerOptions = { signal: listenerController.signal };
        menuNode.addEventListener('keydown', menuController.$_handleKeyDown, listenerOptions);
        menuNode.addEventListener('focusin', menuController.$_handleFocusIn, listenerOptions);
        menuNode.addEventListener('toggle', /** @type {EventListener} */ ((event) => {
            labelController?.$_sync(
                /** @type {ToggleEvent & { source?: HTMLElement | null }} */ (event).source,
            );
            menuController?.$_handleToggle(/** @type {ToggleEvent} */ (event));
        }), listenerOptions);

        menuController.$_refreshItems();
        labelController.$_sync(triggerElement);

        itemObserver = new MutationObserver(() => {
            menuController?.$_refreshItems();
        });
        itemObserver.observe(menuNode, {
            attributeFilter: ['class'],
            attributes: true,
            childList: true,
            subtree: true,
        });

        queueMicrotask(() => {
            if (!disposed) {
                labelObserver = new MutationObserver(() => {
                    labelController?.$_sync();
                });
                labelObserver.observe(menuNode.getRootNode(), {
                    attributeFilter: ['aria-label', 'aria-labelledby', 'id', 'popovertarget'],
                    attributes: true,
                    childList: true,
                    subtree: true,
                });
                labelController?.$_sync(triggerElement);
            }
        });
    };

    const menuElement = /** @type {HTMLDivElement} */ (
        <div
            {...menuProps}
            ref={attachMenu}
            id={menuId}
            class={menuClass}
            role="menu"
            popover="auto"
        >
            {content}
        </div>
    );

    return [triggerElement, menuElement];
}

/**
 * Renders a button menu item with disabled and submenu accessibility behavior.
 *
 * @param {MenuItemProps} props
 */
export function MenuItem(props) {
    const {
        children,
        disabled,
        class: className,
        ref: consumerRef,
        onClick,
        'on:click': onClickEvent,
        'aria-disabled': ariaDisabled,
        ...buttonProps
    } = props;
    /** @type {MutationObserver | undefined} */
    let targetObserver;
    /** @type {AbortController | undefined} */
    let targetListenerController;
    /** @type {HTMLElement | undefined} */
    let observedTarget;
    /** @type {HTMLButtonElement | undefined} */
    let buttonElement;
    let disposed = false;
    let managedHasPopup;
    let managedExpanded;
    let ownsHasPopup = false;
    let ownsExpanded = false;

    const readDisabled = () => {
        const value = readReactiveValue(disabled);
        return value === undefined
            ? readReactiveValue(ariaDisabled) === 'true'
            : value === true;
    };

    const clearManagedAccessibility = () => {
        if (
            buttonElement !== undefined
            && ownsHasPopup
            && managedHasPopup !== undefined
            && buttonElement.getAttribute('aria-haspopup') === managedHasPopup
        ) {
            buttonElement.removeAttribute('aria-haspopup');
        }
        if (
            buttonElement !== undefined
            && ownsExpanded
            && managedExpanded !== undefined
            && buttonElement.getAttribute('aria-expanded') === managedExpanded
        ) {
            buttonElement.removeAttribute('aria-expanded');
        }
        managedHasPopup = undefined;
        managedExpanded = undefined;
        ownsHasPopup = false;
        ownsExpanded = false;
    };

    const syncSubmenuAccessibility = () => {
        if (buttonElement !== undefined) {
            if (
                ownsHasPopup
                && buttonElement.getAttribute('aria-haspopup') !== managedHasPopup
            ) {
                managedHasPopup = undefined;
                ownsHasPopup = false;
            }
            if (
                ownsExpanded
                && buttonElement.getAttribute('aria-expanded') !== managedExpanded
            ) {
                managedExpanded = undefined;
                ownsExpanded = false;
            }
            const nextTarget = getPopoverTarget(buttonElement);
            if (nextTarget !== observedTarget) {
                targetListenerController?.abort();
                targetListenerController = undefined;
                observedTarget = nextTarget;
                if (observedTarget !== undefined) {
                    targetListenerController = new AbortController();
                    observedTarget.addEventListener('toggle', syncSubmenuAccessibility, {
                        signal: targetListenerController.signal,
                    });
                }
            }

            if (observedTarget === undefined) {
                clearManagedAccessibility();
            } else {
                if (!buttonElement.hasAttribute('aria-haspopup') || ownsHasPopup) {
                    managedHasPopup = 'menu';
                    ownsHasPopup = true;
                    buttonElement.setAttribute('aria-haspopup', managedHasPopup);
                }
                if (!buttonElement.hasAttribute('aria-expanded') || ownsExpanded) {
                    managedExpanded = String(isOpenPopover(observedTarget));
                    ownsExpanded = true;
                    buttonElement.setAttribute('aria-expanded', managedExpanded);
                }
            }
        }
    };

    /** @param {Element | null} itemNode */
    const attachItem = (itemNode) => {
        consumerRef?.(itemNode);
        targetObserver?.disconnect();
        targetObserver = undefined;
        targetListenerController?.abort();
        targetListenerController = undefined;
        clearManagedAccessibility();
        observedTarget = undefined;
        buttonElement = itemNode instanceof HTMLButtonElement ? itemNode : undefined;
        disposed = buttonElement === undefined;

        if (buttonElement !== undefined) {
            queueMicrotask(() => {
                if (!disposed && buttonElement !== undefined) {
                    syncSubmenuAccessibility();
                    targetObserver = new MutationObserver(syncSubmenuAccessibility);
                    targetObserver.observe(buttonElement.getRootNode(), {
                        childList: true,
                        subtree: true,
                    });
                }
            });
        }
    };

    /** @param {MouseEvent} event */
    const handleClick = (event) => {
        if (event.currentTarget instanceof HTMLElement && isDisabled(event.currentTarget)) {
            event.preventDefault();
            event.stopImmediatePropagation();
        } else {
            (onClick ?? onClickEvent)?.(event);
            const itemElement = event.currentTarget instanceof HTMLElement
                ? event.currentTarget
                : undefined;
            if (
                itemElement !== undefined
                && getPopoverTarget(itemElement) === undefined
            ) {
                queueMicrotask(() => {
                    getMenuRootController(itemElement)?.$_closeAll();
                });
            }
        }
    };

    const readItemClass = () => {
        const customClass = readClassName(className);
        return `menu__item${customClass === '' ? '' : ` ${customClass}`}`;
    };
    const itemClass = typeof className === 'function' ? readItemClass : readItemClass();
    const readAriaDisabled = () => readDisabled() ? 'true' : undefined;
    const ariaDisabledValue = typeof disabled === 'function' || typeof ariaDisabled === 'function'
        ? readAriaDisabled
        : readAriaDisabled();

    return /** @type {HTMLButtonElement} */ (
        <button
            {...buttonProps}
            ref={attachItem}
            type="button"
            class={itemClass}
            role="menuitem"
            aria-disabled={ariaDisabledValue}
            on:click={handleClick}
        >
            {children}
        </button>
    );
}
