import * as styles from '@neon-kit/theme/components/combobox.module.css?neon';
import { queryInternal, queryAllInternal, styleClass, hasStyleClasses, activeElement } from './style-queries.mjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import '../src/combobox.jsx';

/**
 * Wait one microtask. `@slimlib/store` effects flush on a microtask,
 * so any assertion that observes DOM/state produced by an effect must
 * follow at least one `await tick()` after the public write that
 * triggered it. (Some tests need two ticks because the reflection
 * cascade — prop -> attribute -> middleware -> setter — spans two
 * scheduler turns.)
 */
const tick = () => Promise.resolve();

/**
 * @template {Element} [T=HTMLElement]
 * @param {string} html
 * @returns {T}
 */
function mount(html) {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    return /** @type {T} */ (/** @type {unknown} */ (host.firstElementChild));
}

/** @returns {Promise<void>} */
function nextFrame() {
    return new Promise((r) => requestAnimationFrame(() => r()));
}

const COUNTRIES = `
    <option value="us">United States</option>
    <option value="uk">United Kingdom</option>
    <option value="de">Germany</option>
    <option value="fr">France</option>
    <option value="es">Spain</option>
    <option value="it">Italy</option>
`;

describe('<neon-combobox>', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('registers as a custom element', () => {
        expect(customElements.get('neon-combobox')).toBeTruthy();
    });

    it('renders field + popover + option rows from <option> children', () => {
        const cb = mount(`<neon-combobox placeholder="Pick…">${COUNTRIES}</neon-combobox>`);
        expect(hasStyleClasses(cb.shadowRoot.firstElementChild, styleClass(styles, 'combobox'))).toBe(true);
        const field = queryInternal(cb, '.combobox__field', styles);
        const popover = queryInternal(cb, '.combobox__popover', styles);
        const list = queryInternal(cb, '.combobox__list', styles);
        const rows = queryAllInternal(cb, '.combobox__option', styles);
        expect(field).toBeTruthy();
        expect(popover).toBeTruthy();
        expect(list?.getAttribute('role')).toBe('listbox');
        expect(rows.length).toBe(6);
        // Original <option>s hidden.
        for (const opt of queryAllInternal(cb, ':scope > option', styles)) {
            expect(/** @type {HTMLElement} */ (opt).style.display).toBe('none');
        }
        const placeholder = queryInternal(cb, '.combobox__placeholder', styles);
        expect(placeholder?.textContent).toBe('Pick…');
    });

    it('clicking the field opens the popover; Escape closes', async () => {
        const cb = mount(`<neon-combobox>${COUNTRIES}</neon-combobox>`);
        const field = /** @type {HTMLButtonElement} */ (queryInternal(cb, '.combobox__field', styles));
        const popover = /** @type {HTMLElement} */ (queryInternal(cb, '.combobox__popover', styles));
        field.click();
        await nextFrame();
        expect(popover.matches(':popover-open')).toBe(true);
        const search = /** @type {HTMLInputElement} */ (queryInternal(cb, '.combobox__search input', styles));
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await nextFrame();
        expect(popover.matches(':popover-open')).toBe(false);
    });

    it('typing in the search input filters options', async () => {
        const cb = mount(`<neon-combobox>${COUNTRIES}</neon-combobox>`);
        /** @type {HTMLButtonElement} */ (queryInternal(cb, '.combobox__field', styles)).click();
        await nextFrame();
        const search = /** @type {HTMLInputElement} */ (queryInternal(cb, '.combobox__search input', styles));
        search.value = 'unit';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        const visible = Array.from(queryAllInternal(cb, '.combobox__option', styles)).map((r) => r.textContent);
        expect(visible).toEqual(['United States', 'United Kingdom']);
    });

    it('ArrowDown / ArrowUp cycle through visible options and update aria-activedescendant', async () => {
        const cb = mount(`<neon-combobox>${COUNTRIES}</neon-combobox>`);
        /** @type {HTMLButtonElement} */ (queryInternal(cb, '.combobox__field', styles)).click();
        await nextFrame();
        const search = /** @type {HTMLInputElement} */ (queryInternal(cb, '.combobox__search input', styles));
        // After open, first row is highlighted.
        const firstId = search.getAttribute('aria-activedescendant');
        expect(firstId).toBeTruthy();
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        const secondId = search.getAttribute('aria-activedescendant');
        expect(secondId).toBeTruthy();
        expect(secondId).not.toBe(firstId);
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
        expect(search.getAttribute('aria-activedescendant')).toBe(firstId);
    });

    it('Enter selects the highlighted option, sets value, closes popover and dispatches change once', async () => {
        const cb = mount(`<neon-combobox>${COUNTRIES}</neon-combobox>`);
        let changes = 0;
        let detail = null;
        cb.addEventListener('change', (e) => {
            changes++;
            detail = /** @type {CustomEvent} */ (e).detail;
        });
        const field = /** @type {HTMLButtonElement} */ (queryInternal(cb, '.combobox__field', styles));
        field.click();
        await nextFrame();
        const search = /** @type {HTMLInputElement} */ (queryInternal(cb, '.combobox__search input', styles));
        await expect.poll(() => search.getAttribute('aria-activedescendant'))
            .toBe(queryAllInternal(cb, '.combobox__option', styles)[0].id);
        // First row is United States. Move once to United Kingdom.
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await tick();
        await tick();
        expect(changes).toBe(1);
        expect(detail).toEqual({ value: 'uk', option: queryInternal(cb, 'option[value="uk"]', styles) });
        expect(/** @type {any} */ (cb).value).toBe('uk');
        const popover = /** @type {HTMLElement} */ (queryInternal(cb, '.combobox__popover', styles));
        expect(popover.matches(':popover-open')).toBe(false);
        expect(queryInternal(cb, '.combobox__value', styles)?.textContent).toBe('United Kingdom');
    });

    it('clicking an option selects it', async () => {
        const cb = mount(`<neon-combobox>${COUNTRIES}</neon-combobox>`);
        let changes = 0;
        cb.addEventListener('change', () => changes++);
        /** @type {HTMLButtonElement} */ (queryInternal(cb, '.combobox__field', styles)).click();
        await nextFrame();
        const rows = queryAllInternal(cb, '.combobox__option', styles);
        /** @type {HTMLButtonElement} */ (rows[2]).click();
        await tick();
        await tick();
        expect(/** @type {any} */ (cb).value).toBe('de');
        expect(changes).toBe(1);
    });

    it('programmatic value setter updates display but does NOT dispatch change', async () => {
        const cb = mount(`<neon-combobox>${COUNTRIES}</neon-combobox>`);
        let changes = 0;
        cb.addEventListener('change', () => changes++);
        /** @type {any} */ (cb).value = 'fr';
        await tick();
        await tick();
        expect(/** @type {any} */ (cb).value).toBe('fr');
        expect(queryInternal(cb, '.combobox__value', styles)?.textContent).toBe('France');
        expect(changes).toBe(0);
    });

    it('reflects empty name property as an empty attribute', async () => {
        const cb = mount(`<neon-combobox>${COUNTRIES}</neon-combobox>`);
        /** @type {any} */ (cb).name = 'country';
        await tick();
        expect(cb.getAttribute('name')).toBe('country');

        /** @type {any} */ (cb).name = '';
        await tick();
        expect(cb.getAttribute('name')).toBe('');
    });

    it('setting an unknown value is a no-op (matches native <select>)', async () => {
        const cb = mount(`<neon-combobox value="us">${COUNTRIES}</neon-combobox>`);
        /** @type {any} */ (cb).value = 'zz';
        await tick();
        await tick();
        expect(/** @type {any} */ (cb).value).toBe('us');
        expect(queryInternal(cb, '.combobox__value', styles)?.textContent).toBe('United States');
    });

    it('participates in form submission via ElementInternals', async () => {
        const wrapper = mount(`
            <form>
                <neon-combobox name="country" value="de">${COUNTRIES}</neon-combobox>
            </form>
        `);
        const form = /** @type {HTMLFormElement} */ (wrapper);
        await tick();
        await tick();
        const data = new FormData(form);
        expect(data.get('country')).toBe('de');
    });

    it('required + empty value → checkValidity() returns false', async () => {
        const wrapper = mount(`
            <form>
                <neon-combobox name="country" required>${COUNTRIES}</neon-combobox>
            </form>
        `);
        const cb = /** @type {any} */ (queryInternal(wrapper, 'neon-combobox', styles));
        expect(cb.checkValidity()).toBe(false);
        cb.value = 'us';
        await tick();
        await tick();
        expect(cb.checkValidity()).toBe(true);
    });

    it('form.reset() restores the initial value', async () => {
        const wrapper = mount(`
            <form>
                <neon-combobox name="country" value="de">${COUNTRIES}</neon-combobox>
            </form>
        `);
        const form = /** @type {HTMLFormElement} */ (wrapper);
        const cb = /** @type {any} */ (queryInternal(wrapper, 'neon-combobox', styles));
        cb.value = 'fr';
        await tick();
        await tick();
        expect(cb.value).toBe('fr');
        form.reset();
        await tick();
        await tick();
        expect(cb.value).toBe('de');
    });

    it('clear button clears value and dispatches change', async () => {
        const cb = mount(`<neon-combobox value="us" data-clearable>${COUNTRIES}</neon-combobox>`);
        let changes = 0;
        cb.addEventListener('change', () => changes++);
        const clear = /** @type {HTMLButtonElement} */ (queryInternal(cb, '.combobox__clear', styles));
        expect(clear.style.display).not.toBe('none');
        clear.click();
        await tick();
        await tick();
        expect(/** @type {any} */ (cb).value).toBe('');
        expect(changes).toBe(1);
        expect(clear.style.display).toBe('none');
    });

    it('input event fires while user types in the search field', async () => {
        const cb = mount(`<neon-combobox>${COUNTRIES}</neon-combobox>`);
        /** @type {HTMLButtonElement} */ (queryInternal(cb, '.combobox__field', styles)).click();
        await nextFrame();
        let detail = null;
        cb.addEventListener('input', (e) => {
            detail = /** @type {CustomEvent} */ (e).detail;
        });
        const search = /** @type {HTMLInputElement} */ (queryInternal(cb, '.combobox__search input', styles));
        search.value = 'fr';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        expect(detail).toEqual({ query: 'fr' });
    });
});
