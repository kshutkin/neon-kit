import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import '../src/menu.js';

/**
 * @param {string} html
 * @returns {HTMLElement}
 */
function mount(html) {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    return /** @type {HTMLElement} */ (host.firstElementChild);
}

function nextTask() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('<neon-menu>', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('registers as a custom element', () => {
        expect(customElements.get('neon-menu')).toBeTruthy();
    });

    it('preserves an existing host role', () => {
        const menu = mount(`
            <neon-menu role="listbox">
                <button class="menu__item" type="button">One</button>
            </neon-menu>
        `);

        expect(menu.getAttribute('role')).toBe('listbox');
    });

    it('ignores keyboard navigation when the menu has no focusable items', () => {
        const menu = mount('<neon-menu></neon-menu>');
        const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });

        menu.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
        expect(menu.querySelectorAll('.menu__item')).toHaveLength(0);
    });

    it('assigns roving tabindex with the first focusable item active', async () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">Alpha</button>
                <button class="menu__item" type="button" disabled>Disabled</button>
                <button class="menu__item" type="button">Bravo</button>
            </neon-menu>
        `);
        await Promise.resolve();
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('.menu__item')));
        expect(items[0].getAttribute('tabindex')).toBe('0');
        expect(items[1].getAttribute('tabindex')).toBe('-1');
        // Native [disabled] is left to the platform; we don't mirror it to
        // aria-disabled (so removing the attribute cleanly re-enables).
        expect(items[1].hasAttribute('disabled')).toBe(true);
        expect(items[2].getAttribute('tabindex')).toBe('-1');
        for (const item of items) {
            expect(item.getAttribute('role')).toBe('menuitem');
        }
    });

    it('does not assign a roving item when every item is disabled', async () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button" disabled>Alpha</button>
                <button class="menu__item" type="button" aria-disabled="true">Bravo</button>
            </neon-menu>
        `);
        await Promise.resolve();
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('.menu__item')));

        expect(items[0].getAttribute('tabindex')).toBe('-1');
        expect(items[1].getAttribute('tabindex')).toBe('-1');
    });

    it('keeps the focused item roving after item state changes', async () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">Alpha</button>
                <button class="menu__item" type="button">Bravo</button>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('.menu__item')));
        items[1].focus();
        items[0].setAttribute('aria-disabled', 'true');
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(items[0].getAttribute('tabindex')).toBe('-1');
        expect(items[1].getAttribute('tabindex')).toBe('0');
        expect(document.activeElement).toBe(items[1]);
    });

    it('moves focus with ArrowDown/ArrowUp skipping disabled items', () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">Alpha</button>
                <button class="menu__item" type="button" disabled>Skip</button>
                <button class="menu__item" type="button">Bravo</button>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('.menu__item')));
        items[0].focus();

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(document.activeElement).toBe(items[2]);

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        expect(document.activeElement).toBe(items[0]);
    });

    it('moves keyboard navigation from no focused item', () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">Alpha</button>
                <button class="menu__item" type="button">Bravo</button>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('.menu__item')));

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        expect(document.activeElement).toBe(items[0]);
    });

    it('moves focus inside an open shadow root', () => {
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `
            <neon-menu>
                <button class="menu__item" type="button">Alpha</button>
            </neon-menu>
        `;
        document.body.appendChild(host);
        const item = /** @type {HTMLElement} */ (shadow.querySelector('.menu__item'));

        item.focus();
        expect(document.activeElement).toBe(host);
        expect(shadow.activeElement).toBe(item);
    });

    it('Home/End jump to first/last focusable item', () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">A</button>
                <button class="menu__item" type="button">B</button>
                <button class="menu__item" type="button">C</button>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('.menu__item')));
        items[1].focus();

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        expect(document.activeElement).toBe(items[2]);
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        expect(document.activeElement).toBe(items[0]);
    });

    it('Enter activates the focused item via click', () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">Hit me</button>
            </neon-menu>
        `);
        const item = /** @type {HTMLElement} */ (menu.querySelector('.menu__item'));
        let clicked = 0;
        item.addEventListener('click', () => clicked++);
        item.focus();

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(clicked).toBe(1);
    });

    it('Space activates the focused item via click', () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">Hit me</button>
            </neon-menu>
        `);
        const item = /** @type {HTMLElement} */ (menu.querySelector('.menu__item'));
        let clicked = 0;
        item.addEventListener('click', () => {
            clicked++;
        });
        item.focus();

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

        expect(clicked).toBe(1);
    });

    it('ignores focus on child elements that are not menu items', () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">Alpha</button>
                <span tabindex="0">Other focus target</span>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('.menu__item')));
        const otherFocusTarget = /** @type {HTMLElement} */ (menu.querySelector('span'));

        otherFocusTarget.focus();

        expect(document.activeElement).toBe(otherFocusTarget);
        expect(items[0].getAttribute('tabindex')).toBe('0');
    });

    it('does not activate an item when Enter is pressed without focus', () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">Hit me</button>
            </neon-menu>
        `);
        const item = /** @type {HTMLElement} */ (menu.querySelector('.menu__item'));
        let clicked = 0;
        item.addEventListener('click', () => {
            clicked++;
        });

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        expect(clicked).toBe(0);
    });

    it('un-disabling an item makes it focusable again', async () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">A</button>
                <button class="menu__item" type="button" disabled>B</button>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('.menu__item')));
        items[0].focus();
        items[1].removeAttribute('disabled');
        // Let the MutationObserver re-run.
        await new Promise((resolve) => setTimeout(resolve, 0));

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(document.activeElement).toBe(items[1]);
    });

    it('focuses the first focusable item when a popover menu opens', () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">Alpha</button>
                <button class="menu__item" type="button">Bravo</button>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('.menu__item')));
        const event = new Event('toggle', { bubbles: true });
        Object.defineProperty(event, 'newState', { value: 'open' });

        menu.dispatchEvent(event);

        expect(document.activeElement).toBe(items[0]);
        expect(items[0].getAttribute('tabindex')).toBe('0');
        expect(items[1].getAttribute('tabindex')).toBe('-1');
    });

    it('does not restore focus to an item that was already inside the opening menu', () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">Alpha</button>
                <button class="menu__item" type="button">Bravo</button>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('.menu__item')));
        const openEvent = new Event('toggle', { bubbles: true });
        const closedEvent = new Event('toggle', { bubbles: true });
        Object.defineProperty(openEvent, 'newState', { value: 'open' });
        Object.defineProperty(closedEvent, 'newState', { value: 'closed' });
        items[1].focus();

        menu.dispatchEvent(openEvent);
        expect(document.activeElement).toBe(items[0]);

        menu.dispatchEvent(closedEvent);

        expect(document.activeElement).toBe(items[0]);
    });

    it('ignores closed popover toggles and open toggles without focusable items', () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button" disabled>Alpha</button>
            </neon-menu>
        `);
        const item = /** @type {HTMLElement} */ (menu.querySelector('.menu__item'));
        const closedEvent = new Event('toggle', { bubbles: true });
        const openEvent = new Event('toggle', { bubbles: true });
        Object.defineProperty(closedEvent, 'newState', { value: 'closed' });
        Object.defineProperty(openEvent, 'newState', { value: 'open' });

        menu.dispatchEvent(closedEvent);
        menu.dispatchEvent(openEvent);

        expect(document.activeElement).not.toBe(item);
        expect(item.getAttribute('tabindex')).toBe('-1');
    });

    it('lets the platform restore focus to a top-level popover trigger', async () => {
        document.body.innerHTML = `
            <button id="trigger" type="button" popovertarget="menu">Open</button>
            <neon-menu id="menu" popover>
                <button class="menu__item" type="button">Alpha</button>
            </neon-menu>
        `;
        const trigger = /** @type {HTMLElement} */ (document.querySelector('#trigger'));
        const menu = /** @type {HTMLElement & { hidePopover: () => void }} */ (document.querySelector('#menu'));
        const item = /** @type {HTMLElement} */ (document.querySelector('.menu__item'));

        trigger.focus();
        trigger.click();
        await nextTask();
        expect(document.activeElement).toBe(item);

        menu.hidePopover();
        await nextTask();

        expect(document.activeElement).toBe(trigger);
    });

    it('restores focus to the parent item when a child popover closes with focus inside it', async () => {
        document.body.innerHTML = `
            <button id="trigger" type="button" popovertarget="parent-menu">Open</button>
            <neon-menu id="parent-menu" popover>
                <button class="menu__item" type="button">Rename</button>
                <button class="menu__item" type="button" popovertarget="child-menu" aria-haspopup="menu">
                    Export as
                </button>
            </neon-menu>
            <neon-menu id="child-menu" popover>
                <button class="menu__item" type="button">PDF</button>
                <button class="menu__item" type="button">Markdown</button>
            </neon-menu>
        `;
        const trigger = /** @type {HTMLElement} */ (document.querySelector('#trigger'));
        const parentItems = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#parent-menu .menu__item'));
        const childMenu = /** @type {HTMLElement & { hidePopover: () => void }} */ (document.querySelector('#child-menu'));
        const childItem = /** @type {HTMLElement} */ (document.querySelector('#child-menu .menu__item'));

        trigger.focus();
        trigger.click();
        await nextTask();
        parentItems[1].focus();
        parentItems[1].click();
        await nextTask();
        expect(document.activeElement).toBe(childItem);

        childMenu.hidePopover();
        await nextTask();

        expect(document.activeElement).toBe(parentItems[1]);
    });

    it('does not restore focus when focus has already moved outside the closing menu', async () => {
        document.body.innerHTML = `
            <button id="trigger" type="button" popovertarget="menu">Open</button>
            <button id="outside" type="button">Outside</button>
            <neon-menu id="menu" popover>
                <button class="menu__item" type="button">Alpha</button>
            </neon-menu>
        `;
        const trigger = /** @type {HTMLElement} */ (document.querySelector('#trigger'));
        const outside = /** @type {HTMLElement} */ (document.querySelector('#outside'));
        const menu = /** @type {HTMLElement & { hidePopover: () => void }} */ (document.querySelector('#menu'));

        trigger.focus();
        trigger.click();
        await nextTask();
        outside.focus();
        menu.hidePopover();
        await nextTask();

        expect(document.activeElement).toBe(outside);
    });

    it('cancels clicks on disabled items from nested targets', () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button" aria-disabled="true">
                    <span>Disabled</span>
                </button>
            </neon-menu>
        `);
        const target = /** @type {HTMLElement} */ (menu.querySelector('span'));
        let reachedLaterListener = false;
        menu.addEventListener('click', () => {
            reachedLaterListener = true;
        });
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });

        target.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(reachedLaterListener).toBe(false);
    });

    it('allows clicks on enabled items', () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">
                    <span>Enabled</span>
                </button>
            </neon-menu>
        `);
        const target = /** @type {HTMLElement} */ (menu.querySelector('span'));
        let reachedLaterListener = false;
        menu.addEventListener('click', () => {
            reachedLaterListener = true;
        });
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });

        target.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
        expect(reachedLaterListener).toBe(true);
    });

    it('ignores click events from non-element targets', () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">Enabled</button>
            </neon-menu>
        `);
        const textTarget = /** @type {Text} */ (menu.querySelector('.menu__item').firstChild);
        let reachedLaterListener = false;
        menu.addEventListener('click', () => {
            reachedLaterListener = true;
        });
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });

        textTarget.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
        expect(reachedLaterListener).toBe(true);
    });
});
