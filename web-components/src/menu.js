/**
 * `<neon-menu>` — keyboard navigation + roving tabindex for a `.menu`
 * subtree styled by `@neon-kit/theme`.
 *
 * The element is Light DOM: it expects its children to follow the
 * theme's menu markup (`.menu__group`, `.menu__item`, etc.) and only
 * adds behavior:
 *
 * - Roving tabindex across `.menu__item` rows. Disabled items are
 *   skipped (`[disabled]` or `aria-disabled="true"`).
 * - Arrow Up / Down move between items, Home / End jump to first / last.
 * - Type-ahead: alphanumeric keys focus the next item whose label starts
 *   with the typed prefix (case-insensitive).
 * - Enter / Space activate the focused item via `click()`.
 * - `role="menu"` on the host, `role="menuitem"` on each focusable item.
 *
 * Per ADR 0001 the element renders into Light DOM (no shadow root).
 */
import { defineElement, internals, onMount, withInternals } from '@slimlib/element';

import { getActiveElement } from './utils.js';

const ITEM_SELECTOR = '.menu__item';
const TYPEAHEAD_TIMEOUT_MS = 500;

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
    const getItems = () => Array.from(host.querySelectorAll(ITEM_SELECTOR), (item) => (
        /** @type {HTMLElement} */ (item)
    ));
    /** @returns {HTMLElement[]} */
    const getFocusableItems = () => getItems().filter((item) => !isDisabled(item));

    let typeBuffer = '';
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let typeTimer;

    const refreshItems = () => {
        const items = getItems();
        if (items.length > 0) {
            const activeItem = getActiveItem();
            let assignedRovingItem = false;
            for (const item of items) {
                if (!item.hasAttribute('role')) {
                    item.setAttribute('role', 'menuitem');
                }

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

    /**
     * @param {string} key
     * @param {HTMLElement[]} items
     * @param {number} from
     */
    const typeAhead = (key, items, from) => {
        typeBuffer = (typeBuffer + key).toLowerCase();
        if (typeTimer !== undefined) {
            clearTimeout(typeTimer);
        }
        typeTimer = setTimeout(() => {
            typeBuffer = '';
        }, TYPEAHEAD_TIMEOUT_MS);

        const start = from < 0 ? -1 : from;
        for (let offset = 1; offset <= items.length; offset++) {
            const itemIndex = (start + offset + items.length) % items.length;
            const label = (/** @type {string} */ (items[itemIndex].textContent)).trim().toLowerCase();
            if (label.startsWith(typeBuffer)) {
                focusItem(items[itemIndex]);
                return;
            }
        }
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
                default:
                    if (
                        event.key.length === 1
                        && /\S/.test(event.key)
                        && !event.ctrlKey
                        && !event.metaKey
                        && !event.altKey
                    ) {
                        typeAhead(event.key, items, currentItemIndex);
                    }
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
        if (event.newState === 'open') {
            const firstFocusableItem = getFocusableItems()[0];
            if (firstFocusableItem !== undefined) {
                for (const item of getItems()) {
                    item.setAttribute('tabindex', item === firstFocusableItem ? '0' : '-1');
                }
                firstFocusableItem.focus();
            }
        }
    };

    /** @param {MouseEvent} event */
    const onClick = (event) => {
        if (event.target instanceof Element) {
            const item = event.target.closest(ITEM_SELECTOR);
            if (item instanceof HTMLElement && isDisabled(item)) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        }
    };

    onMount(() => {
        const abortController = new AbortController();
        const listenerOptions = { signal: abortController.signal };
        host.addEventListener('keydown', onKeyDown, listenerOptions);
        host.addEventListener('focusin', onFocusIn, listenerOptions);
        host.addEventListener('click', onClick, listenerOptions);
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
            if (typeTimer !== undefined) {
                clearTimeout(typeTimer);
            }
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
