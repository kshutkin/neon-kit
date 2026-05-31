import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import '../src/timepicker.jsx';

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

describe('<neon-timepicker>', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('registers as a custom element', () => {
        expect(customElements.get('neon-timepicker')).toBeTruthy();
    });

    it('renders the theme timepicker field and generated option list', () => {
        const picker = mount(`<neon-timepicker step="3600" placeholder="Start time"></neon-timepicker>`);
        expect(picker.classList.contains('timepicker')).toBe(true);
        const input = /** @type {HTMLInputElement} */ (picker.querySelector('.timepicker__input'));
        const trigger = picker.querySelector('.timepicker__trigger');
        const popover = picker.querySelector('.timepicker__popover');
        const rows = picker.querySelectorAll('.combobox__option');
        expect(input).toBeTruthy();
        expect(input.placeholder).toBe('Start time');
        expect(trigger).toBeTruthy();
        expect(popover).toBeTruthy();
        expect(rows.length).toBe(24);
        expect(rows[0].textContent?.trim()).toBe('00:00');
        expect(rows[23].textContent?.trim()).toBe('23:00');
    });

    it('participates in form submission via ElementInternals', () => {
        const wrapper = mount(`
            <form>
                <neon-timepicker name="startsAt" value="09:30"></neon-timepicker>
            </form>
        `);
        const form = /** @type {HTMLFormElement} */ (wrapper);
        const picker = /** @type {any} */ (form.querySelector('neon-timepicker'));
        expect(picker.value).toBe('09:30');
        expect(new FormData(form).get('startsAt')).toBe('09:30');
    });

    it('includes an empty named value like a native time input', () => {
        const form = mount(`<form><neon-timepicker name="startsAt"></neon-timepicker></form>`);
        const data = new FormData(/** @type {HTMLFormElement} */ (form));
        expect(data.has('startsAt')).toBe(true);
        expect(data.get('startsAt')).toBe('');
    });

    it('supports required, min, max and step validation', () => {
        const picker = /** @type {any} */ (mount(`
            <neon-timepicker required min="09:00" max="17:00" step="900"></neon-timepicker>
        `));
        expect(picker.checkValidity()).toBe(false);
        expect(picker.validity.valueMissing).toBe(true);

        picker.value = '08:45';
        expect(picker.checkValidity()).toBe(false);
        expect(picker.validity.rangeUnderflow).toBe(true);

        picker.value = '09:10';
        expect(picker.checkValidity()).toBe(false);
        expect(picker.validity.stepMismatch).toBe(true);

        picker.value = '09:15';
        expect(picker.checkValidity()).toBe(true);
    });

    it('defaults to HH:MM and rejects seconds until seconds mode is enabled', () => {
        const picker = /** @type {any} */ (mount(`<neon-timepicker value="09:30:15"></neon-timepicker>`));
        expect(picker.value).toBe('');
        picker.seconds = true;
        picker.value = '09:30:15';
        expect(picker.value).toBe('09:30:15');
        const input = /** @type {HTMLInputElement} */ (picker.querySelector('.timepicker__input'));
        expect(input.placeholder).toBe('HH:MM:SS');
    });

    it('normalizes HH:MM to HH:MM:SS when seconds mode is enabled', () => {
        const picker = /** @type {any} */ (mount(`<neon-timepicker seconds value="09:30"></neon-timepicker>`));
        expect(picker.value).toBe('09:30:00');
        expect(new FormData(mount(`<form><neon-timepicker seconds name="time" value="09:30"></neon-timepicker></form>`)).get('time')).toBe('09:30:00');
    });

    it('typing dispatches input and change, and normalizes lenient input on commit', () => {
        const picker = /** @type {any} */ (mount(`<neon-timepicker></neon-timepicker>`));
        const input = /** @type {HTMLInputElement} */ (picker.querySelector('.timepicker__input'));
        let inputs = 0;
        let changes = 0;
        picker.addEventListener('input', () => inputs++);
        picker.addEventListener('change', () => changes++);

        input.value = '9:05';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(inputs).toBe(1);
        expect(picker.value).toBe('09:05');

        input.dispatchEvent(new Event('change', { bubbles: true }));
        expect(changes).toBe(1);
        expect(input.value).toBe('09:05');
    });

    it('keeps invalid typed text visible while exposing an empty value and badInput validity', () => {
        const picker = /** @type {any} */ (mount(`<neon-timepicker value="10:00"></neon-timepicker>`));
        const input = /** @type {HTMLInputElement} */ (picker.querySelector('.timepicker__input'));

        input.value = '25:00';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(picker.value).toBe('');
        expect(input.value).toBe('25:00');
        expect(picker.checkValidity()).toBe(false);
        expect(picker.validity.badInput).toBe(true);
    });

    it('selecting a generated row updates value, form value, and events', async () => {
        const wrapper = mount(`
            <form>
                <neon-timepicker name="startsAt" step="3600"></neon-timepicker>
            </form>
        `);
        const form = /** @type {HTMLFormElement} */ (wrapper);
        const picker = /** @type {any} */ (form.querySelector('neon-timepicker'));
        const trigger = /** @type {HTMLButtonElement} */ (picker.querySelector('.timepicker__trigger'));
        let inputs = 0;
        let changes = 0;
        picker.addEventListener('input', () => inputs++);
        picker.addEventListener('change', () => changes++);

        trigger.click();
        await nextFrame();
        const rows = picker.querySelectorAll('.combobox__option');
        /** @type {HTMLButtonElement} */ (rows[9]).click();
        expect(picker.value).toBe('09:00');
        expect(new FormData(form).get('startsAt')).toBe('09:00');
        expect(inputs).toBe(1);
        expect(changes).toBe(1);
    });

    it('data-clearable clears value and dispatches input/change', () => {
        const picker = /** @type {any} */ (mount(`<neon-timepicker value="12:30" data-clearable></neon-timepicker>`));
        let inputs = 0;
        let changes = 0;
        picker.addEventListener('input', () => inputs++);
        picker.addEventListener('change', () => changes++);
        const clear = /** @type {HTMLButtonElement} */ (picker.querySelector('.timepicker__clear'));

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
                <neon-timepicker name="startsAt" value="08:00"></neon-timepicker>
            </form>
        `));
        const picker = /** @type {any} */ (form.querySelector('neon-timepicker'));
        picker.value = '11:30';
        expect(picker.value).toBe('11:30');
        form.reset();
        expect(picker.value).toBe('08:00');
    });

    it('supports valueAsNumber, valueAsDate, stepUp and stepDown', () => {
        const picker = /** @type {any} */ (mount(`<neon-timepicker step="900"></neon-timepicker>`));
        picker.valueAsNumber = 9 * 60 * 60 * 1000;
        expect(picker.value).toBe('09:00');
        expect(picker.valueAsNumber).toBe(9 * 60 * 60 * 1000);
        expect(picker.valueAsDate?.toISOString()).toBe('1970-01-01T09:00:00.000Z');

        picker.stepUp();
        expect(picker.value).toBe('09:15');
        picker.stepDown(2);
        expect(picker.value).toBe('08:45');
    });

    it('uses datalist options when list is provided', () => {
        const picker = mount(`
            <neon-timepicker list="slot-times"></neon-timepicker>
        `);
        const datalist = document.createElement('datalist');
        datalist.id = 'slot-times';
        datalist.innerHTML = `
            <option value="09:00" label="Opening"></option>
            <option value="17:30" label="Closing"></option>
            <option value="25:00" label="Invalid"></option>
        `;
        document.body.appendChild(datalist);
        picker.setAttribute('list', 'slot-times');

        const labels = Array.from(picker.querySelectorAll('.combobox__option-label')).map((row) => row.textContent);
        expect(labels).toEqual(['Opening', 'Closing']);
    });
});