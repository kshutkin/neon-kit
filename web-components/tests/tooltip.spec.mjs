import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
        expect(tip.id).toMatch(/^neon-tooltip-\d+$/);
        expect(btn.getAttribute('aria-describedby')).toBe(tip.id);
        expect(tip.querySelector('.tooltip__arrow')).not.toBeNull();
        expect(tip.getAttribute('role')).toBeNull();
    });

    it('respects the placement attribute', () => {
        const btn = mount(
            `<button>x<neon-tooltip placement="right">y</neon-tooltip></button>`,
        );
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        expect(tip.classList.contains('-right')).toBe(true);
        expect(tip.classList.contains('-top')).toBe(false);
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

    it('updates placement when the attribute changes', async () => {
        const btn = mount(`<button>x<neon-tooltip>y</neon-tooltip></button>`);
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        expect(tip.classList.contains('-top')).toBe(true);
        tip.setAttribute('placement', 'bottom');
        await tick();
        expect(tip.classList.contains('-bottom')).toBe(true);
        expect(tip.classList.contains('-top')).toBe(false);
    });

    it('does not overwrite consumer-set aria-describedby', () => {
        document.body.innerHTML = `
            <p id="external">External description.</p>
            <button aria-describedby="external">x<neon-tooltip>y</neon-tooltip></button>
        `;
        const btn = /** @type {HTMLButtonElement} */ (document.querySelector('button'));
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        expect(btn.getAttribute('aria-describedby')).toBe('external');

        tip.remove();
        // We did not own that attribute, so it stays put.
        expect(btn.getAttribute('aria-describedby')).toBe('external');
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

    it('hideTooltip() closes the popover synchronously', () => {
        const btn = mount(
            `<button>x<neon-tooltip trigger="">y</neon-tooltip></button>`,
        );
        const tip = /** @type {any} */ (btn.querySelector('neon-tooltip'));
        expect(btn.hasAttribute('popovertarget')).toBe(false);
        tip.showPopover();
        expect(tip.matches(':popover-open')).toBe(true);
        tip.hideTooltip();
        expect(tip.matches(':popover-open')).toBe(false);
    });

    it('closes on Escape when opened programmatically', () => {
        const btn = mount(
            `<button>x<neon-tooltip trigger="">y</neon-tooltip></button>`,
        );
        const tip = /** @type {any} */ (btn.querySelector('neon-tooltip'));

        tip.showTooltip();
        expect(tip.matches(':popover-open')).toBe(true);

        btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(tip.matches(':popover-open')).toBe(false);
    });
});
