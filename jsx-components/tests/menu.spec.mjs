import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { render } from '@slimlib/jsx';
import { signal } from '@slimlib/store';

import { Menu, MenuItem } from '../src/menu.jsx';

/** @type {Array<() => void>} */
let renderDisposers = [];

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

function createHost() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    return host;
}

/**
 * @param {() => import('@slimlib/jsx').Child} createContent
 * @param {{ placement?: string | (() => string | undefined), triggerElement?: HTMLButtonElement, menuProps?: Record<string, unknown> }} [options]
 */
function mountMenu(createContent, options = {}) {
    const host = createHost();
    const triggerElement = options.triggerElement ?? document.createElement('button');
    triggerElement.type = 'button';
    triggerElement.textContent ||= 'Actions';
    const dispose = render(() => Menu({
        ...options.menuProps,
        children: triggerElement,
        content: createContent(),
        placement: options.placement,
    }), host);
    renderDisposers.push(dispose);
    const menuElement = /** @type {HTMLElement} */ (host.querySelector('.menu'));
    return { dispose, host, menuElement, triggerElement };
}

describe('Menu JSX component', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        for (const dispose of renderDisposers) {
            dispose();
        }
        renderDisposers = [];
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('renders a wired trigger and sibling menu popover', async () => {
        let item;
        const { host, menuElement, triggerElement } = mountMenu(() => {
            item = MenuItem({ children: 'Open' });
            return item;
        });
        await nextTask();

        expect(host.children).toHaveLength(2);
        expect(host.children[0]).toBe(triggerElement);
        expect(host.children[1]).toBe(menuElement);
        expect(triggerElement.getAttribute('popovertarget')).toBe(menuElement.id);
        expect(menuElement.id).toMatch(/^neon-menu-[a-z0-9]{9}$/);
        expect(menuElement.getAttribute('popover')).toBe('auto');
        expect(menuElement.getAttribute('role')).toBe('menu');
        expect(menuElement.getAttribute('aria-labelledby')).toBe(triggerElement.id);
        expect(item.getAttribute('role')).toBe('menuitem');
        expect(item.getAttribute('tabindex')).toBe('0');
    });

    it('moves focus in DOM order and includes disabled items', async () => {
        let items = [];
        const { menuElement, triggerElement } = mountMenu(() => {
            items = [
                MenuItem({ children: 'Alpha' }),
                MenuItem({ children: 'Disabled', disabled: true }),
                MenuItem({ children: 'Bravo' }),
            ];
            return items;
        });
        await nextTask();

        expect(items[1].getAttribute('aria-disabled')).toBe('true');
        triggerElement.click();
        await nextTask();
        items[0].focus();
        menuElement.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'ArrowDown',
        }));
        expect(document.activeElement).toBe(items[1]);

        menuElement.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'ArrowDown',
        }));
        expect(document.activeElement).toBe(items[2]);
    });

    it('does not invoke a disabled item click handler', async () => {
        const onClick = vi.fn();
        let item;
        const { menuElement, triggerElement } = mountMenu(() => {
            item = MenuItem({ children: 'Delete', disabled: true, onClick });
            return item;
        });
        await nextTask();
        triggerElement.click();
        await nextTask();
        item.focus();

        const event = new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'Enter',
        });
        menuElement.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(onClick).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(item);
    });

    it('updates reactive disabled and placement props', async () => {
        const disabled = signal(false);
        const placement = signal('block-start');
        let item;
        const { menuElement } = mountMenu(() => {
            item = MenuItem({ children: 'Archive', disabled });
            return item;
        }, { placement });

        expect(item.hasAttribute('aria-disabled')).toBe(false);
        expect(menuElement.classList.contains('-block-start')).toBe(true);

        disabled.set(true);
        placement.set('inline-end');
        await Promise.resolve();

        expect(item.getAttribute('aria-disabled')).toBe('true');
        expect(menuElement.classList.contains('-block-start')).toBe(false);
        expect(menuElement.classList.contains('-inline-end')).toBe(true);
    });

    it('opens from its trigger and focuses the first item', async () => {
        let items = [];
        const { menuElement, triggerElement } = mountMenu(() => {
            items = [
                MenuItem({ children: 'Alpha' }),
                MenuItem({ children: 'Bravo' }),
            ];
            return items;
        });
        await nextTask();

        triggerElement.click();
        await nextTask();

        expect(menuElement.matches(':popover-open')).toBe(true);
        expect(document.activeElement).toBe(items[0]);
    });

    it('supports nested menus and keeps child items out of parent navigation', async () => {
        let childItems = [];
        let submenuTrigger;
        let firstItem;
        let lastItem;
        const { menuElement, triggerElement } = mountMenu(() => {
            childItems = [
                MenuItem({ children: 'PDF' }),
                MenuItem({ children: 'Markdown' }),
            ];
            submenuTrigger = MenuItem({ children: 'Export as' });
            const nestedMenu = Menu({
                children: submenuTrigger,
                content: childItems,
                placement: 'inline-end',
            });
            firstItem = MenuItem({ children: 'Rename' });
            lastItem = MenuItem({ children: 'Archive' });
            return [firstItem, nestedMenu, lastItem];
        });
        await nextTask();
        const childMenu = /** @type {HTMLElement} */ (
            document.getElementById(submenuTrigger.getAttribute('popovertarget') ?? '')
        );

        triggerElement.click();
        await nextTask();
        firstItem.focus();
        menuElement.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'ArrowDown',
        }));
        expect(document.activeElement).toBe(submenuTrigger);

        menuElement.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'ArrowRight',
        }));
        await nextTask();

        expect(childMenu.matches(':popover-open')).toBe(true);
        expect(document.activeElement).toBe(childItems[0]);
        expect(submenuTrigger.getAttribute('aria-haspopup')).toBe('menu');
        expect(submenuTrigger.getAttribute('aria-expanded')).toBe('true');

        childMenu.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'ArrowLeft',
        }));
        await nextTask();

        expect(childMenu.matches(':popover-open')).toBe(false);
        expect(document.activeElement).toBe(submenuTrigger);
        expect(menuElement.matches(':popover-open')).toBe(true);
    });

    it('closes the complete nested menu tree after a leaf action', async () => {
        let leafItem;
        let submenuTrigger;
        const { menuElement, triggerElement } = mountMenu(() => {
            leafItem = MenuItem({ children: 'PDF' });
            submenuTrigger = MenuItem({ children: 'Export as' });
            return Menu({ children: submenuTrigger, content: leafItem });
        });
        await nextTask();
        const childMenu = /** @type {HTMLElement} */ (
            document.getElementById(submenuTrigger.getAttribute('popovertarget') ?? '')
        );

        triggerElement.click();
        await nextTask();
        submenuTrigger.click();
        await nextTask();
        expect(menuElement.matches(':popover-open')).toBe(true);
        expect(childMenu.matches(':popover-open')).toBe(true);

        leafItem.click();
        await nextTask();

        expect(menuElement.matches(':popover-open')).toBe(false);
        expect(childMenu.matches(':popover-open')).toBe(false);
    });

    it('preserves consumer-owned trigger and menu labelling attributes', async () => {
        const triggerElement = document.createElement('button');
        triggerElement.type = 'button';
        triggerElement.id = 'actions-trigger';
        triggerElement.setAttribute('popovertarget', 'consumer-menu');
        const { menuElement } = mountMenu(() => MenuItem({ children: 'Open' }), {
            triggerElement,
            menuProps: {
                id: 'consumer-menu',
                'aria-label': 'Commands',
            },
        });
        await nextTask();

        expect(triggerElement.id).toBe('actions-trigger');
        expect(triggerElement.getAttribute('popovertarget')).toBe('consumer-menu');
        expect(menuElement.getAttribute('aria-label')).toBe('Commands');
        expect(menuElement.hasAttribute('aria-labelledby')).toBe(false);
    });

    it('cleans up owned trigger attributes and roving tabindex on disposal', async () => {
        let item;
        const { dispose, host, triggerElement } = mountMenu(() => {
            item = MenuItem({ children: 'Open' });
            return item;
        });
        await nextTask();

        expect(triggerElement.hasAttribute('popovertarget')).toBe(true);
        expect(triggerElement.id).toMatch(/^neon-menu-trigger-/);
        expect(item.getAttribute('tabindex')).toBe('0');

        dispose();

        expect(host.firstChild).toBeNull();
        expect(triggerElement.hasAttribute('popovertarget')).toBe(false);
        expect(triggerElement.hasAttribute('id')).toBe(false);
        expect(item.hasAttribute('tabindex')).toBe(false);
    });

    it('warns and returns an invalid trigger unchanged', () => {
        const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const host = createHost();
        const dispose = render(() => Menu({ children: 'Actions', content: 'Open' }), host);
        renderDisposers.push(dispose);

        expect(host.textContent).toBe('Actions');
        expect(host.querySelector('.menu')).toBeNull();
        expect(debug).toHaveBeenCalledWith(
            'Menu: expected exactly one HTMLButtonElement child to use as the trigger.',
            'Actions',
        );
    });

    it('has no axe violations for a popover menu', async () => {
        mountMenu(() => [
            MenuItem({ children: 'Open' }),
            MenuItem({ children: 'Delete', disabled: true }),
        ]);
        await nextTask();

        const results = await axe.run(document.body);

        expect(results.violations, formatAxeViolations(results)).toEqual([]);
    });
});
