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

describe('<neon-menu>', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('registers as a custom element and applies role=menu', () => {
        expect(customElements.get('neon-menu')).toBeTruthy();
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">One</button>
                <button class="menu__item" type="button">Two</button>
            </neon-menu>
        `);
        expect(menu.getAttribute('role')).toBe('menu');
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
        for (const it of items) {
            expect(it.getAttribute('role')).toBe('menuitem');
        }
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

    it('reports the active item inside an open shadow root', () => {
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `
            <neon-menu>
                <button class="menu__item" type="button">Alpha</button>
            </neon-menu>
        `;
        document.body.appendChild(host);
        const menu = /** @type {any} */ (shadow.querySelector('neon-menu'));
        const item = /** @type {HTMLElement} */ (shadow.querySelector('.menu__item'));

        item.focus();
        expect(document.activeElement).toBe(host);
        expect(shadow.activeElement).toBe(item);
        expect(menu.activeItem).toBe(item);
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

    it('type-ahead focuses the next matching item', () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">Apples</button>
                <button class="menu__item" type="button">Bananas</button>
                <button class="menu__item" type="button">Berries</button>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('.menu__item')));
        items[0].focus();

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
        expect(document.activeElement).toBe(items[1]);
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
        // Buffer is now 'bb' — no match — stays put.
        expect(document.activeElement).toBe(items[1]);
    });

    it('type-ahead matches the very first item when nothing is focused', () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">Alpha</button>
                <button class="menu__item" type="button">Beta</button>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('.menu__item')));
        // No focus on entry — pressing 'a' should land on index 0.
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
        expect(document.activeElement).toBe(items[0]);
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
});
