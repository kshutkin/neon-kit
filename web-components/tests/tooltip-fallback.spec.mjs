import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Side-effect import registers `<neon-tooltip>`.
import '../src/tooltip.jsx';

// Use the component's adopted sheets to validate real host anchor positioning.


/**
 * @param {string} html
 * @param {Partial<CSSStyleDeclaration>} [style]
 * @returns {HTMLElement}
 */
function mount(html, style) {
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    const root = /** @type {HTMLElement} */ (wrap.firstElementChild);
    if (style) Object.assign(root.style, style);
    document.body.appendChild(root);
    return root;
}

function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

// Named `@position-try` requires Chrome 125+. Soft-skip the flip
// assertions if the runner is older — the non-flipping case below
// still exercises the basic placement path.
const supportsNamedTry = typeof CSS !== 'undefined'
    && CSS.supports('position-try-fallbacks: --x');

describe('<neon-tooltip> placement fallback', () => {
    let documentReset;

    beforeEach(() => {
        document.body.innerHTML = '';
        documentReset = document.createElement('style');
        documentReset.textContent = '* { margin: 0; }';
        document.head.append(documentReset);
    });

    afterEach(() => {
        documentReset.remove();
        document.body.innerHTML = '';
        document.body.style.minHeight = '';
        window.scrollTo(0, 0);
    });

    it.skipIf(!supportsNamedTry)('flips to right when there is no room on the left', async () => {
        const btn = mount(
            `<button>x<neon-tooltip placement="left">Hint with some text content.</neon-tooltip></button>`,
            { position: 'fixed', left: '0px', top: '200px' },
        );
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        /** @type {any} */ (tip).showPopover();
        await nextFrame();
        await nextFrame();
        expect(tip.matches(':popover-open')).toBe(true);
        // Class stays `.-left`; CSS flips the rendered position via
        // the `--tooltip-flip-right` named try-block.
        const popRect = tip.getBoundingClientRect();
        const triggerRect = btn.getBoundingClientRect();
        expect(popRect.left).toBeGreaterThanOrEqual(triggerRect.right);
        await expect.poll(() => tip.getBoundingClientRect().left - btn.getBoundingClientRect().right).toBeCloseTo(8, 1);
    });

    it.skipIf(!supportsNamedTry)('flips to bottom when there is no room on top', async () => {
        const btn = mount(
            `<button>x<neon-tooltip placement="top">Hint with some text content.</neon-tooltip></button>`,
            { position: 'fixed', left: '200px', top: '0px' },
        );
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        /** @type {any} */ (tip).showPopover();
        await nextFrame();
        await nextFrame();
        expect(tip.matches(':popover-open')).toBe(true);
        const popRect = tip.getBoundingClientRect();
        const triggerRect = btn.getBoundingClientRect();
        expect(popRect.top).toBeGreaterThanOrEqual(triggerRect.bottom);
        await expect.poll(() => tip.getBoundingClientRect().top - btn.getBoundingClientRect().bottom).toBeCloseTo(8, 1);
    });

    it('keeps top placement under a fixed-position trigger', async () => {
        const btn = mount(
            `<button>x<neon-tooltip placement="top">Hint.</neon-tooltip></button>`,
            { position: 'fixed', left: '200px', top: '300px' },
        );
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        /** @type {any} */ (tip).showPopover();
        await nextFrame();
        await nextFrame();
        expect(tip.matches(':popover-open')).toBe(true);
        const popRect = tip.getBoundingClientRect();
        const triggerRect = btn.getBoundingClientRect();
        expect(popRect.bottom).toBeLessThanOrEqual(triggerRect.top);
    });
    it('anchors to a trigger after the document scrolls', async () => {
        document.body.style.minHeight = '1800px';
        const trigger = mount('<button>x<neon-tooltip>Hint.</neon-tooltip></button>', {
            position: 'absolute', left: '200px', top: '1000px',
        });
        window.scrollTo(0, 700);
        const tooltip = trigger.querySelector('neon-tooltip');
        tooltip.showPopover();
        await expect.poll(() => {
            const anchor = trigger.getBoundingClientRect();
            const popover = tooltip.getBoundingClientRect();
            return Math.abs(popover.bottom + 8 - anchor.top);
        }).toBeLessThan(1);
    });

    for (const placement of ['top', 'right', 'bottom', 'left']) {
        it(`preserves the ${placement} anchor gap under a document margin reset`, async () => {
            const trigger = mount(`<button>Anchor<neon-tooltip placement="${placement}">Tooltip</neon-tooltip></button>`, {
                position: 'fixed', left: '200px', top: '300px',
            });
            const tooltip = trigger.querySelector('neon-tooltip');
            tooltip.showPopover();
            const gap = () => {
                const anchor = trigger.getBoundingClientRect();
                const bubble = tooltip.getBoundingClientRect();
                return {
                    top: anchor.top - bubble.bottom,
                    right: bubble.left - anchor.right,
                    bottom: bubble.top - anchor.bottom,
                    left: anchor.left - bubble.right,
                }[placement];
            };
            await expect.poll(gap).toBeCloseTo(8, 1);
            tooltip.style.setProperty('--neon-spacing', '0.5rem');
            await expect.poll(gap).toBeCloseTo(16, 1);
        });
    }

});
