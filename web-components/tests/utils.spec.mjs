import { describe, expect, it } from 'vitest';

import { FOCUSABLE_PROGRAMMATIC, generateId, isFocusable } from '../src/utils.js';

/**
 * @param {string} html
 * @returns {Element}
 */
function elementFromHtml(html) {
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    return /** @type {Element} */ (wrap.firstElementChild);
}

describe('generateId()', () => {
    it('adds a short random suffix to a descriptive prefix', () => {
        expect(generateId('neon-tooltip')).toMatch(/^neon-tooltip-[a-z0-9]{9}$/);
    });
});

describe('isFocusable()', () => {
    it('accepts elements with a keyboard-reachable tabindex', () => {
        expect(isFocusable(elementFromHtml('<div tabindex="0"></div>'))).toBe(true);
        expect(isFocusable(elementFromHtml('<div tabindex="-1"></div>'))).toBe(false);
    });

    it('accepts tabindex="-1" when programmatic focus is allowed', () => {
        expect(isFocusable(elementFromHtml('<div tabindex="0"></div>'), FOCUSABLE_PROGRAMMATIC)).toBe(true);
        expect(isFocusable(elementFromHtml('<div tabindex="-1"></div>'), FOCUSABLE_PROGRAMMATIC)).toBe(true);
        expect(isFocusable(elementFromHtml('<button tabindex="-1">Save</button>'), FOCUSABLE_PROGRAMMATIC)).toBe(true);
    });

    it('rejects elements inside inert subtrees', () => {
        const wrap = document.createElement('div');
        wrap.innerHTML = '<section inert><button>Save</button></section>';
        const button = /** @type {Element} */ (wrap.querySelector('button'));

        expect(isFocusable(button)).toBe(false);
    });

    it('rejects disabled form controls even when they normally match focusable selectors', () => {
        expect(isFocusable(elementFromHtml('<button disabled>Save</button>'))).toBe(false);
        expect(isFocusable(elementFromHtml('<input disabled>'))).toBe(false);
    });

    it('rejects hidden inputs', () => {
        expect(isFocusable(elementFromHtml('<input type="hidden">'))).toBe(false);
        expect(isFocusable(elementFromHtml('<input type="HIDDEN">'))).toBe(false);
    });

    it('accepts native interactive elements', () => {
        expect(isFocusable(elementFromHtml('<button>Save</button>'))).toBe(true);
        expect(isFocusable(elementFromHtml('<a href="#x">Link</a>'))).toBe(true);
        expect(isFocusable(elementFromHtml('<area href="#x" alt="Map area">'))).toBe(true);
        expect(isFocusable(elementFromHtml('<input>'))).toBe(true);
        expect(isFocusable(elementFromHtml('<select><option>x</option></select>'))).toBe(true);
        expect(isFocusable(elementFromHtml('<textarea></textarea>'))).toBe(true);
        expect(isFocusable(elementFromHtml('<summary>Details</summary>'))).toBe(true);
        expect(isFocusable(elementFromHtml('<iframe title="Preview"></iframe>'))).toBe(true);
        expect(isFocusable(elementFromHtml('<audio controls></audio>'))).toBe(true);
        expect(isFocusable(elementFromHtml('<video controls></video>'))).toBe(true);
    });

    it('accepts editable elements with supported contenteditable values', () => {
        expect(isFocusable(elementFromHtml('<div contenteditable=""></div>'))).toBe(true);
        expect(isFocusable(elementFromHtml('<div contenteditable="true"></div>'))).toBe(true);
    });

    it('rejects plain and non-focusable elements', () => {
        expect(isFocusable(elementFromHtml('<div></div>'))).toBe(false);
        expect(isFocusable(elementFromHtml('<a>Missing href</a>'))).toBe(false);
        expect(isFocusable(elementFromHtml('<area alt="Missing href">'))).toBe(false);
        expect(isFocusable(elementFromHtml('<audio></audio>'))).toBe(false);
        expect(isFocusable(elementFromHtml('<video></video>'))).toBe(false);
        expect(isFocusable(elementFromHtml('<div contenteditable="false"></div>'))).toBe(false);
    });
});
