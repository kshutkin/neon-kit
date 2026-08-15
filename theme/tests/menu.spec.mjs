import { afterEach, describe, expect, it } from 'vitest';

import menuCss from '../components/menu.css?inline';

/**
 * @param {Element} element
 * @param {string} expectedText
 * @returns {DOMRect}
 */
function getTextRect(element, expectedText) {
    const textNodes = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let textNode = textNodes.nextNode();
    while (textNode !== null && textNode.textContent?.trim() !== expectedText) {
        textNode = textNodes.nextNode();
    }
    expect(textNode).not.toBeNull();
    const range = document.createRange();
    range.selectNodeContents(/** @type {Node} */ (textNode));
    return range.getBoundingClientRect();
}

function mountMenu() {
    const style = document.createElement('style');
    style.dataset.menuTestStyles = '';
    style.textContent = menuCss;
    document.head.appendChild(style);
    document.body.innerHTML = `
        <div class="menu" style="width: 20rem;">
            <div class="menu__group">
                <button class="menu__item" id="wrapped" type="button">
                    <svg class="menu__icon" viewBox="0 0 24 24" aria-hidden="true"></svg>
                    <span class="menu__label">Wrapped label</span>
                    <span class="menu__shortcut">⌘W</span>
                </button>
                <button class="menu__item" id="raw-icon" type="button">
                    <svg class="menu__icon" viewBox="0 0 24 24" aria-hidden="true"></svg>
                    Raw icon label
                    <span class="menu__shortcut">⌘I</span>
                </button>
                <button class="menu__item" id="raw-shortcut" type="button">
                    Raw shortcut label
                    <span class="menu__shortcut">⌘S</span>
                </button>
                <button class="menu__item" id="raw-plain" type="button">
                    Raw plain label
                </button>
                <button class="menu__item" type="button">
                    <strong id="element-label">Element label</strong>
                </button>
                <button class="menu__item" id="long-label" type="button" style="overflow-wrap: anywhere;">
                    Averylongunbrokenmenulabelthatmustnotexpandthemiddletrack
                    <span class="menu__shortcut">⌘L</span>
                </button>
            </div>
        </div>
    `;
}

describe('menu layout', () => {
    afterEach(() => {
        document.head.querySelector('[data-menu-test-styles]')?.remove();
        document.body.innerHTML = '';
    });

    it('aligns wrapped, raw text, and single-element labels in the middle column', () => {
        mountMenu();

        const wrappedLabel = /** @type {HTMLElement} */ (
            document.querySelector('.menu__label')
        );
        const labelInlineStart = wrappedLabel.getBoundingClientRect().left;

        expect(getTextRect(document.querySelector('#raw-icon'), 'Raw icon label').left)
            .toBe(labelInlineStart);
        expect(getTextRect(document.querySelector('#raw-shortcut'), 'Raw shortcut label').left)
            .toBe(labelInlineStart);
        expect(getTextRect(document.querySelector('#raw-plain'), 'Raw plain label').left)
            .toBe(labelInlineStart);
        expect(document.querySelector('#element-label').getBoundingClientRect().left)
            .toBe(labelInlineStart);
    });

    it('aligns wrapped and raw labels from the inline start in RTL', () => {
        mountMenu();
        const menu = /** @type {HTMLElement} */ (document.querySelector('.menu'));
        menu.dir = 'rtl';
        const wrappedLabel = /** @type {HTMLElement} */ (
            document.querySelector('.menu__label')
        );
        const labelInlineStart = wrappedLabel.getBoundingClientRect().right;

        expect(getTextRect(document.querySelector('#raw-icon'), 'Raw icon label').right)
            .toBe(labelInlineStart);
        expect(getTextRect(document.querySelector('#raw-shortcut'), 'Raw shortcut label').right)
            .toBe(labelInlineStart);
        expect(getTextRect(document.querySelector('#raw-plain'), 'Raw plain label').right)
            .toBe(labelInlineStart);
    });

    it('keeps an unwrapped long label inside a constrained menu', () => {
        mountMenu();
        const menu = /** @type {HTMLElement} */ (document.querySelector('.menu'));

        expect(menu.scrollWidth).toBe(menu.clientWidth);
    });
});
