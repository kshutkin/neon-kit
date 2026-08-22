import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';

// Side-effect import registers `<neon-tooltip>`.
import '../src/tooltip.jsx';

/**
 * @param {string} html
 * @returns {HTMLElement}
 */
function mount(html) {
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    const root = /** @type {HTMLElement} */ (wrap.firstElementChild);
    document.body.appendChild(root);
    return root;
}

const tick = () => Promise.resolve();

/** @param {import('axe-core').AxeResults} results */
function formatAxeViolations(results) {
    return results.violations
        .map((violation) => {
            const targets = violation.nodes.map((node) => node.target.join(', ')).join('; ');
            return `${violation.id}: ${violation.help} (${targets})`;
        })
        .join('\n');
}

describe('<neon-tooltip>', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('registers as an autonomous custom element', () => {
        expect(customElements.get('neon-tooltip')).toBeTruthy();
    });

    it('attaches itself as a popover and wires its parent', () => {
        const btn = mount(
            `<button>Save<neon-tooltip>Saves the document.</neon-tooltip></button>`,
        );
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        expect(tip.hasAttribute('popover')).toBe(true);
        expect(tip.classList.contains('tooltip')).toBe(true);
        expect(tip.classList.contains('-top')).toBe(true);
        expect(tip.id).toMatch(/^neon-tooltip-[a-z0-9]{9}$/);
        expect(btn.getAttribute('aria-describedby')).toBe(tip.id);
        expect(tip.querySelector('.tooltip__arrow')).not.toBeNull();
        expect(tip.getAttribute('role')).toBeNull();
    });

    it('uses a generated tooltip id even when the consumer provides one', () => {
        const btn = mount(
            `<button>Save<neon-tooltip id="save-tip">Saves the document.</neon-tooltip></button>`,
        );
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        expect(tip.id).toMatch(/^neon-tooltip-[a-z0-9]{9}$/);
        expect(tip.id).not.toBe('save-tip');
        expect(btn.getAttribute('aria-describedby')).toBe(tip.id);
    });

    it('respects the placement attribute', () => {
        const btn = mount(
            `<button>x<neon-tooltip placement="right">y</neon-tooltip></button>`,
        );
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        expect(tip.classList.contains('-right')).toBe(true);
        expect(tip.classList.contains('-top')).toBe(false);
    });

    it('falls back to top for unknown placement values', () => {
        const btn = mount(
            `<button>x<neon-tooltip placement="somewhere">y</neon-tooltip></button>`,
        );
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        expect(tip.classList.contains('-top')).toBe(true);
    });

    it('enforces manual popover mode', () => {
        const btn = mount(
            `<button>x<neon-tooltip popover="auto">y</neon-tooltip></button>`,
        );
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        expect(tip.getAttribute('popover')).toBe('manual');
    });

    it('does not reflect role=tooltip when the body contains stylized markup', () => {
        const btn = mount(
            `<button>x<neon-tooltip><strong>Rich</strong> body</neon-tooltip></button>`,
        );
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        expect(tip.hasAttribute('role')).toBe(false);
    });

    it('has no axe violations for a described trigger', async () => {
        mount(
            `<button type="button">Save<neon-tooltip>Saves the document.</neon-tooltip></button>`,
        );

        const results = await axe.run(document.body);
        expect(results.violations, formatAxeViolations(results)).toEqual([]);
    });

    it('does not steal the click from button parents (no popovertarget hand-off)', () => {
        const link = mount(
            `<a href="#x">help<neon-tooltip>Hint.</neon-tooltip></a>`,
        );
        const tip = /** @type {HTMLElement} */ (link.querySelector('neon-tooltip'));
        expect(link.hasAttribute('popovertarget')).toBe(false);
        expect(link.getAttribute('aria-describedby')).toBe(tip.id);
    });

    it('cleans up parent attributes on disconnect', () => {
        const btn = mount(`<button>x<neon-tooltip>y</neon-tooltip></button>`);
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        const id = tip.id;
        expect(btn.getAttribute('aria-describedby')).toBe(id);

        tip.remove();
        expect(btn.hasAttribute('aria-describedby')).toBe(false);
    });

    it('reuses an existing anchor-name and leaves it on disconnect', () => {
        const btn = mount(
            `<button style="anchor-name: --existing">x<neon-tooltip>y</neon-tooltip></button>`,
        );
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        expect(tip.style.getPropertyValue('position-anchor')).toBe('--existing');

        tip.remove();
        expect(btn.style.getPropertyValue('anchor-name')).toBe('--existing');
    });

    it('does not overwrite consumer-set position-anchor', () => {
        const btn = mount(
            `<button>x<neon-tooltip style="position-anchor: --custom">y</neon-tooltip></button>`,
        );
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        expect(tip.style.getPropertyValue('position-anchor')).toBe('--custom');

        tip.remove();
        expect(btn.style.getPropertyValue('anchor-name')).toBe('');
    });

    it('keeps consumer-set position-anchor when reusing an existing anchor-name', () => {
        const btn = mount(
            `<button style="anchor-name: --existing">x<neon-tooltip style="position-anchor: --custom">y</neon-tooltip></button>`,
        );
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        expect(tip.style.getPropertyValue('position-anchor')).toBe('--custom');
    });

    it('initializes the host without parent wiring when connected without a parent element', () => {
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        const tip = document.createElement('neon-tooltip');
        document.body.appendChild(host);

        shadow.appendChild(tip);
        expect(tip.classList.contains('tooltip')).toBe(true);
        expect(tip.id).toMatch(/^neon-tooltip-[a-z0-9]{9}$/);
        expect(tip.style.getPropertyValue('position-anchor')).toBe('');

        tip.remove();
    });

    it('updates placement when the attribute changes', async () => {
        const btn = mount(`<button>x<neon-tooltip>y</neon-tooltip></button>`);
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        expect(tip.classList.contains('-top')).toBe(true);
        tip.setAttribute('placement', 'bottom');
        await tick();
        expect(tip.classList.contains('-bottom')).toBe(true);
        expect(tip.classList.contains('-top')).toBe(false);
    });

    it('extends consumer-set aria-describedby and restores it on disconnect', () => {
        document.body.innerHTML = `
            <p id="external-first">First external description.</p>
            <p id="external-second">Second external description.</p>
            <button aria-describedby="external-first external-second">x<neon-tooltip>y</neon-tooltip></button>
        `;
        const btn = /** @type {HTMLButtonElement} */ (document.querySelector('button'));
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        expect(btn.getAttribute('aria-describedby'))
            .toBe(`external-first external-second ${tip.id}`);

        tip.remove();
        expect(btn.getAttribute('aria-describedby')).toBe('external-first external-second');
    });

    it('toggles on click for any parent with trigger="click"', () => {
        const span = mount(
            `<span tabindex="0">x<neon-tooltip trigger="click">y</neon-tooltip></span>`,
        );
        const tip = /** @type {HTMLElement} */ (span.querySelector('neon-tooltip'));
        expect(span.hasAttribute('popovertarget')).toBe(false);

        span.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(tip.matches(':popover-open')).toBe(true);

        span.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(tip.matches(':popover-open')).toBe(false);
    });

    it('ignores non-Escape keys while the tooltip is open', () => {
        const btn = mount(
            `<button>x<neon-tooltip trigger="">y</neon-tooltip></button>`,
        );
        const tip = /** @type {any} */ (btn.querySelector('neon-tooltip'));

        tip.showPopover();
        expect(tip.matches(':popover-open')).toBe(true);

        btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(tip.matches(':popover-open')).toBe(true);

        tip.hidePopover();
        expect(tip.matches(':popover-open')).toBe(false);
    });

    it('ignores trigger show and hide events that match the current popover state', () => {
        const btn = mount(`<button>x<neon-tooltip>y</neon-tooltip></button>`);
        const tip = /** @type {any} */ (btn.querySelector('neon-tooltip'));

        tip.showPopover();
        btn.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        expect(tip.matches(':popover-open')).toBe(true);

        tip.hidePopover();
        btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(tip.matches(':popover-open')).toBe(false);
    });

    it('opens and closes on hover delays', () => {
        vi.useFakeTimers();
        const btn = mount(`<button>x<neon-tooltip>y</neon-tooltip></button>`);
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));

        btn.dispatchEvent(new Event('pointerenter'));
        expect(tip.matches(':popover-open')).toBe(false);
        vi.advanceTimersByTime(120);
        expect(tip.matches(':popover-open')).toBe(true);

        btn.dispatchEvent(new Event('pointerleave'));
        vi.advanceTimersByTime(100);
        expect(tip.matches(':popover-open')).toBe(false);
    });

    it('does not re-open from a delayed hover show when already open', () => {
        vi.useFakeTimers();
        const btn = mount(`<button>x<neon-tooltip>y</neon-tooltip></button>`);
        const tip = /** @type {any} */ (btn.querySelector('neon-tooltip'));

        tip.showPopover();
        btn.dispatchEvent(new Event('pointerenter'));
        vi.advanceTimersByTime(120);
        expect(tip.matches(':popover-open')).toBe(true);
    });

    it('cancels a delayed hover close when the tooltip is entered', () => {
        vi.useFakeTimers();
        const btn = mount(`<button>x<neon-tooltip>y</neon-tooltip></button>`);
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));

        /** @type {any} */ (tip).showPopover();
        btn.dispatchEvent(new Event('pointerleave'));
        tip.dispatchEvent(new Event('pointerenter'));
        vi.advanceTimersByTime(100);
        expect(tip.matches(':popover-open')).toBe(true);
    });

    it('does not hide on delayed hover close when already closed', () => {
        vi.useFakeTimers();
        const btn = mount(`<button>x<neon-tooltip>y</neon-tooltip></button>`);
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));

        btn.dispatchEvent(new Event('pointerleave'));
        vi.advanceTimersByTime(100);
        expect(tip.matches(':popover-open')).toBe(false);
    });

    it('keeps focus-triggered tooltip open while focus remains on the trigger', () => {
        vi.useFakeTimers();
        const btn = mount(`<button>x<neon-tooltip>y</neon-tooltip></button>`);
        const tip = /** @type {any} */ (btn.querySelector('neon-tooltip'));

        tip.showPopover();
        btn.focus();
        btn.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        vi.advanceTimersByTime(100);
        expect(tip.matches(':popover-open')).toBe(true);
    });

    it('keeps focus-triggered tooltip open while focus remains on an open shadow root trigger', () => {
        vi.useFakeTimers();
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = '<button>x<neon-tooltip>y</neon-tooltip></button>';
        document.body.appendChild(host);
        const btn = /** @type {HTMLButtonElement} */ (shadow.querySelector('button'));
        const tip = /** @type {any} */ (shadow.querySelector('neon-tooltip'));

        tip.showPopover();
        btn.focus();
        expect(document.activeElement).toBe(host);
        expect(shadow.activeElement).toBe(btn);

        btn.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        vi.advanceTimersByTime(100);
        expect(tip.matches(':popover-open')).toBe(true);
    });

    it('logs a development hint for focus trigger on non-focusable parents', () => {
        const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const span = mount(`<span>x<neon-tooltip>y</neon-tooltip></span>`);

        expect(debug).toHaveBeenCalledWith(
            'Tooltip: parent element is not focusable; the `focus` trigger will not fire.',
            span,
        );
    });

    it('closes on Escape from the trigger', () => {
        const span = mount(
            `<span tabindex="0">x<neon-tooltip trigger="click">y</neon-tooltip></span>`,
        );
        const tip = /** @type {HTMLElement} */ (span.querySelector('neon-tooltip'));

        span.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(tip.matches(':popover-open')).toBe(true);

        span.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(tip.matches(':popover-open')).toBe(false);
    });

    it('exposes the native manual popover API', () => {
        const btn = mount(
            `<button>x<neon-tooltip trigger="">y</neon-tooltip></button>`,
        );
        const tip = /** @type {any} */ (btn.querySelector('neon-tooltip'));
        expect(btn.hasAttribute('popovertarget')).toBe(false);
        tip.showPopover();
        expect(tip.matches(':popover-open')).toBe(true);
        tip.hidePopover();
        expect(tip.matches(':popover-open')).toBe(false);
    });

    it('closes on Escape when opened programmatically', () => {
        const btn = mount(
            `<button>x<neon-tooltip trigger="">y</neon-tooltip></button>`,
        );
        const tip = /** @type {any} */ (btn.querySelector('neon-tooltip'));

        tip.showPopover();
        expect(tip.matches(':popover-open')).toBe(true);

        btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(tip.matches(':popover-open')).toBe(false);
    });
});
