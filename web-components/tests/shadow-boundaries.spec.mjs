import { beforeEach, describe, expect, it } from 'vitest';
import '../src/index.js';

describe('shadow rendering boundaries', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    for (const [tag, markup] of [
        ['neon-combobox', '<option value="a">Alpha</option>'],
        ['neon-multicombobox', '<option value="a">Alpha</option>'],
        ['neon-datepicker', ''],
        ['neon-timepicker', ''],
    ]) {
        it(`${tag} keeps form labels and references across its shadow boundary`, async () => {
            document.body.innerHTML = `<form><label id="label" for="control">Value</label><span id="help">Helpful text</span><${tag} id="control" name="value" required aria-describedby="help">${markup}</${tag}></form>`;
            const host = document.getElementById('control');
            const field = host.shadowRoot.querySelector(tag.includes('combobox') ? 'button' : 'input');
            expect(host.querySelector('input, button')).toBeNull();
            expect(host.shadowRoot.adoptedStyleSheets.length).toBeGreaterThan(1);
            expect(field.ariaLabelledByElements).toEqual([document.getElementById('label')]);
            expect(field.ariaDescribedByElements).toEqual([document.getElementById('help')]);
            document.getElementById('label').click();
            expect(host.shadowRoot.activeElement).toBe(field);
            expect(host.checkValidity()).toBe(false);
            host.style.width = '400px';
            expect(host.getBoundingClientRect().width).toBe(400);
            expect(host.shadowRoot.firstElementChild.getBoundingClientRect().width).toBe(400);
            host.setAttribute('aria-label', 'Override');
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(field.ariaLabel).toBe('Override');
            expect(field.ariaLabelledByElements?.length ?? 0).toBe(0);
        });
    }
    it('slots authored menu items and tooltip content without moving external targets', () => {
        document.body.innerHTML = '<button id="trigger" popovertarget="menu">Open<neon-tooltip id="tip"><strong>Help</strong></neon-tooltip></button><neon-menu id="menu" popover><neon-menu-item id="item">Action</neon-menu-item></neon-menu>';
        const menu = document.getElementById('menu');
        const item = document.getElementById('item');
        const tooltip = document.querySelector('neon-tooltip');
        expect(menu.shadowRoot.querySelector('slot').assignedElements()).toEqual([item]);
        expect(item.parentElement).toBe(menu);
        expect(item.shadowRoot.querySelector('slot').assignedNodes()[0].textContent).toBe('Action');
        expect(tooltip.shadowRoot.querySelector('slot').assignedElements()[0].localName).toBe('strong');
        expect(document.getElementById('trigger').popoverTargetElement).toBe(menu);
        expect(getComputedStyle(menu).display).toBe('none');
        menu.showPopover();
        expect(getComputedStyle(menu).display).toBe('grid');
        expect(getComputedStyle(item).paddingInline).not.toBe('0px');
    });
    it('shares the common base sheet across component types', () => {
        document.body.innerHTML = '<neon-combobox></neon-combobox><neon-datepicker></neon-datepicker><neon-menu></neon-menu><neon-icon></neon-icon>';
        const roots = [...document.body.children].map((element) => element.shadowRoot);
        const base = roots[0].adoptedStyleSheets;
        expect(roots.every((root) => root.adoptedStyleSheets.some((sheet) => base.includes(sheet)))).toBe(true);
    });
    it('resolves labels and datalists in the containing shadow tree and composes input events', () => {
        const shell = document.createElement('div');
        document.body.append(shell);
        const root = shell.attachShadow({ mode: 'open' });
        root.innerHTML = '<label id="label" for="combo">Choice</label><neon-combobox id="combo"><option value="a">Alpha</option></neon-combobox><datalist id="times"><option value="09:00">Morning</option></datalist><neon-timepicker list="times"></neon-timepicker>';
        const combo = root.getElementById('combo');
        const search = combo.shadowRoot.querySelector('input[type=search]');
        expect(search.ariaLabelledByElements).toEqual([root.getElementById('label')]);
        expect(root.querySelector('neon-timepicker').list).toBe(root.getElementById('times'));
        const events = [];
        document.body.addEventListener('input', (event) => events.push(event), { once: true });
        search.value = 'Alpha';
        search.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        expect(events).toHaveLength(1);
        expect(events[0].composed).toBe(true);
        expect(events[0].target).toBe(shell);
    });
    it('keeps one multicombobox control after disconnecting and reconnecting', async () => {
        document.body.innerHTML = '<neon-multicombobox><option value="a" selected>Alpha</option></neon-multicombobox>';
        const host = document.querySelector('neon-multicombobox');
        host.remove();
        await new Promise((resolve) => setTimeout(resolve, 0));
        document.body.append(host);
        expect(host.shadowRoot.querySelectorAll('button[aria-haspopup=listbox]')).toHaveLength(1);
        expect(host.querySelectorAll('option')).toHaveLength(1);
        expect(host.values).toEqual(['a']);
    });

});
