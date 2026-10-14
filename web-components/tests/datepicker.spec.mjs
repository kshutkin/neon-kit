import * as styles from '@neon-kit/theme/components/datepicker.module.css?neon';
import { queryInternal, queryAllInternal, styleClass, hasStyleClasses, activeElement } from './style-queries.mjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import '../src/datepicker.jsx';

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

    it('renders the theme datepicker field and day grid', async () => {
        const picker = mount(`<neon-datepicker value="2026-04-15" placeholder="Start date"></neon-datepicker>`);
        await nextFrame();
        expect(hasStyleClasses(picker.shadowRoot.firstElementChild, styleClass(styles, 'datepicker'))).toBe(true);
        const input = /** @type {HTMLInputElement} */ (queryInternal(picker, '.datepicker__input', styles));
        const trigger = queryInternal(picker, '.datepicker__trigger', styles);
        const popover = queryInternal(picker, '.datepicker__popover', styles);
        const cells = queryAllInternal(picker, '.datepicker__grid.-days .datepicker__cell', styles);

        expect(input).toBeTruthy();
        expect(input.placeholder).toBe('Start date');
        expect(trigger).toBeTruthy();
        expect(popover).toBeTruthy();
        expect(queryInternal(picker, '.datepicker__view-switch', styles)?.textContent).toBe('April 2026');
        expect(cells.length).toBe(35);
        expect(hasStyleClasses(queryInternal(picker, '[data-date="2026-04-15"]', styles), styleClass(styles, '-selected'))).toBe(true);
    });

    it('participates in form submission via ElementInternals', () => {
        const wrapper = mount(`
            <form>
                <neon-datepicker name="startsOn" value="2026-04-15"></neon-datepicker>
            </form>
        `);
        const form = /** @type {HTMLFormElement} */ (wrapper);
        const picker = /** @type {any} */ (queryInternal(form, 'neon-datepicker', styles));
        expect(picker.value).toBe('2026-04-15');
        expect(new FormData(form).get('startsOn')).toBe('2026-04-15');
    });

    it('includes an empty named value like a native date input', () => {
        const form = mount(`<form><neon-datepicker name="startsOn"></neon-datepicker></form>`);
        const data = new FormData(/** @type {HTMLFormElement} */ (form));
        expect(data.has('startsOn')).toBe(true);
        expect(data.get('startsOn')).toBe('');
    });

    it('supports required, min, max and step validation', async () => {
        const picker = /** @type {any} */ (mount(`
            <neon-datepicker required min="2026-01-01" max="2026-12-31" step="7"></neon-datepicker>
        `));
        await nextFrame();
        expect(picker.checkValidity()).toBe(false);
        expect(picker.validity.valueMissing).toBe(true);

        picker.value = '2025-12-31';
        await nextFrame();
        expect(picker.checkValidity()).toBe(false);
        expect(picker.validity.rangeUnderflow).toBe(true);

        picker.value = '2026-01-02';
        await nextFrame();
        expect(picker.checkValidity()).toBe(false);
        expect(picker.validity.stepMismatch).toBe(true);

        picker.value = '2026-01-08';
        await nextFrame();
        expect(picker.checkValidity()).toBe(true);
    });

    it('typing dispatches input and change for valid dates', () => {
        const picker = /** @type {any} */ (mount(`<neon-datepicker></neon-datepicker>`));
        const input = /** @type {HTMLInputElement} */ (queryInternal(picker, '.datepicker__input', styles));
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

    it('keeps invalid typed text visible while exposing an empty value and badInput validity', async () => {
        const picker = /** @type {any} */ (mount(`<neon-datepicker value="2026-04-15"></neon-datepicker>`));
        await nextFrame();
        const input = /** @type {HTMLInputElement} */ (queryInternal(picker, '.datepicker__input', styles));

        input.value = '2026-99-99';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await nextFrame();
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
        const picker = /** @type {any} */ (queryInternal(form, 'neon-datepicker', styles));
        const trigger = /** @type {HTMLButtonElement} */ (queryInternal(picker, '.datepicker__trigger', styles));
        let inputs = 0;
        let changes = 0;
        picker.addEventListener('input', () => inputs++);
        picker.addEventListener('change', () => changes++);

        trigger.click();
        await nextFrame();
        /** @type {HTMLButtonElement} */ (queryInternal(picker, '[data-date="2026-04-15"]', styles)).click();
        expect(picker.value).toBe('2026-04-15');
        expect(new FormData(form).get('startsOn')).toBe('2026-04-15');
        expect(inputs).toBe(1);
        expect(changes).toBe(1);
    });

    it('switches between day, month and year views', async () => {
        const picker = mount(`<neon-datepicker value="2026-04-15"></neon-datepicker>`);
        /** @type {HTMLButtonElement} */ (queryInternal(picker, '.datepicker__trigger', styles)).click();
        await nextFrame();

        /** @type {HTMLButtonElement} */ (queryInternal(picker, '[data-dp-switch]', styles)).click();
        await nextFrame();
        expect(hasStyleClasses(queryInternal(picker, '.datepicker__grid', styles), styleClass(styles, '-months'))).toBe(true);
        expect(queryInternal(picker, '.datepicker__view-switch', styles)?.textContent).toBe('2026');

        /** @type {HTMLButtonElement} */ (queryInternal(picker, '[data-month="4"]', styles)).click();
        await nextFrame();
        expect(hasStyleClasses(queryInternal(picker, '.datepicker__grid', styles), styleClass(styles, '-days'))).toBe(true);
        expect(queryInternal(picker, '.datepicker__view-switch', styles)?.textContent).toBe('May 2026');

        /** @type {HTMLButtonElement} */ (queryInternal(picker, '[data-dp-switch]', styles)).click();
        await nextFrame();
        /** @type {HTMLButtonElement} */ (queryInternal(picker, '[data-dp-switch]', styles)).click();
        await nextFrame();
        expect(hasStyleClasses(queryInternal(picker, '.datepicker__grid', styles), styleClass(styles, '-years'))).toBe(true);
    });

    it('data-clearable clears value and dispatches input/change', async () => {
        const picker = /** @type {any} */ (mount(`<neon-datepicker value="2026-04-15" data-clearable></neon-datepicker>`));
        await nextFrame();
        let inputs = 0;
        let changes = 0;
        picker.addEventListener('input', () => inputs++);
        picker.addEventListener('change', () => changes++);
        const clear = /** @type {HTMLButtonElement} */ (queryInternal(picker, '.datepicker__clear', styles));

        expect(clear.style.display).not.toBe('none');
        clear.click();
        await nextFrame();
        expect(picker.value).toBe('');
        expect(inputs).toBe(1);
        expect(changes).toBe(1);
        expect(clear.style.display).toBe('none');
    });

    it('form.reset() restores defaultValue', async () => {
        const form = /** @type {HTMLFormElement} */ (mount(`
            <form>
                <neon-datepicker name="startsOn" value="2026-04-15"></neon-datepicker>
            </form>
        `));
        await nextFrame();
        const picker = /** @type {any} */ (queryInternal(form, 'neon-datepicker', styles));
        picker.value = '2026-05-20';
        expect(picker.value).toBe('2026-05-20');
        form.reset();
        expect(picker.value).toBe('2026-04-15');
    });

    it('supports valueAsNumber, valueAsDate, stepUp and stepDown', async () => {
        const picker = /** @type {any} */ (mount(`<neon-datepicker step="7"></neon-datepicker>`));
        await nextFrame();
        picker.valueAsDate = new Date(Date.UTC(2026, 0, 1));
        expect(picker.value).toBe('2026-01-01');
        expect(picker.valueAsNumber).toBe(Date.UTC(2026, 0, 1));
        expect(picker.valueAsDate?.toISOString()).toBe('2026-01-01T00:00:00.000Z');

        picker.stepUp();
        expect(picker.value).toBe('2026-01-08');
        picker.stepDown(2);
        expect(picker.value).toBe('2025-12-25');
    });

    it('disables out-of-range days in the calendar grid', async () => {
        const picker = mount(`<neon-datepicker value="2026-04-15" min="2026-04-10" max="2026-04-20"></neon-datepicker>`);
        await nextFrame();
        expect(/** @type {HTMLButtonElement} */ (queryInternal(picker, '[data-date="2026-04-09"]', styles)).disabled).toBe(true);
        expect(/** @type {HTMLButtonElement} */ (queryInternal(picker, '[data-date="2026-04-10"]', styles)).disabled).toBe(false);
        expect(/** @type {HTMLButtonElement} */ (queryInternal(picker, '[data-date="2026-04-21"]', styles)).disabled).toBe(true);
    });
});
