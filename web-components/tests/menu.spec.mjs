import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import axe from 'axe-core';

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

/** @param {import('axe-core').AxeResults} results */
function formatAxeViolations(results) {
    return results.violations
        .map((violation) => {
            const targets = violation.nodes.map((node) => node.target.join(', ')).join('; ');
            return `${violation.id}: ${violation.help} (${targets})`;
        })
        .join('\n');
}

function configureAxeElementInternals() {
    axe._enableElementInternals = true;
    axe.externalAPIs({
        getElementInternals: async () => [
            ...Array.from(document.querySelectorAll('neon-menu'), (menu) => ({
                ancestry: axe.utils.getSelector(menu),
                internals: { role: 'menu' },
            })),
            ...Array.from(document.querySelectorAll('neon-menu-item'), (item) => {
                const itemInternals = { role: 'menuitem' };
                if (item.hasAttribute('disabled') || item.getAttribute('aria-disabled') === 'true') {
                    itemInternals.ariaDisabled = 'true';
                }
                if (item.hasAttribute('popovertarget')) {
                    itemInternals.ariaExpanded = 'false';
                    itemInternals.ariaHasPopup = 'menu';
                }
                return {
                    ancestry: axe.utils.getSelector(item),
                    internals: itemInternals,
                };
            }),
        ],
    });
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
        expect(customElements.get('neon-menu-item')).toBeTruthy();
    });

    it('has no axe violations for an inline menu', async () => {
        mount(`
            <main>
                <neon-menu aria-label="File actions">
                <neon-menu-item class="menu__item">New file</neon-menu-item>
                <neon-menu-item class="menu__item">Open</neon-menu-item>
                <neon-menu-item class="menu__item" disabled>Save</neon-menu-item>
                </neon-menu>
            </main>
        `);
        await Promise.resolve();
        configureAxeElementInternals();

        const results = await axe.run(document.body);

        expect(results.violations, formatAxeViolations(results)).toEqual([]);
    });

    it('has no axe violations for a popover menu with a trigger', async () => {
        document.body.innerHTML = `
            <main>
                <button id="trigger" type="button" popovertarget="menu" aria-haspopup="menu">
                    Open menu
                </button>
                <neon-menu id="menu" popover aria-label="File actions">
                    <neon-menu-item class="menu__item">New file</neon-menu-item>
                    <neon-menu-item class="menu__item">Open</neon-menu-item>
                </neon-menu>
            </main>
        `;
        await Promise.resolve();
        configureAxeElementInternals();

        const results = await axe.run(document.body);

        expect(results.violations, formatAxeViolations(results)).toEqual([]);
    });

    it('has no axe violations for nested popover menus', async () => {
        document.body.innerHTML = `
            <main>
                <button id="trigger" type="button" popovertarget="parent-menu" aria-haspopup="menu">
                    Open menu
                </button>
                <neon-menu id="parent-menu" popover aria-label="File actions">
                    <neon-menu-item class="menu__item">Rename</neon-menu-item>
                    <neon-menu-item
                        class="menu__item"
                        popovertarget="child-menu"
                    >
                        Export as
                        <neon-menu id="child-menu" popover aria-label="Export formats">
                            <neon-menu-item class="menu__item">PDF</neon-menu-item>
                            <neon-menu-item class="menu__item">Markdown</neon-menu-item>
                        </neon-menu>
                    </neon-menu-item>
                </neon-menu>
            </main>
        `;
        await Promise.resolve();
        configureAxeElementInternals();

        const results = await axe.run(document.body);

        expect(results.violations, formatAxeViolations(results)).toEqual([]);
    });

    it('preserves an existing host role', () => {
        const menu = mount(`
            <neon-menu role="listbox">
                <neon-menu-item class="menu__item">One</neon-menu-item>
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
                <neon-menu-item class="menu__item">Alpha</neon-menu-item>
                <neon-menu-item class="menu__item" disabled>Disabled</neon-menu-item>
                <neon-menu-item class="menu__item">Bravo</neon-menu-item>
            </neon-menu>
        `);
        await Promise.resolve();
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('neon-menu-item')));
        expect(items[0].getAttribute('tabindex')).toBe('0');
        expect(items[1].getAttribute('tabindex')).toBe('-1');
        // The menu item owns accessible disabled state; the menu only uses
        // disabled state to decide roving focus.
        expect(items[1].hasAttribute('disabled')).toBe(true);
        expect(items[2].getAttribute('tabindex')).toBe('-1');
        for (const item of items) {
            expect(item.hasAttribute('role')).toBe(false);
        }
    });

    it('ignores styled rows that are not menu item elements', async () => {
        const menu = mount(`
            <neon-menu>
                <button class="menu__item" type="button">Alpha</button>
            </neon-menu>
        `);
        await Promise.resolve();
        const item = /** @type {HTMLElement} */ (menu.querySelector('.menu__item'));
        const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });

        menu.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
        expect(item.hasAttribute('role')).toBe(false);
        expect(item.hasAttribute('tabindex')).toBe(false);
    });

    it('includes wrapped descendant menu item elements owned by the nearest menu', async () => {
        const menu = mount(`
            <neon-menu>
                <div>
                    <neon-menu-item class="menu__item">Alpha</neon-menu-item>
                </div>
            </neon-menu>
        `);
        await Promise.resolve();
        const item = /** @type {HTMLElement} */ (menu.querySelector('neon-menu-item'));
        const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });

        menu.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(item);
        expect(item.getAttribute('tabindex')).toBe('0');
    });

    it('includes descendant menu items added after mount', async () => {
        const menu = mount('<neon-menu></neon-menu>');
        const wrapper = document.createElement('div');
        const item = document.createElement('neon-menu-item');
        item.className = 'menu__item';
        item.textContent = 'Alpha';

        wrapper.append(item);
        menu.append(wrapper);
        await nextTask();

        expect(item.getAttribute('tabindex')).toBe('0');
    });

    it('uses current tree order after owned items move', async () => {
        const menu = mount(`
            <neon-menu>
                <neon-menu-item id="alpha" class="menu__item">Alpha</neon-menu-item>
                <neon-menu-item id="bravo" class="menu__item">Bravo</neon-menu-item>
            </neon-menu>
        `);
        const alpha = /** @type {HTMLElement} */ (menu.querySelector('#alpha'));
        const bravo = /** @type {HTMLElement} */ (menu.querySelector('#bravo'));

        menu.insertBefore(bravo, alpha);
        await nextTask();
        bravo.focus();

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

        expect(document.activeElement).toBe(alpha);
    });

    it('updates menu ownership when an item moves into a nested menu', async () => {
        const menu = mount(`
            <neon-menu>
                <neon-menu-item id="alpha" class="menu__item">Alpha</neon-menu-item>
                <neon-menu-item id="bravo" class="menu__item">Bravo</neon-menu-item>
                <neon-menu id="nested-menu">
                    <neon-menu-item id="charlie" class="menu__item">Charlie</neon-menu-item>
                </neon-menu>
            </neon-menu>
        `);
        const alpha = /** @type {HTMLElement} */ (menu.querySelector('#alpha'));
        const bravo = /** @type {HTMLElement} */ (menu.querySelector('#bravo'));
        const nestedMenu = /** @type {HTMLElement} */ (menu.querySelector('#nested-menu'));
        const charlie = /** @type {HTMLElement} */ (menu.querySelector('#charlie'));

        nestedMenu.append(alpha);
        await nextTask();

        expect(bravo.getAttribute('tabindex')).toBe('0');
        expect(charlie.getAttribute('tabindex')).toBe('0');
        expect(alpha.getAttribute('tabindex')).toBe('-1');
    });

    it('does not assign a roving item when every item is disabled', async () => {
        const menu = mount(`
            <neon-menu>
                <neon-menu-item class="menu__item" disabled>Alpha</neon-menu-item>
                <neon-menu-item class="menu__item" aria-disabled="true">Bravo</neon-menu-item>
            </neon-menu>
        `);
        await Promise.resolve();
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('neon-menu-item')));

        expect(items[0].getAttribute('tabindex')).toBe('-1');
        expect(items[1].getAttribute('tabindex')).toBe('-1');
    });

    it('keeps the focused item roving after item state changes', async () => {
        const menu = mount(`
            <neon-menu>
                <neon-menu-item class="menu__item">Alpha</neon-menu-item>
                <neon-menu-item class="menu__item">Bravo</neon-menu-item>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('neon-menu-item')));
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
                <neon-menu-item class="menu__item">Alpha</neon-menu-item>
                <neon-menu-item class="menu__item" disabled>Skip</neon-menu-item>
                <neon-menu-item class="menu__item">Bravo</neon-menu-item>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('neon-menu-item')));
        items[0].focus();

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(document.activeElement).toBe(items[2]);

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        expect(document.activeElement).toBe(items[0]);
    });

    it('moves keyboard navigation from no focused item', () => {
        const menu = mount(`
            <neon-menu>
                <neon-menu-item class="menu__item">Alpha</neon-menu-item>
                <neon-menu-item class="menu__item">Bravo</neon-menu-item>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('neon-menu-item')));

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        expect(document.activeElement).toBe(items[0]);
    });

    it('moves focus inside an open shadow root', () => {
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `
            <neon-menu>
                <neon-menu-item class="menu__item">Alpha</neon-menu-item>
            </neon-menu>
        `;
        document.body.appendChild(host);
        const item = /** @type {HTMLElement} */ (shadow.querySelector('neon-menu-item'));

        item.focus();
        expect(document.activeElement).toBe(host);
        expect(shadow.activeElement).toBe(item);
    });

    it('Home/End jump to first/last focusable item', () => {
        const menu = mount(`
            <neon-menu>
                <neon-menu-item class="menu__item">A</neon-menu-item>
                <neon-menu-item class="menu__item">B</neon-menu-item>
                <neon-menu-item class="menu__item">C</neon-menu-item>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('neon-menu-item')));
        items[1].focus();

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        expect(document.activeElement).toBe(items[2]);
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        expect(document.activeElement).toBe(items[0]);
    });

    it('keeps nested menu items out of parent menu keyboard navigation', async () => {
        const parentMenu = mount(`
            <neon-menu>
                <neon-menu-item id="first" class="menu__item">First</neon-menu-item>
                <neon-menu-item id="submenu-trigger" class="menu__item" popovertarget="child-menu">
                    More
                    <neon-menu id="child-menu" popover>
                        <neon-menu-item id="child-item" class="menu__item">Child</neon-menu-item>
                    </neon-menu>
                </neon-menu-item>
                <neon-menu-item id="last" class="menu__item">Last</neon-menu-item>
            </neon-menu>
        `);
        await nextTask();
        const firstItem = /** @type {HTMLElement} */ (parentMenu.querySelector('#first'));
        const submenuTrigger = /** @type {HTMLElement} */ (parentMenu.querySelector('#submenu-trigger'));
        const lastItem = /** @type {HTMLElement} */ (parentMenu.querySelector('#last'));
        const childItem = /** @type {HTMLElement} */ (parentMenu.querySelector('#child-item'));

        expect(childItem.getAttribute('tabindex')).toBe('0');
        firstItem.focus();
        parentMenu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(document.activeElement).toBe(submenuTrigger);

        parentMenu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(document.activeElement).toBe(lastItem);
    });

    it('Enter activates the focused item via click', () => {
        const menu = mount(`
            <neon-menu>
                <neon-menu-item class="menu__item">Hit me</neon-menu-item>
            </neon-menu>
        `);
        const item = /** @type {HTMLElement} */ (menu.querySelector('neon-menu-item'));
        let clicked = 0;
        item.addEventListener('click', () => clicked++);
        item.focus();

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(clicked).toBe(1);
    });

    it('Space activates the focused item via click', () => {
        const menu = mount(`
            <neon-menu>
                <neon-menu-item class="menu__item">Hit me</neon-menu-item>
            </neon-menu>
        `);
        const item = /** @type {HTMLElement} */ (menu.querySelector('neon-menu-item'));
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
                <neon-menu-item class="menu__item">Alpha</neon-menu-item>
                <span tabindex="0">Other focus target</span>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('neon-menu-item')));
        const otherFocusTarget = /** @type {HTMLElement} */ (menu.querySelector('span'));

        otherFocusTarget.focus();

        expect(document.activeElement).toBe(otherFocusTarget);
        expect(items[0].getAttribute('tabindex')).toBe('0');
    });

    it('does not activate an item when Enter is pressed without focus', () => {
        const menu = mount(`
            <neon-menu>
                <neon-menu-item class="menu__item">Hit me</neon-menu-item>
            </neon-menu>
        `);
        const item = /** @type {HTMLElement} */ (menu.querySelector('neon-menu-item'));
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
                <neon-menu-item class="menu__item">A</neon-menu-item>
                <neon-menu-item class="menu__item" disabled>B</neon-menu-item>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('neon-menu-item')));
        items[0].focus();
        items[1].removeAttribute('disabled');
        // Let the reactive DOM query observe the disabled-state change.
        await new Promise((resolve) => setTimeout(resolve, 0));

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(document.activeElement).toBe(items[1]);
    });

    it('focuses the first focusable item when a popover menu opens', () => {
        const menu = mount(`
            <neon-menu>
                <neon-menu-item class="menu__item">Alpha</neon-menu-item>
                <neon-menu-item class="menu__item">Bravo</neon-menu-item>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('neon-menu-item')));
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
                <neon-menu-item class="menu__item">Alpha</neon-menu-item>
                <neon-menu-item class="menu__item">Bravo</neon-menu-item>
            </neon-menu>
        `);
        const items = /** @type {HTMLElement[]} */ (Array.from(menu.querySelectorAll('neon-menu-item')));
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
                <neon-menu-item class="menu__item" disabled>Alpha</neon-menu-item>
            </neon-menu>
        `);
        const item = /** @type {HTMLElement} */ (menu.querySelector('neon-menu-item'));
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
                <neon-menu-item class="menu__item">Alpha</neon-menu-item>
            </neon-menu>
        `;
        const trigger = /** @type {HTMLElement} */ (document.querySelector('#trigger'));
        const menu = /** @type {HTMLElement & { hidePopover: () => void }} */ (document.querySelector('#menu'));
        const item = /** @type {HTMLElement} */ (document.querySelector('neon-menu-item'));

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
                <neon-menu-item class="menu__item">Rename</neon-menu-item>
                <neon-menu-item class="menu__item" popovertarget="child-menu" aria-haspopup="menu">
                    Export as
                    <neon-menu id="child-menu" popover>
                        <neon-menu-item class="menu__item">PDF</neon-menu-item>
                        <neon-menu-item class="menu__item">Markdown</neon-menu-item>
                    </neon-menu>
                </neon-menu-item>
            </neon-menu>
        `;
        const trigger = /** @type {HTMLElement} */ (document.querySelector('#trigger'));
        const parentItems = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('#parent-menu > neon-menu-item')));
        const childMenu = /** @type {HTMLElement & { hidePopover: () => void }} */ (document.querySelector('#child-menu'));
        const childItem = /** @type {HTMLElement} */ (document.querySelector('#child-menu neon-menu-item'));

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
                <neon-menu-item class="menu__item">Alpha</neon-menu-item>
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
                <neon-menu-item class="menu__item" aria-disabled="true">
                    <span>Disabled</span>
                </neon-menu-item>
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
                <neon-menu-item class="menu__item">
                    <span>Enabled</span>
                </neon-menu-item>
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

    it('cancels clicks on disabled menu item elements without a parent menu', async () => {
        const item = mount('<neon-menu-item class="menu__item" disabled>Disabled</neon-menu-item>');
        await Promise.resolve();
        let reachedLaterListener = false;
        item.addEventListener('click', () => {
            reachedLaterListener = true;
        });
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });

        item.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(reachedLaterListener).toBe(false);
    });

    it('lets a menu item element toggle its popover target', async () => {
        document.body.innerHTML = `
            <neon-menu-item id="item" class="menu__item" popovertarget="menu">
                Export as
            </neon-menu-item>
            <neon-menu id="menu" popover>
                <neon-menu-item class="menu__item">PDF</neon-menu-item>
            </neon-menu>
        `;
        await nextTask();
        const item = /** @type {HTMLElement} */ (document.querySelector('#item'));
        const menu = /** @type {HTMLElement} */ (document.querySelector('#menu'));

        item.click();
        await nextTask();
        expect(menu.matches(':popover-open')).toBe(true);

        item.click();
        await nextTask();
        expect(menu.matches(':popover-open')).toBe(false);
    });

    it('keeps a parent popover open when a menu item opens a child popover', async () => {
        document.body.innerHTML = `
            <button id="trigger" type="button" popovertarget="parent-menu">Open</button>
            <neon-menu id="parent-menu" popover>
                <neon-menu-item
                    id="item"
                    class="menu__item"
                    popovertarget="child-menu"
                >
                    Export as
                    <neon-menu id="child-menu" popover>
                        <neon-menu-item class="menu__item">PDF</neon-menu-item>
                    </neon-menu>
                </neon-menu-item>
            </neon-menu>
        `;
        await nextTask();
        const trigger = /** @type {HTMLElement} */ (document.querySelector('#trigger'));
        const item = /** @type {HTMLElement} */ (document.querySelector('#item'));
        const parentMenu = /** @type {HTMLElement} */ (document.querySelector('#parent-menu'));
        const childMenu = /** @type {HTMLElement} */ (document.querySelector('#child-menu'));

        trigger.click();
        await nextTask();
        item.click();
        await nextTask();

        expect(parentMenu.matches(':popover-open')).toBe(true);
        expect(childMenu.matches(':popover-open')).toBe(true);
    });

    it('closes all open menus in the root tree after a leaf item click', async () => {
        document.body.innerHTML = `
            <button id="trigger" type="button" popovertarget="parent-menu">Open</button>
            <neon-menu id="parent-menu" popover>
                <neon-menu-item
                    id="item"
                    class="menu__item"
                    popovertarget="child-menu"
                >
                    Export as
                    <neon-menu id="child-menu" popover>
                        <neon-menu-item id="leaf" class="menu__item">PDF</neon-menu-item>
                    </neon-menu>
                </neon-menu-item>
            </neon-menu>
        `;
        await nextTask();
        const trigger = /** @type {HTMLElement} */ (document.querySelector('#trigger'));
        const item = /** @type {HTMLElement} */ (document.querySelector('#item'));
        const leaf = /** @type {HTMLElement} */ (document.querySelector('#leaf'));
        const parentMenu = /** @type {HTMLElement} */ (document.querySelector('#parent-menu'));
        const childMenu = /** @type {HTMLElement} */ (document.querySelector('#child-menu'));

        trigger.click();
        await nextTask();
        item.click();
        await nextTask();
        expect(parentMenu.matches(':popover-open')).toBe(true);
        expect(childMenu.matches(':popover-open')).toBe(true);

        leaf.click();
        await nextTask();

        expect(parentMenu.matches(':popover-open')).toBe(false);
        expect(childMenu.matches(':popover-open')).toBe(false);
    });

    it('does not close open menus after a disabled item click', async () => {
        document.body.innerHTML = `
            <button id="trigger" type="button" popovertarget="menu">Open</button>
            <neon-menu id="menu" popover>
                <neon-menu-item id="disabled-item" class="menu__item" disabled>Disabled</neon-menu-item>
            </neon-menu>
        `;
        await nextTask();
        const trigger = /** @type {HTMLElement} */ (document.querySelector('#trigger'));
        const disabledItem = /** @type {HTMLElement} */ (document.querySelector('#disabled-item'));
        const menu = /** @type {HTMLElement} */ (document.querySelector('#menu'));

        trigger.click();
        await nextTask();
        disabledItem.click();
        await nextTask();

        expect(menu.matches(':popover-open')).toBe(true);
    });

    it('lets a menu item element show and hide its popover target', async () => {
        document.body.innerHTML = `
            <neon-menu-item
                id="item"
                class="menu__item"
                popovertarget="menu"
                popovertargetaction="show"
            >
                Export as
            </neon-menu-item>
            <neon-menu id="menu" popover>
                <neon-menu-item class="menu__item">PDF</neon-menu-item>
            </neon-menu>
        `;
        await nextTask();
        const item = /** @type {HTMLElement} */ (document.querySelector('#item'));
        const menu = /** @type {HTMLElement} */ (document.querySelector('#menu'));

        item.click();
        await nextTask();
        expect(menu.matches(':popover-open')).toBe(true);

        item.setAttribute('popovertargetaction', 'hide');
        item.click();
        await nextTask();
        expect(menu.matches(':popover-open')).toBe(false);
    });

    it('updates popover target behavior when the target attribute changes', async () => {
        document.body.innerHTML = `
            <neon-menu-item id="item" class="menu__item" popovertarget="first-menu">
                Export as
            </neon-menu-item>
            <neon-menu id="first-menu" popover>
                <neon-menu-item class="menu__item">PDF</neon-menu-item>
            </neon-menu>
            <neon-menu id="second-menu" popover>
                <neon-menu-item class="menu__item">Markdown</neon-menu-item>
            </neon-menu>
        `;
        await nextTask();
        const item = /** @type {HTMLElement} */ (document.querySelector('#item'));
        const firstMenu = /** @type {HTMLElement} */ (document.querySelector('#first-menu'));
        const secondMenu = /** @type {HTMLElement} */ (document.querySelector('#second-menu'));

        item.setAttribute('popovertarget', 'second-menu');
        await nextTask();
        item.click();
        await nextTask();

        expect(firstMenu.matches(':popover-open')).toBe(false);
        expect(secondMenu.matches(':popover-open')).toBe(true);
    });

});
