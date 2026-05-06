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
 * No popover wiring lives here — combine with the native `popover`
 * attribute and `popovertarget` on a trigger button as shown in the
 * theme docs.
 */

const ITEM_SELECTOR = '.menu__item';
const TYPEAHEAD_TIMEOUT_MS = 500;

export class NeonMenuElement extends HTMLElement {
    #typeBuffer = '';
    /** @type {ReturnType<typeof setTimeout> | null} */
    #typeTimer = null;
    /** @type {MutationObserver | null} */
    #mo = null;
    #onKeyDown = (/** @type {KeyboardEvent} */ e) => this.#handleKeyDown(e);
    #onFocusIn = (/** @type {FocusEvent} */ e) => this.#handleFocusIn(e);
    #onClick = (/** @type {MouseEvent} */ e) => this.#handleClick(e);
    #onToggle = (/** @type {ToggleEvent} */ e) => this.#handleToggle(e);

    connectedCallback() {
        if (!this.hasAttribute('role')) this.setAttribute('role', 'menu');
        this.addEventListener('keydown', this.#onKeyDown);
        this.addEventListener('focusin', this.#onFocusIn);
        this.addEventListener('click', this.#onClick);
        this.addEventListener('toggle', /** @type {EventListener} */ (this.#onToggle));
        this.#refreshItems();
        this.#mo = new MutationObserver(() => this.#refreshItems());
        this.#mo.observe(this, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['disabled', 'aria-disabled'],
        });
    }

    disconnectedCallback() {
        this.removeEventListener('keydown', this.#onKeyDown);
        this.removeEventListener('focusin', this.#onFocusIn);
        this.removeEventListener('click', this.#onClick);
        this.removeEventListener('toggle', /** @type {EventListener} */ (this.#onToggle));
        if (this.#typeTimer) clearTimeout(this.#typeTimer);
        this.#mo?.disconnect();
        this.#mo = null;
    }

    /**
     * The currently focused item, if any.
     * @returns {HTMLElement | null}
     */
    get activeItem() {
        const active = this.ownerDocument?.activeElement;
        if (active instanceof HTMLElement && this.contains(active) && active.matches(ITEM_SELECTOR)) {
            return active;
        }
        return null;
    }

    /**
     * All items in DOM order, including disabled ones.
     * @returns {HTMLElement[]}
     */
    get items() {
        return /** @type {HTMLElement[]} */ (Array.from(this.querySelectorAll(ITEM_SELECTOR)));
    }

    /**
     * Focusable items (disabled excluded), in DOM order.
     * @returns {HTMLElement[]}
     */
    get focusableItems() {
        return this.items.filter((it) => !isDisabled(it));
    }

    #refreshItems() {
        const items = this.items;
        if (items.length === 0) return;
        const active = this.activeItem;
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
            const first = this.focusableItems[0];
            if (first) first.setAttribute('tabindex', '0');
        }
    }

    /**
     * @param {HTMLElement} item
     */
    #focusItem(item) {
        for (const it of this.items) it.setAttribute('tabindex', it === item ? '0' : '-1');
        item.focus();
    }

    /**
     * @param {KeyboardEvent} e
     */
    #handleKeyDown(e) {
        const items = this.focusableItems;
        if (items.length === 0) return;
        const current = this.activeItem;
        const idx = current ? items.indexOf(current) : -1;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.#focusItem(items[(idx + 1 + items.length) % items.length] ?? items[0]);
                return;
            case 'ArrowUp':
                e.preventDefault();
                this.#focusItem(items[(idx - 1 + items.length) % items.length] ?? items[items.length - 1]);
                return;
            case 'Home':
                e.preventDefault();
                this.#focusItem(items[0]);
                return;
            case 'End':
                e.preventDefault();
                this.#focusItem(items[items.length - 1]);
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
                    this.#typeAhead(e.key, items, idx);
                }
        }
    }

    /**
     * @param {FocusEvent} e
     */
    #handleFocusIn(e) {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        if (!target.matches(ITEM_SELECTOR)) return;
        if (isDisabled(target)) return;
        for (const it of this.items) it.setAttribute('tabindex', it === target ? '0' : '-1');
    }

    /**
     * @param {ToggleEvent} e
     */
    #handleToggle(e) {
        if (e.newState !== 'open') return;
        // Focus the first focusable item on open. Modern browsers'
        // `:focus-visible` heuristic suppresses the focus ring when the
        // popover was opened by a pointer click and shows it when opened
        // via keyboard — no manual modality tracking needed.
        const first = this.focusableItems[0];
        if (first) {
            for (const it of this.items) it.setAttribute('tabindex', it === first ? '0' : '-1');
            first.focus();
        }
    }

    /**
     * @param {MouseEvent} e
     */
    #handleClick(e) {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const item = target.closest(ITEM_SELECTOR);
        if (item instanceof HTMLElement && isDisabled(item)) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }

    /**
     * @param {string} key
     * @param {HTMLElement[]} items
     * @param {number} from
     */
    #typeAhead(key, items, from) {
        this.#typeBuffer = (this.#typeBuffer + key).toLowerCase();
        if (this.#typeTimer) clearTimeout(this.#typeTimer);
        this.#typeTimer = setTimeout(() => {
            this.#typeBuffer = '';
        }, TYPEAHEAD_TIMEOUT_MS);

        const buf = this.#typeBuffer;
        // When nothing is focused yet, start the search at index 0 so that
        // the very first item is examined first. With a focused item we
        // start one past it so repeated key presses cycle through matches.
        const start = from < 0 ? -1 : from;
        for (let i = 1; i <= items.length; i++) {
            const idx = (start + i + items.length) % items.length;
            const label = (items[idx].textContent ?? '').trim().toLowerCase();
            if (label.startsWith(buf)) {
                this.#focusItem(items[idx]);
                return;
            }
        }
    }
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
function isDisabled(el) {
    return el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
}

/**
 * Define `<neon-menu>` if it has not been registered yet. Idempotent.
 *
 * @param {string} [tagName] Optional override tag name. Defaults to `neon-menu`.
 */
export function registerMenu(tagName = 'neon-menu') {
    if (typeof globalThis.customElements === 'undefined') return;
    if (!globalThis.customElements.get(tagName)) {
        globalThis.customElements.define(tagName, NeonMenuElement);
    }
}

// Side-effect register on import.
registerMenu();
