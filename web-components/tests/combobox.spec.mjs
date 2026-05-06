import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import '../src/combobox.js';

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
        expect(cb.classList.contains('combobox')).toBe(true);
        const field = cb.querySelector('.combobox__field');
        const popover = cb.querySelector('.combobox__popover');
        const list = cb.querySelector('.combobox__list');
        const rows = cb.querySelectorAll('.combobox__option');
        expect(field).toBeTruthy();
        expect(popover).toBeTruthy();
        expect(list?.getAttribute('role')).toBe('listbox');
        expect(rows.length).toBe(6);
        // Original <option>s hidden.
        for (const opt of cb.querySelectorAll(':scope > option')) {
            expect(/** @type {HTMLElement} */ (opt).style.display).toBe('none');
        }
        const placeholder = cb.querySelector('.combobox__placeholder');
        expect(placeholder?.textContent).toBe('Pick…');
    });

    it('clicking the field opens the popover; Escape closes', async () => {
        const cb = mount(`<neon-combobox>${COUNTRIES}</neon-combobox>`);
        const field = /** @type {HTMLButtonElement} */ (cb.querySelector('.combobox__field'));
        const popover = /** @type {HTMLElement} */ (cb.querySelector('.combobox__popover'));
        field.click();
        await nextFrame();
        expect(popover.matches(':popover-open')).toBe(true);
        const search = /** @type {HTMLInputElement} */ (cb.querySelector('.combobox__search input'));
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await nextFrame();
        expect(popover.matches(':popover-open')).toBe(false);
    });

    it('typing in the search input filters options', async () => {
        const cb = mount(`<neon-combobox>${COUNTRIES}</neon-combobox>`);
        /** @type {HTMLButtonElement} */ (cb.querySelector('.combobox__field')).click();
        await nextFrame();
        const search = /** @type {HTMLInputElement} */ (cb.querySelector('.combobox__search input'));
        search.value = 'unit';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        const visible = Array.from(cb.querySelectorAll('.combobox__option')).map((r) => r.textContent);
        expect(visible).toEqual(['United States', 'United Kingdom']);
    });

    it('ArrowDown / ArrowUp cycle through visible options and update aria-activedescendant', async () => {
        const cb = mount(`<neon-combobox>${COUNTRIES}</neon-combobox>`);
        /** @type {HTMLButtonElement} */ (cb.querySelector('.combobox__field')).click();
        await nextFrame();
        const search = /** @type {HTMLInputElement} */ (cb.querySelector('.combobox__search input'));
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
        const field = /** @type {HTMLButtonElement} */ (cb.querySelector('.combobox__field'));
        field.click();
        await nextFrame();
        const search = /** @type {HTMLInputElement} */ (cb.querySelector('.combobox__search input'));
        // First row is United States. Move once to United Kingdom.
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await nextFrame();
        expect(changes).toBe(1);
        expect(detail).toEqual({ value: 'uk', option: cb.querySelector('option[value="uk"]') });
        expect(/** @type {any} */ (cb).value).toBe('uk');
        const popover = /** @type {HTMLElement} */ (cb.querySelector('.combobox__popover'));
        expect(popover.matches(':popover-open')).toBe(false);
        expect(cb.querySelector('.combobox__value')?.textContent).toBe('United Kingdom');
    });

    it('clicking an option selects it', async () => {
        const cb = mount(`<neon-combobox>${COUNTRIES}</neon-combobox>`);
        let changes = 0;
        cb.addEventListener('change', () => changes++);
        /** @type {HTMLButtonElement} */ (cb.querySelector('.combobox__field')).click();
        await nextFrame();
        const rows = cb.querySelectorAll('.combobox__option');
        /** @type {HTMLButtonElement} */ (rows[2]).click();
        expect(/** @type {any} */ (cb).value).toBe('de');
        expect(changes).toBe(1);
    });

    it('programmatic value setter updates display but does NOT dispatch change', () => {
        const cb = mount(`<neon-combobox>${COUNTRIES}</neon-combobox>`);
        let changes = 0;
        cb.addEventListener('change', () => changes++);
        /** @type {any} */ (cb).value = 'fr';
        expect(/** @type {any} */ (cb).value).toBe('fr');
        expect(cb.querySelector('.combobox__value')?.textContent).toBe('France');
        expect(changes).toBe(0);
    });

    it('setting an unknown value is a no-op (matches native <select>)', () => {
        const cb = mount(`<neon-combobox value="us">${COUNTRIES}</neon-combobox>`);
        /** @type {any} */ (cb).value = 'zz';
        expect(/** @type {any} */ (cb).value).toBe('us');
        expect(cb.querySelector('.combobox__value')?.textContent).toBe('United States');
    });

    it('participates in form submission via ElementInternals', () => {
        const wrapper = mount(`
            <form>
                <neon-combobox name="country" value="de">${COUNTRIES}</neon-combobox>
            </form>
        `);
        const form = /** @type {HTMLFormElement} */ (wrapper);
        const data = new FormData(form);
        expect(data.get('country')).toBe('de');
    });

    it('required + empty value → checkValidity() returns false', () => {
        const wrapper = mount(`
            <form>
                <neon-combobox name="country" required>${COUNTRIES}</neon-combobox>
            </form>
        `);
        const cb = /** @type {any} */ (wrapper.querySelector('neon-combobox'));
        expect(cb.checkValidity()).toBe(false);
        cb.value = 'us';
        expect(cb.checkValidity()).toBe(true);
    });

    it('form.reset() restores the initial value', () => {
        const wrapper = mount(`
            <form>
                <neon-combobox name="country" value="de">${COUNTRIES}</neon-combobox>
            </form>
        `);
        const form = /** @type {HTMLFormElement} */ (wrapper);
        const cb = /** @type {any} */ (wrapper.querySelector('neon-combobox'));
        cb.value = 'fr';
        expect(cb.value).toBe('fr');
        form.reset();
        expect(cb.value).toBe('de');
    });

    it('clear button clears value and dispatches change', async () => {
        const cb = mount(`<neon-combobox value="us" data-clearable>${COUNTRIES}</neon-combobox>`);
        let changes = 0;
        cb.addEventListener('change', () => changes++);
        const clear = /** @type {HTMLButtonElement} */ (cb.querySelector('.combobox__clear'));
        expect(clear.style.display).not.toBe('none');
        clear.click();
        expect(/** @type {any} */ (cb).value).toBe('');
        expect(changes).toBe(1);
        expect(clear.style.display).toBe('none');
    });

    it('input event fires while user types in the search field', async () => {
        const cb = mount(`<neon-combobox>${COUNTRIES}</neon-combobox>`);
        /** @type {HTMLButtonElement} */ (cb.querySelector('.combobox__field')).click();
        await nextFrame();
        let detail = null;
        cb.addEventListener('input', (e) => {
            detail = /** @type {CustomEvent} */ (e).detail;
        });
        const search = /** @type {HTMLInputElement} */ (cb.querySelector('.combobox__search input'));
        search.value = 'fr';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        expect(detail).toEqual({ query: 'fr' });
    });
});
