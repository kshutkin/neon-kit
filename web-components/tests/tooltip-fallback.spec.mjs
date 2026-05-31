import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Side-effect import registers `<neon-tooltip>`.
import '../src/tooltip.jsx';

// Tooltip fallback tests need real anchor positioning + CSS flip rules.
// Make sure a stylesheet that wires `position-area`,
// `position-try-fallbacks` and the `.tooltip` class is loaded once. We
// inline a Tailwind-free subset because the shipped CSS uses `@apply`
// and `--spacing()` which the browser will not parse on its own.
async function ensureThemeLoaded() {
    if (document.querySelector('style[data-neon-tooltip-theme]')) return;
    const style = document.createElement('style');
    style.dataset.neonTooltipTheme = '';
    style.textContent = `
        @position-try --tooltip-flip-bottom {
            position-area: bottom;
            margin-block: 8px;
            margin-inline: 0;
        }
        @position-try --tooltip-flip-top {
            position-area: top;
            margin-block: 8px;
            margin-inline: 0;
        }
        @position-try --tooltip-flip-right {
            position-area: right;
            margin-inline: 8px;
            margin-block: 0;
        }
        @position-try --tooltip-flip-left {
            position-area: left;
            margin-inline: 8px;
            margin-block: 0;
        }
        .tooltip[popover] {
            position: absolute;
            margin: 0;
            inset: auto;
            inline-size: max-content;
            max-inline-size: 18rem;
            padding: 4px 8px;
            opacity: 1;
        }
        .tooltip[popover].-top {
            position-area: top;
            margin-block: 8px;
            position-try-fallbacks: --tooltip-flip-bottom;
        }
        .tooltip[popover].-bottom {
            position-area: bottom;
            margin-block: 8px;
            margin-inline: 0;
            position-try-fallbacks: --tooltip-flip-top;
        }
        .tooltip[popover].-left {
            position-area: left;
            margin-inline: 8px;
            margin-block: 0;
            position-try-fallbacks: --tooltip-flip-right;
        }
        .tooltip[popover].-right {
            position-area: right;
            margin-inline: 8px;
            margin-block: 0;
            position-try-fallbacks: --tooltip-flip-left;
        }
    `;
    document.head.appendChild(style);
}

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
    beforeEach(async () => {
        document.body.innerHTML = '';
        await ensureThemeLoaded();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it.skipIf(!supportsNamedTry)('flips to right when there is no room on the left', async () => {
        const btn = mount(
            `<button>x<neon-tooltip data-placement="left">Hint with some text content.</neon-tooltip></button>`,
            { position: 'fixed', left: '0px', top: '200px' },
        );
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        /** @type {any} */ (tip).showTooltip();
        await nextFrame();
        await nextFrame();
        expect(tip.matches(':popover-open')).toBe(true);
        // Class stays `.-left`; CSS flips the rendered position via
        // the `--tooltip-flip-right` named try-block.
        const popRect = tip.getBoundingClientRect();
        const triggerRect = btn.getBoundingClientRect();
        expect(popRect.left).toBeGreaterThanOrEqual(triggerRect.right);
    });

    it.skipIf(!supportsNamedTry)('flips to bottom when there is no room on top', async () => {
        const btn = mount(
            `<button>x<neon-tooltip data-placement="top">Hint with some text content.</neon-tooltip></button>`,
            { position: 'fixed', left: '200px', top: '0px' },
        );
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        /** @type {any} */ (tip).showTooltip();
        await nextFrame();
        await nextFrame();
        expect(tip.matches(':popover-open')).toBe(true);
        const popRect = tip.getBoundingClientRect();
        const triggerRect = btn.getBoundingClientRect();
        expect(popRect.top).toBeGreaterThanOrEqual(triggerRect.bottom);
    });

    it('keeps top placement when there is room on top', async () => {
        const btn = mount(
            `<button>x<neon-tooltip data-placement="top">Hint.</neon-tooltip></button>`,
            { position: 'fixed', left: '200px', top: '300px' },
        );
        const tip = /** @type {HTMLElement} */ (btn.querySelector('neon-tooltip'));
        /** @type {any} */ (tip).showTooltip();
        await nextFrame();
        await nextFrame();
        expect(tip.matches(':popover-open')).toBe(true);
        const popRect = tip.getBoundingClientRect();
        const triggerRect = btn.getBoundingClientRect();
        expect(popRect.bottom).toBeLessThanOrEqual(triggerRect.top);
    });
});
