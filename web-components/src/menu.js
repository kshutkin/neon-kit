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
import { defineElement, onMount } from '@slimlib/element';

import { getActiveElement } from './utils.js';

const ITEM_SELECTOR = '.menu__item';
const TYPEAHEAD_TIMEOUT_MS = 500;

/**
 * @param {Element} el
 * @returns {boolean}
 */
function isDisabled(el) {
    return el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
}

/**
 * @param {HTMLElement} host
 */
const renderMenu = (host) => {
    /** @returns {HTMLElement | null} */
    const getActiveItem = () => {
        const active = getActiveElement(host);
        if (active instanceof HTMLElement && host.contains(active) && active.matches(ITEM_SELECTOR)) {
            return active;
        }
        return null;
    };
    /** @returns {HTMLElement[]} */
    const getItems = () => /** @type {HTMLElement[]} */ (
        Array.from(host.querySelectorAll(ITEM_SELECTOR))
    );
    /** @returns {HTMLElement[]} */
    const getFocusableItems = () => getItems().filter((it) => !isDisabled(it));

    Object.defineProperty(host, 'activeItem', {
        configurable: true, enumerable: true,
        get: getActiveItem,
    });
    Object.defineProperty(host, 'items', {
        configurable: true, enumerable: true,
        get: getItems,
    });
    Object.defineProperty(host, 'focusableItems', {
        configurable: true, enumerable: true,
        get: getFocusableItems,
    });

    let typeBuffer = '';
    /** @type {ReturnType<typeof setTimeout> | null} */
    let typeTimer = null;

    const refreshItems = () => {
        const items = getItems();
        if (items.length === 0) return;
        const active = getActiveItem();
        let assignedRover = false;
        for (const it of items) {
            if (!it.hasAttribute('role')) it.setAttribute('role', 'menuitem');
            if (isDisabled(it)) {
                it.setAttribute('tabindex', '-1');
                continue;
            }
            if (active === it) {
                it.setAttribute('tabindex', '0');
                assignedRover = true;
            } else {
                it.setAttribute('tabindex', '-1');
            }
        }
        if (!assignedRover) {
            const first = getFocusableItems()[0];
            if (first) first.setAttribute('tabindex', '0');
        }
    };

    /** @param {HTMLElement} item */
    const focusItem = (item) => {
        for (const it of getItems()) it.setAttribute('tabindex', it === item ? '0' : '-1');
        item.focus();
    };

    /**
     * @param {string} key
     * @param {HTMLElement[]} items
     * @param {number} from
     */
    const typeAhead = (key, items, from) => {
        typeBuffer = (typeBuffer + key).toLowerCase();
        if (typeTimer) clearTimeout(typeTimer);
        typeTimer = setTimeout(() => {
            typeBuffer = '';
        }, TYPEAHEAD_TIMEOUT_MS);

        const buf = typeBuffer;
        const start = from < 0 ? -1 : from;
        for (let i = 1; i <= items.length; i++) {
            const idx = (start + i + items.length) % items.length;
            const label = (items[idx].textContent ?? '').trim().toLowerCase();
            if (label.startsWith(buf)) {
                focusItem(items[idx]);
                return;
            }
        }
    };

    /** @param {KeyboardEvent} e */
    const onKeyDown = (e) => {
        const items = getFocusableItems();
        if (items.length === 0) return;
        const current = getActiveItem();
        const idx = current ? items.indexOf(current) : -1;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                focusItem(items[(idx + 1 + items.length) % items.length] ?? items[0]);
                return;
            case 'ArrowUp':
                e.preventDefault();
                focusItem(items[(idx - 1 + items.length) % items.length] ?? items[items.length - 1]);
                return;
            case 'Home':
                e.preventDefault();
                focusItem(items[0]);
                return;
            case 'End':
                e.preventDefault();
                focusItem(items[items.length - 1]);
                return;
            case 'Enter':
            case ' ':
                if (current) {
                    e.preventDefault();
                    current.click();
                }
                return;
            default:
                if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    typeAhead(e.key, items, idx);
                }
        }
    };

    /** @param {FocusEvent} e */
    const onFocusIn = (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        if (!target.matches(ITEM_SELECTOR)) return;
        if (isDisabled(target)) return;
        for (const it of getItems()) it.setAttribute('tabindex', it === target ? '0' : '-1');
    };

    /** @param {ToggleEvent} e */
    const onToggle = (e) => {
        if (e.newState !== 'open') return;
        const first = getFocusableItems()[0];
        if (first) {
            for (const it of getItems()) it.setAttribute('tabindex', it === first ? '0' : '-1');
            first.focus();
        }
    };

    /** @param {MouseEvent} e */
    const onClick = (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const item = target.closest(ITEM_SELECTOR);
        if (item instanceof HTMLElement && isDisabled(item)) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    };

    onMount(() => {
        if (!host.hasAttribute('role')) host.setAttribute('role', 'menu');
        host.addEventListener('keydown', onKeyDown);
        host.addEventListener('focusin', onFocusIn);
        host.addEventListener('click', onClick);
        host.addEventListener('toggle', /** @type {EventListener} */ (onToggle));
        refreshItems();
        const mo = new MutationObserver(() => refreshItems());
        mo.observe(host, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['disabled', 'aria-disabled'],
        });

        return () => {
            host.removeEventListener('keydown', onKeyDown);
            host.removeEventListener('focusin', onFocusIn);
            host.removeEventListener('click', onClick);
            host.removeEventListener('toggle', /** @type {EventListener} */ (onToggle));
            if (typeTimer) clearTimeout(typeTimer);
            mo.disconnect();
        };
    });

    return null;
};

/**
 * Public instance type of the `<neon-menu>` element.
 *
 * @typedef {HTMLElement & {
 *   readonly activeItem: HTMLElement | null,
 *   readonly items: HTMLElement[],
 *   readonly focusableItems: HTMLElement[],
 * }} NeonMenuElement
 */

defineElement('neon-menu', [], renderMenu);

export {};
