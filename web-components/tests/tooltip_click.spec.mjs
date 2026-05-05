import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/tooltip.js';

function mount(html) {
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    const root = wrap.firstElementChild;
    document.body.appendChild(root);
    return root;
}

describe('tooltip click trigger', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('toggles on click when not a button', async () => {
        const link = mount(`<a href="#x">help<neon-tooltip data-trigger="click">Hint.</neon-tooltip></a>`);
        const tip = link.querySelector('neon-tooltip');
        
        // Mock matches to simulate hover state when clicked by mouse
        link.matches = (selector) => selector === ':hover';
        
        // Click to open
        link.dispatchEvent(new Event('click'));
        await new Promise(r => setTimeout(r, 10)); // wait 0ms timer
        expect(tip.matches(':popover-open')).toBe(true);
        
        // Click to close
        link.dispatchEvent(new Event('click'));
        await new Promise(r => setTimeout(r, 10));
        // It failed to close because of the activeElement/hover traps!
        expect(tip.matches(':popover-open')).toBe(false); 
    });
});
