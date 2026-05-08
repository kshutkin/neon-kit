import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import '../src/datepicker.js';

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
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe('<neon-datepicker>', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('registers as a custom element', () => {
        expect(customElements.get('neon-datepicker')).toBeTruthy();
    });

    it('renders the theme datepicker field and day grid', () => {
        const picker = mount(`<neon-datepicker value="2026-04-15" placeholder="Start date"></neon-datepicker>`);
        expect(picker.classList.contains('datepicker')).toBe(true);
        const input = /** @type {HTMLInputElement} */ (picker.querySelector('.datepicker__input'));
        const trigger = picker.querySelector('.datepicker__trigger');
        const popover = picker.querySelector('.datepicker__popover');
        const cells = picker.querySelectorAll('.datepicker__grid.-days .datepicker__cell');

        expect(input).toBeTruthy();
        expect(input.placeholder).toBe('Start date');
        expect(trigger).toBeTruthy();
        expect(popover).toBeTruthy();
        expect(picker.querySelector('.datepicker__view-switch')?.textContent).toBe('April 2026');
        expect(cells.length).toBe(35);
        expect(picker.querySelector('[data-date="2026-04-15"]')?.classList.contains('-selected')).toBe(true);
    });

    it('participates in form submission via ElementInternals', () => {
        const wrapper = mount(`
            <form>
                <neon-datepicker name="startsOn" value="2026-04-15"></neon-datepicker>
            </form>
        `);
        const form = /** @type {HTMLFormElement} */ (wrapper);
        const picker = /** @type {any} */ (form.querySelector('neon-datepicker'));
        expect(picker.value).toBe('2026-04-15');
        expect(new FormData(form).get('startsOn')).toBe('2026-04-15');
    });

    it('includes an empty named value like a native date input', () => {
        const form = mount(`<form><neon-datepicker name="startsOn"></neon-datepicker></form>`);
        const data = new FormData(/** @type {HTMLFormElement} */ (form));
        expect(data.has('startsOn')).toBe(true);
        expect(data.get('startsOn')).toBe('');
    });

    it('supports required, min, max and step validation', () => {
        const picker = /** @type {any} */ (mount(`
            <neon-datepicker required min="2026-01-01" max="2026-12-31" step="7"></neon-datepicker>
        `));
        expect(picker.checkValidity()).toBe(false);
        expect(picker.validity.valueMissing).toBe(true);

        picker.value = '2025-12-31';
        expect(picker.checkValidity()).toBe(false);
        expect(picker.validity.rangeUnderflow).toBe(true);

        picker.value = '2026-01-02';
        expect(picker.checkValidity()).toBe(false);
        expect(picker.validity.stepMismatch).toBe(true);

        picker.value = '2026-01-08';
        expect(picker.checkValidity()).toBe(true);
    });

    it('typing dispatches input and change for valid dates', () => {
        const picker = /** @type {any} */ (mount(`<neon-datepicker></neon-datepicker>`));
        const input = /** @type {HTMLInputElement} */ (picker.querySelector('.datepicker__input'));
        let inputs = 0;
        let changes = 0;
        picker.addEventListener('input', () => inputs++);
        picker.addEventListener('change', () => changes++);

        input.value = '2026-04-05';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(inputs).toBe(1);
        expect(picker.value).toBe('2026-04-05');

        input.dispatchEvent(new Event('change', { bubbles: true }));
        expect(changes).toBe(1);
        expect(input.value).toBe('2026-04-05');
    });

    it('keeps invalid typed text visible while exposing an empty value and badInput validity', () => {
        const picker = /** @type {any} */ (mount(`<neon-datepicker value="2026-04-15"></neon-datepicker>`));
        const input = /** @type {HTMLInputElement} */ (picker.querySelector('.datepicker__input'));

        input.value = '2026-99-99';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(picker.value).toBe('');
        expect(input.value).toBe('2026-99-99');
        expect(picker.checkValidity()).toBe(false);
        expect(picker.validity.badInput).toBe(true);
    });

    it('selecting a day updates value, form value, and events', async () => {
        const wrapper = mount(`
            <form>
                <neon-datepicker name="startsOn" value="2026-04-01"></neon-datepicker>
            </form>
        `);
        const form = /** @type {HTMLFormElement} */ (wrapper);
        const picker = /** @type {any} */ (form.querySelector('neon-datepicker'));
        const trigger = /** @type {HTMLButtonElement} */ (picker.querySelector('.datepicker__trigger'));
        let inputs = 0;
        let changes = 0;
        picker.addEventListener('input', () => inputs++);
        picker.addEventListener('change', () => changes++);

        trigger.click();
        await nextFrame();
        /** @type {HTMLButtonElement} */ (picker.querySelector('[data-date="2026-04-15"]')).click();
        expect(picker.value).toBe('2026-04-15');
        expect(new FormData(form).get('startsOn')).toBe('2026-04-15');
        expect(inputs).toBe(1);
        expect(changes).toBe(1);
    });

    it('switches between day, month and year views', async () => {
        const picker = mount(`<neon-datepicker value="2026-04-15"></neon-datepicker>`);
        /** @type {HTMLButtonElement} */ (picker.querySelector('.datepicker__trigger')).click();
        await nextFrame();

        /** @type {HTMLButtonElement} */ (picker.querySelector('[data-dp-switch]')).click();
        expect(picker.querySelector('.datepicker__grid')?.classList.contains('-months')).toBe(true);
        expect(picker.querySelector('.datepicker__view-switch')?.textContent).toBe('2026');

        /** @type {HTMLButtonElement} */ (picker.querySelector('[data-month="4"]')).click();
        expect(picker.querySelector('.datepicker__grid')?.classList.contains('-days')).toBe(true);
        expect(picker.querySelector('.datepicker__view-switch')?.textContent).toBe('May 2026');

        /** @type {HTMLButtonElement} */ (picker.querySelector('[data-dp-switch]')).click();
        /** @type {HTMLButtonElement} */ (picker.querySelector('[data-dp-switch]')).click();
        expect(picker.querySelector('.datepicker__grid')?.classList.contains('-years')).toBe(true);
    });

    it('data-clearable clears value and dispatches input/change', () => {
        const picker = /** @type {any} */ (mount(`<neon-datepicker value="2026-04-15" data-clearable></neon-datepicker>`));
        let inputs = 0;
        let changes = 0;
        picker.addEventListener('input', () => inputs++);
        picker.addEventListener('change', () => changes++);
        const clear = /** @type {HTMLButtonElement} */ (picker.querySelector('.datepicker__clear'));

        expect(clear.style.display).not.toBe('none');
        clear.click();
        expect(picker.value).toBe('');
        expect(inputs).toBe(1);
        expect(changes).toBe(1);
        expect(clear.style.display).toBe('none');
    });

    it('form.reset() restores defaultValue', () => {
        const form = /** @type {HTMLFormElement} */ (mount(`
            <form>
                <neon-datepicker name="startsOn" value="2026-04-15"></neon-datepicker>
            </form>
        `));
        const picker = /** @type {any} */ (form.querySelector('neon-datepicker'));
        picker.value = '2026-05-20';
        expect(picker.value).toBe('2026-05-20');
        form.reset();
        expect(picker.value).toBe('2026-04-15');
    });

    it('supports valueAsNumber, valueAsDate, stepUp and stepDown', () => {
        const picker = /** @type {any} */ (mount(`<neon-datepicker step="7"></neon-datepicker>`));
        picker.valueAsDate = new Date(Date.UTC(2026, 0, 1));
        expect(picker.value).toBe('2026-01-01');
        expect(picker.valueAsNumber).toBe(Date.UTC(2026, 0, 1));
        expect(picker.valueAsDate?.toISOString()).toBe('2026-01-01T00:00:00.000Z');

        picker.stepUp();
        expect(picker.value).toBe('2026-01-08');
        picker.stepDown(2);
        expect(picker.value).toBe('2025-12-25');
    });

    it('disables out-of-range days in the calendar grid', () => {
        const picker = mount(`<neon-datepicker value="2026-04-15" min="2026-04-10" max="2026-04-20"></neon-datepicker>`);
        expect(/** @type {HTMLButtonElement} */ (picker.querySelector('[data-date="2026-04-09"]')).disabled).toBe(true);
        expect(/** @type {HTMLButtonElement} */ (picker.querySelector('[data-date="2026-04-10"]')).disabled).toBe(false);
        expect(/** @type {HTMLButtonElement} */ (picker.querySelector('[data-date="2026-04-21"]')).disabled).toBe(true);
    });
});