import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/multicombobox.jsx';

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

describe('<neon-multicombobox>', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('registers as a custom element', () => {
        expect(customElements.get('neon-multicombobox')).toBeTruthy();
    });

    it('renders empty field with placeholder when no values are selected', () => {
        const cb = mount(`<neon-multicombobox placeholder="Pick…">${COUNTRIES}</neon-multicombobox>`);
        expect(cb.classList.contains('combobox')).toBe(true);
        expect(cb.classList.contains('-multi')).toBe(true);
        const tags = cb.querySelectorAll('.combobox__values .tag');
        expect(tags.length).toBe(0);
        const placeholder = /** @type {HTMLElement} */ (cb.querySelector('.combobox__placeholder'));
        expect(placeholder?.textContent).toBe('Pick…');
        expect(placeholder.hidden).toBe(false);
        // Original <option>s hidden.
        for (const opt of cb.querySelectorAll(':scope > option')) {
            expect(/** @type {HTMLElement} */ (opt).style.display).toBe('none');
        }
    });

    it('renders a tag for each <option selected> at startup', () => {
        const cb = mount(`<neon-multicombobox>
            <option value="us" selected>United States</option>
            <option value="uk">United Kingdom</option>
            <option value="de" selected>Germany</option>
        </neon-multicombobox>`);
        const tags = cb.querySelectorAll('.combobox__values .tag');
        expect(tags.length).toBe(2);
        expect(tags[0].textContent?.trim().startsWith('United States')).toBe(true);
        expect(tags[1].textContent?.trim().startsWith('Germany')).toBe(true);
        const placeholder = /** @type {HTMLElement} */ (cb.querySelector('.combobox__placeholder'));
        expect(placeholder.hidden).toBe(true);
        expect(/** @type {any} */ (cb).values).toEqual(['us', 'de']);
    });

    it('clicking the field opens the popover; Escape closes', async () => {
        const cb = mount(`<neon-multicombobox>${COUNTRIES}</neon-multicombobox>`);
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

    it('ArrowDown on the field opens the popover', async () => {
        const cb = mount(`<neon-multicombobox>${COUNTRIES}</neon-multicombobox>`);
        const field = /** @type {HTMLButtonElement} */ (cb.querySelector('.combobox__field'));
        const popover = /** @type {HTMLElement} */ (cb.querySelector('.combobox__popover'));
        field.focus();
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        await nextFrame();
        expect(popover.matches(':popover-open')).toBe(true);
    });

    it('typing in the search input filters rows', async () => {
        const cb = mount(`<neon-multicombobox>${COUNTRIES}</neon-multicombobox>`);
        /** @type {HTMLButtonElement} */ (cb.querySelector('.combobox__field')).click();
        await nextFrame();
        const search = /** @type {HTMLInputElement} */ (cb.querySelector('.combobox__search input'));
        let detail = null;
        cb.addEventListener('input', (e) => {
            detail = /** @type {CustomEvent} */ (e).detail;
        });
        search.value = 'unit';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        const labels = Array.from(cb.querySelectorAll('.combobox__option-label')).map((r) => r.textContent);
        expect(labels).toEqual(['United States', 'United Kingdom']);
        expect(detail).toEqual({ query: 'unit' });
    });

    it('ArrowDown highlights then Space toggles the row, dispatches change once, leaves popover open', async () => {
        const cb = mount(`<neon-multicombobox>${COUNTRIES}</neon-multicombobox>`);
        let changes = 0;
        let detail = null;
        cb.addEventListener('change', (e) => {
            changes++;
            detail = /** @type {CustomEvent} */ (e).detail;
        });
        /** @type {HTMLButtonElement} */ (cb.querySelector('.combobox__field')).click();
        await nextFrame();
        const search = /** @type {HTMLInputElement} */ (cb.querySelector('.combobox__search input'));
        const popover = /** @type {HTMLElement} */ (cb.querySelector('.combobox__popover'));
        // First row already highlighted on open.
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        // Now on second row (United Kingdom).
        search.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
        expect(changes).toBe(1);
        expect(/** @type {any} */ (detail)?.values).toEqual(['uk']);
        expect(popover.matches(':popover-open')).toBe(true);
        const tags = cb.querySelectorAll('.combobox__values .tag');
        expect(tags.length).toBe(1);
        expect(tags[0].textContent?.trim().startsWith('United Kingdom')).toBe(true);
    });

    it('clicking a tag × removes that value and dispatches change', () => {
        const cb = mount(`<neon-multicombobox>
            <option value="us" selected>United States</option>
            <option value="uk" selected>United Kingdom</option>
        </neon-multicombobox>`);
        let changes = 0;
        cb.addEventListener('change', () => changes++);
        const remove = /** @type {HTMLButtonElement} */ (cb.querySelector('.tag[data-value="us"] .tag__remove'));
        remove.click();
        expect(changes).toBe(1);
        expect(/** @type {any} */ (cb).values).toEqual(['uk']);
    });

    it('clicking a tag × does NOT toggle the popover', async () => {
        const cb = mount(`<neon-multicombobox>
            <option value="us" selected>United States</option>
            <option value="uk">United Kingdom</option>
        </neon-multicombobox>`);
        const popover = /** @type {HTMLElement} */ (cb.querySelector('.combobox__popover'));
        const remove = /** @type {HTMLButtonElement} */ (cb.querySelector('.tag[data-value="us"] .tag__remove'));
        remove.click();
        await nextFrame();
        expect(popover.matches(':popover-open')).toBe(false);
    });

    it('programmatic values setter drops unknowns silently with a DEV warning, does not dispatch change', () => {
        const cb = mount(`<neon-multicombobox>${COUNTRIES}</neon-multicombobox>`);
        let changes = 0;
        cb.addEventListener('change', () => changes++);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            /** @type {any} */ (cb).values = ['us', 'xx', 'de'];
            expect(/** @type {any} */ (cb).values).toEqual(['us', 'de']);
            expect(changes).toBe(0);
            expect(warn).toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });

    it('reflects empty name property as an empty attribute', async () => {
        const cb = mount(`<neon-multicombobox>${COUNTRIES}</neon-multicombobox>`);
        /** @type {any} */ (cb).name = 'country';
        await tick();
        expect(cb.getAttribute('name')).toBe('country');

        /** @type {any} */ (cb).name = '';
        await tick();
        expect(cb.getAttribute('name')).toBe('');
    });

    it('participates in form submission with one FormData entry per value', () => {
        const wrapper = mount(`
            <form>
                <neon-multicombobox name="country">
                    <option value="us" selected>United States</option>
                    <option value="uk">United Kingdom</option>
                    <option value="de" selected>Germany</option>
                </neon-multicombobox>
            </form>
        `);
        const form = /** @type {HTMLFormElement} */ (wrapper);
        const data = new FormData(form);
        expect(data.getAll('country')).toEqual(['us', 'de']);
    });

    it('required + empty fails checkValidity, passes once a value is selected', () => {
        const wrapper = mount(`
            <form>
                <neon-multicombobox name="country" required>${COUNTRIES}</neon-multicombobox>
            </form>
        `);
        const cb = /** @type {any} */ (wrapper.querySelector('neon-multicombobox'));
        expect(cb.checkValidity()).toBe(false);
        cb.values = ['us'];
        expect(cb.checkValidity()).toBe(true);
    });

    it('form.reset() restores the original <option selected> set', () => {
        const wrapper = mount(`
            <form>
                <neon-multicombobox name="country">
                    <option value="us" selected>United States</option>
                    <option value="uk">United Kingdom</option>
                    <option value="de" selected>Germany</option>
                    <option value="fr">France</option>
                </neon-multicombobox>
            </form>
        `);
        const form = /** @type {HTMLFormElement} */ (wrapper);
        const cb = /** @type {any} */ (wrapper.querySelector('neon-multicombobox'));
        cb.values = ['fr'];
        expect(cb.values).toEqual(['fr']);
        form.reset();
        expect(cb.values).toEqual(['us', 'de']);
    });

    it('data-clearable shows a clear-all button that empties values and fires change once', () => {
        const cb = mount(`<neon-multicombobox data-clearable>
            <option value="us" selected>United States</option>
            <option value="uk" selected>United Kingdom</option>
        </neon-multicombobox>`);
        let changes = 0;
        cb.addEventListener('change', () => changes++);
        const clear = /** @type {HTMLButtonElement} */ (cb.querySelector('.combobox__clear'));
        expect(clear.style.display).not.toBe('none');
        clear.click();
        expect(changes).toBe(1);
        expect(/** @type {any} */ (cb).values).toEqual([]);
        expect(clear.style.display).toBe('none');
    });

    it('clicking an option row toggles the underlying checkbox and adds the value', async () => {
        const cb = mount(`<neon-multicombobox>${COUNTRIES}</neon-multicombobox>`);
        let changes = 0;
        cb.addEventListener('change', () => changes++);
        /** @type {HTMLButtonElement} */ (cb.querySelector('.combobox__field')).click();
        await nextFrame();
        const rows = cb.querySelectorAll('.combobox__option');
        // Clicking the <label> dispatches a click to the inner checkbox,
        // which fires `change`.
        /** @type {HTMLLabelElement} */ (rows[2]).click();
        expect(changes).toBe(1);
        expect(/** @type {any} */ (cb).values).toEqual(['de']);
    });

    it('values getter returns a defensive copy in option order', () => {
        const cb = mount(`<neon-multicombobox>${COUNTRIES}</neon-multicombobox>`);
        /** @type {any} */ (cb).values = ['de', 'us'];
        const a = /** @type {any} */ (cb).values;
        const b = /** @type {any} */ (cb).values;
        expect(a).not.toBe(b);
        // Order follows option DOM order, not input order.
        expect(a).toEqual(['us', 'de']);
        a.push('fr');
        expect(/** @type {any} */ (cb).values).toEqual(['us', 'de']);
    });

    it('MutationObserver: appending an <option> rebuilds the popover rows', async () => {
        const cb = mount(`<neon-multicombobox>
            <option value="us">United States</option>
            <option value="uk">United Kingdom</option>
        </neon-multicombobox>`);
        /** @type {HTMLButtonElement} */ (cb.querySelector('.combobox__field')).click();
        await nextFrame();
        expect(cb.querySelectorAll('.combobox__option').length).toBe(2);
        const opt3 = document.createElement('option');
        opt3.value = 'de';
        opt3.textContent = 'Germany';
        cb.appendChild(opt3);
        await Promise.resolve();
        await nextFrame();
        expect(cb.querySelectorAll('.combobox__option').length).toBe(3);
    });

    it('MutationObserver: removing a selected <option> drops its tag and row', async () => {
        const cb = mount(`<neon-multicombobox>
            <option value="us" selected>United States</option>
            <option value="uk" selected>United Kingdom</option>
            <option value="de">Germany</option>
        </neon-multicombobox>`);
        /** @type {HTMLButtonElement} */ (cb.querySelector('.combobox__field')).click();
        await nextFrame();
        expect(cb.querySelectorAll('.combobox__option').length).toBe(3);
        expect(/** @type {any} */ (cb).values).toEqual(['us', 'uk']);
        const uk = /** @type {HTMLOptionElement} */ (cb.querySelector(':scope > option[value="uk"]'));
        uk.remove();
        await Promise.resolve();
        await nextFrame();
        expect(cb.querySelectorAll('.combobox__option').length).toBe(2);
        expect(/** @type {any} */ (cb).values).toEqual(['us']);
        const tags = cb.querySelectorAll('.combobox__values .tag');
        expect(tags.length).toBe(1);
        expect(/** @type {HTMLElement} */ (tags[0]).dataset.value).toBe('us');
    });

    it('Space on an already-selected active row deselects it (single change event, tag removed)', async () => {
        const cb = mount(`<neon-multicombobox>${COUNTRIES}</neon-multicombobox>`);
        /** @type {any} */ (cb).values = ['us'];
        let changes = 0;
        let detail = null;
        cb.addEventListener('change', (e) => {
            changes++;
            detail = /** @type {CustomEvent} */ (e).detail;
        });
        /** @type {HTMLButtonElement} */ (cb.querySelector('.combobox__field')).click();
        await nextFrame();
        const search = /** @type {HTMLInputElement} */ (cb.querySelector('.combobox__search input'));
        // First row (United States) is auto-active on open. Press Space to toggle off.
        search.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
        expect(changes).toBe(1);
        expect(/** @type {any} */ (detail)?.values).toEqual([]);
        expect(/** @type {any} */ (cb).values).toEqual([]);
        expect(cb.querySelectorAll('.combobox__values .tag').length).toBe(0);
    });

    it('disabled <option> rows are aria-disabled and cannot be toggled by click or Space', async () => {
        const cb = mount(`<neon-multicombobox>
            <option value="us">United States</option>
            <option value="uk" disabled>United Kingdom</option>
            <option value="de">Germany</option>
        </neon-multicombobox>`);
        let changes = 0;
        cb.addEventListener('change', () => changes++);
        /** @type {HTMLButtonElement} */ (cb.querySelector('.combobox__field')).click();
        await nextFrame();
        const rows = cb.querySelectorAll('.combobox__option');
        const ukRow = /** @type {HTMLLabelElement} */ (rows[1]);
        expect(ukRow.getAttribute('aria-disabled')).toBe('true');
        const ukCheckbox = /** @type {HTMLInputElement} */ (ukRow.querySelector('.checkbox'));
        expect(ukCheckbox.disabled).toBe(true);

        // Clicking the row must not toggle the value or fire change.
        ukRow.click();
        expect(changes).toBe(0);
        expect(/** @type {any} */ (cb).values).toEqual([]);

        // Keyboard navigation must skip the disabled row: from the first
        // visible row (us), ArrowDown should land on de, not uk. Then
        // Space toggles de — never uk.
        const search = /** @type {HTMLInputElement} */ (cb.querySelector('.combobox__search input'));
        // Reset to first row.
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        expect(search.getAttribute('aria-activedescendant')).toBe(/** @type {HTMLLabelElement} */ (rows[2]).id);
        search.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
        expect(changes).toBe(1);
        expect(/** @type {any} */ (cb).values).toEqual(['de']);
    });
});
