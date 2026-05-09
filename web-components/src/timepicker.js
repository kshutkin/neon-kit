/**
 * `<neon-timepicker>` - form-associated time input built on top of the
 * theme's `.timepicker` markup.
 *
 * The public API follows native `<input type="time">` where practical:
 * `value`, `defaultValue`, `min`, `max`, `step`, `required`, `disabled`,
 * `readOnly`, `valueAsNumber`, `valueAsDate`, `stepUp()` and `stepDown()`.
 * By default values are `HH:MM`; add the boolean `seconds` attribute to
 * accept and display `HH:MM:SS`.
 *
 * Light DOM only - see docs/adr/0001-rendering-mode.md.
 */
import { DEV } from 'esm-env';

let nextId = 0;

const FIELD_CLASS = 'timepicker__field';
const INPUT_CLASS = 'timepicker__input';
const CLEAR_CLASS = 'timepicker__clear';
const TRIGGER_CLASS = 'timepicker__trigger';
const ICON_CLASS = 'timepicker__icon';
const POPOVER_CLASS = 'timepicker__popover';
const LIST_CLASS = 'timepicker__list';
const OPTION_CLASS = 'combobox__option';
const OPTION_LABEL_CLASS = 'combobox__option-label';
const OPTION_CHECK_CLASS = 'combobox__option-check';
const EMPTY_CLASS = 'combobox__empty';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_STEP_SECONDS = 60;
const DAY_SECONDS = 24 * 60 * 60;
const DAY_MILLISECONDS = DAY_SECONDS * 1000;
const MAX_LIST_OPTIONS = 1440;
const STEP_EPSILON = 1e-7;

/** @typedef {{ value: string, label: string }} TimeOption */

export class NeonTimepickerElement extends HTMLElement {
    static formAssociated = true;

    static get observedAttributes() {
        return [
            'value',
            'min',
            'max',
            'step',
            'placeholder',
            'disabled',
            'readonly',
            'required',
            'name',
            'autocomplete',
            'list',
            'seconds',
            'data-clearable',
        ];
    }

    /** @type {ElementInternals} */
    #internals;
    /** @type {HTMLDivElement | null} */ #fieldEl = null;
    /** @type {HTMLInputElement | null} */ #input = null;
    /** @type {HTMLButtonElement | null} */ #clearEl = null;
    /** @type {HTMLButtonElement | null} */ #triggerEl = null;
    /** @type {HTMLDivElement | null} */ #popover = null;
    /** @type {HTMLDivElement | null} */ #listEl = null;
    /** @type {HTMLDivElement | null} */ #emptyEl = null;
    /** @type {HTMLButtonElement[]} */ #rows = [];
    /** @type {string} */ #value = '';
    /** @type {string} */ #lastCommittedValue = '';
    /** @type {string} */ #activeId = '';
    /** @type {string} */ #idPrefix = '';
    /** @type {string} */ #popoverId = '';
    /** @type {string} */ #listId = '';
    /** @type {AbortController | null} */ #listeners = null;
    #connected = false;
    #formDisabled = false;

    constructor() {
        super();
        this.#internals = this.attachInternals();
    }

    connectedCallback() {
        if (this.#connected) return;
        this.#connected = true;

        const id = ++nextId;
        this.#idPrefix = `neon-timepicker-${id}`;
        this.#popoverId = `${this.#idPrefix}-pop`;
        this.#listId = `${this.#idPrefix}-list`;

        if (!this.classList.contains('timepicker')) this.classList.add('timepicker');

        this.#buildUi();
        this.#setValueFromString(this.defaultValue, { syncText: true });
        this.#lastCommittedValue = this.#value;
        this.#syncInputAttributes();
        this.#renderRows();
        this.#updateValidity();

        const controller = new AbortController();
        this.#listeners = controller;
        const opts = { signal: controller.signal };

        this.#input?.addEventListener('input', /** @type {EventListener} */ (this.#onInput), opts);
        this.#input?.addEventListener('change', /** @type {EventListener} */ (this.#onInputChange), opts);
        this.#input?.addEventListener('keydown', /** @type {EventListener} */ (this.#onInputKeydown), opts);
        this.#triggerEl?.addEventListener('click', /** @type {EventListener} */ (this.#onTriggerClick), opts);
        this.#clearEl?.addEventListener('click', /** @type {EventListener} */ (this.#onClearClick), opts);
        this.#listEl?.addEventListener('click', /** @type {EventListener} */ (this.#onListClick), opts);
        this.#popover?.addEventListener('toggle', /** @type {EventListener} */ (this.#onPopoverToggle), opts);
    }

    disconnectedCallback() {
        this.#listeners?.abort();
        this.#listeners = null;
        this.#connected = false;
    }

    /**
     * @param {string} name
     * @param {string | null} _oldValue
     * @param {string | null} _newValue
     */
    attributeChangedCallback(name, _oldValue, _newValue) {
        if (!this.#connected) return;

        switch (name) {
            case 'value':
                this.#setValueFromString(this.defaultValue, { syncText: true });
                this.#lastCommittedValue = this.#value;
                break;
            case 'seconds':
                this.#coerceCurrentValueToFormat();
                this.#lastCommittedValue = this.#value;
                this.#syncInputAttributes();
                this.#renderRows();
                this.#updateValidity();
                break;
            case 'min':
            case 'max':
            case 'step':
            case 'list':
                this.#renderRows();
                this.#updateValidity();
                break;
            case 'placeholder':
            case 'disabled':
            case 'readonly':
            case 'required':
            case 'autocomplete':
                this.#syncInputAttributes();
                this.#updateValidity();
                break;
            case 'data-clearable':
                this.#syncClearVisibility();
                break;
            case 'name':
                break;
        }
    }

    // ---- Public API ------------------------------------------------------

    get type() {
        return 'time';
    }

    /** @returns {string} */
    get value() {
        return this.#value;
    }

    /** @param {string | null | undefined} value */
    set value(value) {
        this.#setValueFromString(value == null ? '' : String(value), { syncText: true });
        this.#lastCommittedValue = this.#value;
    }

    /** @returns {string} */
    get defaultValue() {
        return this.getAttribute('value') ?? '';
    }

    /** @param {string | null | undefined} value */
    set defaultValue(value) {
        if (value == null) this.removeAttribute('value');
        else this.setAttribute('value', String(value));
    }

    /** @returns {string} */
    get min() {
        return this.getAttribute('min') ?? '';
    }

    /** @param {string | null | undefined} value */
    set min(value) {
        if (value == null || value === '') this.removeAttribute('min');
        else this.setAttribute('min', String(value));
    }

    /** @returns {string} */
    get max() {
        return this.getAttribute('max') ?? '';
    }

    /** @param {string | null | undefined} value */
    set max(value) {
        if (value == null || value === '') this.removeAttribute('max');
        else this.setAttribute('max', String(value));
    }

    /** @returns {string} */
    get step() {
        return this.getAttribute('step') ?? '';
    }

    /** @param {string | number | null | undefined} value */
    set step(value) {
        if (value == null || value === '') this.removeAttribute('step');
        else this.setAttribute('step', String(value));
    }

    /** @returns {string} */
    get placeholder() {
        return this.getAttribute('placeholder') ?? '';
    }

    /** @param {string | null | undefined} value */
    set placeholder(value) {
        if (value == null) this.removeAttribute('placeholder');
        else this.setAttribute('placeholder', String(value));
    }

    /** @returns {string} */
    get name() {
        return this.getAttribute('name') ?? '';
    }

    /** @param {string | null | undefined} value */
    set name(value) {
        if (value == null || value === '') this.removeAttribute('name');
        else this.setAttribute('name', String(value));
    }

    /** @returns {string} */
    get autocomplete() {
        return this.getAttribute('autocomplete') ?? '';
    }

    /** @param {string | null | undefined} value */
    set autocomplete(value) {
        if (value == null || value === '') this.removeAttribute('autocomplete');
        else this.setAttribute('autocomplete', String(value));
    }

    get disabled() {
        return this.hasAttribute('disabled');
    }

    /** @param {boolean} value */
    set disabled(value) {
        if (value) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }

    get readOnly() {
        return this.hasAttribute('readonly');
    }

    /** @param {boolean} value */
    set readOnly(value) {
        if (value) this.setAttribute('readonly', '');
        else this.removeAttribute('readonly');
    }

    get required() {
        return this.hasAttribute('required');
    }

    /** @param {boolean} value */
    set required(value) {
        if (value) this.setAttribute('required', '');
        else this.removeAttribute('required');
    }

    get seconds() {
        return this.hasAttribute('seconds');
    }

    /** @param {boolean} value */
    set seconds(value) {
        if (value) this.setAttribute('seconds', '');
        else this.removeAttribute('seconds');
    }

    get valueAsNumber() {
        const seconds = parseTime(this.#value, { withSeconds: true, lenient: false });
        return seconds == null ? Number.NaN : seconds * 1000;
    }

    /** @param {number} value */
    set valueAsNumber(value) {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue >= DAY_MILLISECONDS) {
            this.value = '';
            return;
        }
        const seconds = Math.floor(numberValue / 1000);
        if (!this.seconds && seconds % 60 !== 0) {
            this.value = '';
            return;
        }
        this.value = formatTime(seconds, this.seconds);
    }

    get valueAsDate() {
        const seconds = parseTime(this.#value, { withSeconds: true, lenient: false });
        if (seconds == null) return null;
        return new Date(seconds * 1000);
    }

    /** @param {Date | null} value */
    set valueAsDate(value) {
        if (value == null) {
            this.value = '';
            return;
        }
        if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
            this.value = '';
            return;
        }
        const seconds = value.getUTCHours() * 3600 + value.getUTCMinutes() * 60 + value.getUTCSeconds();
        if (!this.seconds && seconds % 60 !== 0) {
            this.value = '';
            return;
        }
        this.value = formatTime(seconds, this.seconds);
    }

    get list() {
        const id = this.getAttribute('list');
        if (!id) return null;
        const element = this.ownerDocument.getElementById(id);
        return element instanceof HTMLDataListElement ? element : null;
    }

    get labels() {
        return this.#internals.labels;
    }

    get form() {
        return this.#internals.form;
    }

    get validity() {
        return this.#internals.validity;
    }

    get validationMessage() {
        return this.#internals.validationMessage;
    }

    get willValidate() {
        return !this.#isEffectivelyDisabled() && !this.readOnly && this.#internals.willValidate;
    }

    get open() {
        return this.#popover?.matches(':popover-open') ?? false;
    }

    checkValidity() {
        return this.#internals.checkValidity();
    }

    reportValidity() {
        return this.#internals.reportValidity();
    }

    /** @param {FocusOptions} [options] */
    focus(options) {
        this.#input?.focus(options);
    }

    blur() {
        this.#input?.blur();
    }

    select() {
        this.#input?.select();
    }

    /** @param {number} [n] */
    stepUp(n = 1) {
        this.#stepBy(Number(n));
    }

    /** @param {number} [n] */
    stepDown(n = 1) {
        this.#stepBy(-Number(n));
    }

    // ---- Form-associated callbacks --------------------------------------

    formAssociatedCallback() {
        // No-op: setFormValue is called whenever value changes.
    }

    formResetCallback() {
        this.#setValueFromString(this.defaultValue, { syncText: true });
        this.#lastCommittedValue = this.#value;
    }

    /** @param {boolean} disabled */
    formDisabledCallback(disabled) {
        this.#formDisabled = disabled;
        this.#syncInputAttributes();
        this.#updateValidity();
    }

    /** @param {string | File | FormData | null} state */
    formStateRestoreCallback(state) {
        if (typeof state === 'string') {
            this.value = state;
        }
    }

    // ---- UI construction -------------------------------------------------

    #buildUi() {
        const field = document.createElement('div');
        field.className = FIELD_CLASS;
        const anchorName = `--${this.#idPrefix}-anchor`;
        field.style.setProperty('anchor-name', anchorName);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = INPUT_CLASS;
        input.inputMode = 'numeric';
        input.setAttribute('autocomplete', this.autocomplete || 'off');
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'none');
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-controls', this.#listId);

        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = CLEAR_CLASS;
        clear.setAttribute('aria-label', 'Clear time');
        clear.style.display = 'none';
        clear.tabIndex = -1;
        clear.appendChild(createXIcon());

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = TRIGGER_CLASS;
        trigger.setAttribute('aria-label', 'Open time list');
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-controls', this.#listId);
        trigger.setAttribute('aria-expanded', 'false');
        trigger.appendChild(createClockIcon());

        const popover = document.createElement('div');
        popover.id = this.#popoverId;
        popover.className = POPOVER_CLASS;
        popover.setAttribute('popover', '');
        popover.style.setProperty('position-anchor', anchorName);

        const list = document.createElement('div');
        list.id = this.#listId;
        list.className = LIST_CLASS;
        list.setAttribute('role', 'listbox');

        const empty = document.createElement('div');
        empty.className = EMPTY_CLASS;
        empty.textContent = 'No times';
        empty.hidden = true;
        list.appendChild(empty);

        field.append(input, clear, trigger);
        popover.appendChild(list);

        this.#fieldEl = field;
        this.#input = input;
        this.#clearEl = clear;
        this.#triggerEl = trigger;
        this.#popover = popover;
        this.#listEl = list;
        this.#emptyEl = empty;

        this.append(field, popover);
    }

    #syncInputAttributes() {
        if (!this.#input || !this.#triggerEl || !this.#clearEl) return;

        const disabled = this.#isEffectivelyDisabled();
        const immutable = disabled || this.readOnly;
        this.#input.disabled = disabled;
        this.#input.readOnly = this.readOnly;
        this.#input.required = this.required;
        this.#input.placeholder = this.getAttribute('placeholder') ?? (this.seconds ? 'HH:MM:SS' : 'HH:MM');
        this.#input.setAttribute('autocomplete', this.autocomplete || 'off');
        if (this.required) this.#input.setAttribute('aria-required', 'true');
        else this.#input.removeAttribute('aria-required');

        this.#triggerEl.disabled = immutable;
        this.#clearEl.disabled = immutable;
        if (immutable) this.#close();
        this.#syncClearVisibility();
    }

    #syncClearVisibility() {
        if (!this.#clearEl) return;
        const text = this.#input?.value.trim() ?? this.#value;
        const visible = this.hasAttribute('data-clearable') && text !== '';
        this.#clearEl.style.display = visible ? '' : 'none';
    }

    #isEffectivelyDisabled() {
        return this.disabled || this.#formDisabled;
    }

    #isMutable() {
        return !this.#isEffectivelyDisabled() && !this.readOnly;
    }

    /** @param {string} raw */
    #normalizeValue(raw) {
        const trimmed = raw.trim();
        if (trimmed === '') return '';
        const seconds = parseTime(trimmed, { withSeconds: this.seconds, lenient: false });
        if (seconds == null) return '';
        if (!this.seconds && seconds % 60 !== 0) return '';
        return formatTime(seconds, this.seconds);
    }

    /**
     * @param {string} raw
     * @param {{ syncText: boolean }} options
     */
    #setValueFromString(raw, { syncText }) {
        return this.#applyValue(this.#normalizeValue(raw), { syncText });
    }

    /**
     * @param {string} value
     * @param {{ syncText: boolean }} options
     */
    #applyValue(value, { syncText }) {
        const previous = this.#value;
        this.#value = value;
        if (syncText && this.#input) this.#input.value = value;
        this.#internals.setFormValue(this.#value, this.#value);
        this.#syncClearVisibility();
        this.#refreshSelectedRows();
        this.#updateValidity();
        return previous !== this.#value;
    }

    #coerceCurrentValueToFormat() {
        const seconds = parseTime(this.#value, { withSeconds: true, lenient: false });
        if (seconds == null) {
            this.#applyValue('', { syncText: true });
            return;
        }
        if (!this.seconds && seconds % 60 !== 0) {
            this.#applyValue('', { syncText: true });
            return;
        }
        this.#applyValue(formatTime(seconds, this.seconds), { syncText: true });
    }

    /** @returns {string | null} */
    #readInputValue() {
        const raw = this.#input?.value.trim() ?? '';
        if (raw === '') return '';
        const seconds = parseTime(raw, { withSeconds: this.seconds, lenient: true });
        if (seconds == null) return null;
        if (!this.seconds && seconds % 60 !== 0) return null;
        return formatTime(seconds, this.seconds);
    }

    #commitInputValue() {
        const next = this.#readInputValue();
        if (next == null) this.#applyValue('', { syncText: false });
        else this.#applyValue(next, { syncText: true });
        this.#dispatchChangeIfNeeded();
    }

    #dispatchInput() {
        this.dispatchEvent(new Event('input', { bubbles: true }));
    }

    #dispatchChangeIfNeeded() {
        if (this.#lastCommittedValue === this.#value) return;
        this.#lastCommittedValue = this.#value;
        this.dispatchEvent(new Event('change', { bubbles: true }));
    }

    #updateValidity() {
        if (!this.#input) return;

        if (!this.willValidate) {
            this.#input.removeAttribute('aria-invalid');
            this.#internals.setValidity({});
            return;
        }

        const raw = this.#input.value.trim();
        if (raw !== '' && this.#readInputValue() == null) {
            this.#setInvalid({ badInput: true }, 'Enter a valid time.');
            return;
        }

        if (this.required && this.#value === '') {
            this.#setInvalid({ valueMissing: true }, 'Please fill out this field.');
            return;
        }

        const valueSeconds = parseTime(this.#value, { withSeconds: true, lenient: false });
        if (valueSeconds != null) {
            const rangeState = this.#rangeState(valueSeconds);
            if (rangeState === 'underflow') {
                this.#setInvalid({ rangeUnderflow: true }, `Value must be ${this.min} or later.`);
                return;
            }
            if (rangeState === 'overflow') {
                this.#setInvalid({ rangeOverflow: true }, `Value must be ${this.max} or earlier.`);
                return;
            }
            if (this.#hasStepMismatch(valueSeconds)) {
                this.#setInvalid({ stepMismatch: true }, 'Enter a valid time step.');
                return;
            }
        }

        this.#input.removeAttribute('aria-invalid');
        this.#internals.setValidity({});
    }

    /**
     * @param {ValidityStateFlags} flags
     * @param {string} message
     */
    #setInvalid(flags, message) {
        if (!this.#input) return;
        this.#input.setAttribute('aria-invalid', 'true');
        this.#internals.setValidity(flags, message, this.#input);
    }

    #renderRows() {
        if (!this.#listEl || !this.#emptyEl) return;
        for (const row of this.#rows) row.remove();
        this.#rows = [];

        const options = this.#timeOptions();
        for (let index = 0; index < options.length; index++) {
            const option = options[index];
            const row = document.createElement('button');
            row.type = 'button';
            row.className = OPTION_CLASS;
            row.id = `${this.#idPrefix}-opt-${index}`;
            row.dataset.value = option.value;
            row.setAttribute('role', 'option');

            const label = document.createElement('span');
            label.className = OPTION_LABEL_CLASS;
            label.textContent = option.label;
            row.append(label, createCheckIcon());

            this.#listEl.insertBefore(row, this.#emptyEl);
            this.#rows.push(row);
        }

        this.#emptyEl.hidden = options.length !== 0;
        this.#setActive(null);
        this.#refreshSelectedRows();
    }

    /** @returns {TimeOption[]} */
    #timeOptions() {
        const datalist = this.list;
        if (datalist) return this.#datalistOptions(datalist);

        const step = this.#listStepSeconds();
        /** @type {TimeOption[]} */
        const options = [];
        let valueSeconds = 0;
        let guard = 0;
        while (valueSeconds < DAY_SECONDS && guard < MAX_LIST_OPTIONS) {
            const roundedSeconds = Math.round(valueSeconds);
            if (this.#isInAllowedRange(roundedSeconds)) {
                const value = formatTime(roundedSeconds, this.seconds);
                options.push({ value, label: value });
            }
            valueSeconds += step;
            guard++;
        }
        return options;
    }

    /**
     * @param {HTMLDataListElement} datalist
     * @returns {TimeOption[]}
     */
    #datalistOptions(datalist) {
        /** @type {TimeOption[]} */
        const options = [];
        const seen = new Set();
        for (const option of datalist.options) {
            const value = this.#normalizeValue(option.value);
            if (!value || seen.has(value)) continue;
            const seconds = parseTime(value, { withSeconds: true, lenient: false });
            if (seconds == null || !this.#isInAllowedRange(seconds)) continue;
            seen.add(value);
            options.push({ value, label: option.label || option.textContent || value });
        }
        return options;
    }

    #listStepSeconds() {
        let step = this.#stepSeconds() ?? DEFAULT_STEP_SECONDS;
        if (!this.seconds) step = Math.max(DEFAULT_STEP_SECONDS, Math.ceil(step / 60) * 60);
        if (DAY_SECONDS / step > MAX_LIST_OPTIONS) step = Math.ceil(DAY_SECONDS / MAX_LIST_OPTIONS);
        if (!this.seconds) step = Math.max(DEFAULT_STEP_SECONDS, Math.ceil(step / 60) * 60);
        return Math.max(1, step);
    }

    /** @returns {number | null} */
    #stepSeconds() {
        const raw = this.getAttribute('step');
        if (raw == null || raw === '') return DEFAULT_STEP_SECONDS;
        if (raw === 'any') return null;
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : DEFAULT_STEP_SECONDS;
    }

    /** @returns {number | null} */
    #minSeconds() {
        return parseTime(this.min, { withSeconds: true, lenient: false });
    }

    /** @returns {number | null} */
    #maxSeconds() {
        return parseTime(this.max, { withSeconds: true, lenient: false });
    }

    /** @param {number} valueSeconds */
    #rangeState(valueSeconds) {
        const min = this.#minSeconds();
        const max = this.#maxSeconds();
        if (min == null && max == null) return '';
        if (min != null && max != null && min > max) {
            if (valueSeconds >= min || valueSeconds <= max) return '';
            return 'underflow';
        }
        if (min != null && valueSeconds < min) return 'underflow';
        if (max != null && valueSeconds > max) return 'overflow';
        return '';
    }

    /** @param {number} valueSeconds */
    #isInAllowedRange(valueSeconds) {
        return this.#rangeState(valueSeconds) === '';
    }

    /** @param {number} valueSeconds */
    #hasStepMismatch(valueSeconds) {
        const step = this.#stepSeconds();
        if (step == null) return false;
        const base = this.#minSeconds()
            ?? parseTime(this.defaultValue, { withSeconds: true, lenient: false })
            ?? 0;
        const rawRemainder = ((valueSeconds - base) % step + step) % step;
        return rawRemainder > STEP_EPSILON && Math.abs(rawRemainder - step) > STEP_EPSILON;
    }

    /** @param {number} amount */
    #stepBy(amount) {
        if (!Number.isFinite(amount)) amount = 1;
        const step = this.#stepSeconds() ?? DEFAULT_STEP_SECONDS;
        const current = parseTime(this.#value, { withSeconds: true, lenient: false });
        const base = current ?? this.#minSeconds() ?? 0;
        let next = base + amount * step;
        next = ((next % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
        if (!this.seconds) next = Math.round(next / 60) * 60;
        next = ((next % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
        this.#applyValue(formatTime(next, this.seconds), { syncText: true });
        this.#lastCommittedValue = this.#value;
    }

    #visibleRows() {
        return this.#rows;
    }

    /** @param {HTMLButtonElement | null} row */
    #setActive(row) {
        if (!this.#input) return;
        if (this.#activeId) {
            const previous = this.#listEl?.querySelector(`#${cssEscape(this.#activeId)}`);
            previous?.classList.remove('-active');
        }
        if (row) {
            row.classList.add('-active');
            this.#activeId = row.id;
            this.#input.setAttribute('aria-activedescendant', row.id);
            this.#scrollRowIntoList(row, 'nearest');
        } else {
            this.#activeId = '';
            this.#input.removeAttribute('aria-activedescendant');
        }
    }

    /**
     * Scroll the list container so the row is visible, WITHOUT bubbling
     * the scroll up to ancestor scroll containers (Element.scrollIntoView
     * walks all ancestors up to the document, which would scroll the page
     * when the popover opens). Modifies only `#listEl.scrollTop`.
     *
     * @param {HTMLElement} row
     * @param {'nearest' | 'center'} mode
     */
    #scrollRowIntoList(row, mode) {
        const list = this.#listEl;
        if (!list) return;
        const listRect = list.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        if (mode === 'center') {
            const target = rowRect.top - listRect.top - (listRect.height - rowRect.height) / 2;
            list.scrollTop += target;
            return;
        }
        if (rowRect.top < listRect.top) {
            list.scrollTop -= listRect.top - rowRect.top;
        } else if (rowRect.bottom > listRect.bottom) {
            list.scrollTop += rowRect.bottom - listRect.bottom;
        }
    }

    /** @param {1 | -1} delta */
    #moveActive(delta) {
        const rows = this.#visibleRows();
        if (rows.length === 0) return;
        const index = this.#activeId ? rows.findIndex((row) => row.id === this.#activeId) : -1;
        const next = index < 0
            ? (delta > 0 ? rows[0] : rows[rows.length - 1])
            : rows[(index + delta + rows.length) % rows.length];
        this.#setActive(next);
    }

    #activateActive() {
        if (!this.#activeId) return;
        const row = this.#rows.find((candidate) => candidate.id === this.#activeId);
        if (row) this.#selectRow(row);
    }

    #refreshSelectedRows() {
        for (const row of this.#rows) {
            row.setAttribute('aria-selected', row.dataset.value === this.#value ? 'true' : 'false');
        }
    }

    /** @param {HTMLButtonElement} row */
    #selectRow(row) {
        const value = row.dataset.value ?? '';
        const changed = this.#setValueFromString(value, { syncText: true });
        if (changed) {
            this.#dispatchInput();
            this.#dispatchChangeIfNeeded();
        }
        this.#close();
        this.#input?.focus();
    }

    #open() {
        if (!this.#isMutable()) return;
        this.#renderRows();
        try {
            if (!this.open) {
                /** @type {any} */ (this.#popover)?.showPopover({ source: this.#fieldEl ?? undefined });
            }
        } catch (error) {
            if (DEV) {
                // eslint-disable-next-line no-console
                console.debug('<neon-timepicker>: showPopover failed', error);
            }
        }
    }

    #close() {
        try {
            if (this.open) this.#popover?.hidePopover();
        } catch (error) {
            if (DEV) {
                // eslint-disable-next-line no-console
                console.debug('<neon-timepicker>: hidePopover failed', error);
            }
        }
    }

    #onInput = (/** @type {Event} */ event) => {
        event.stopPropagation();
        const next = this.#readInputValue();
        this.#applyValue(next ?? '', { syncText: false });
        this.#dispatchInput();
    };

    #onInputChange = (/** @type {Event} */ event) => {
        event.stopPropagation();
        this.#commitInputValue();
    };

    #onInputKeydown = (/** @type {KeyboardEvent} */ event) => {
        if (!this.#isMutable()) return;
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                if (!this.open) this.#open();
                this.#moveActive(1);
                return;
            case 'ArrowUp':
                event.preventDefault();
                if (!this.open) this.#open();
                this.#moveActive(-1);
                return;
            case 'Enter':
                if (this.open) {
                    event.preventDefault();
                    this.#activateActive();
                }
                return;
            case 'Escape':
                if (this.open) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.#close();
                }
                return;
            case 'Tab':
                this.#commitInputValue();
                this.#close();
                return;
        }
    };

    #onTriggerClick = (/** @type {MouseEvent} */ event) => {
        event.preventDefault();
        if (!this.#isMutable()) return;
        if (this.open) this.#close();
        else this.#open();
        this.#input?.focus();
    };

    #onClearClick = (/** @type {MouseEvent} */ event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!this.#isMutable()) return;
        const hadText = (this.#input?.value.trim() ?? '') !== '';
        if (!hadText && this.#value === '') return;
        this.#applyValue('', { syncText: true });
        this.#dispatchInput();
        this.#dispatchChangeIfNeeded();
        this.#input?.focus();
    };

    #onListClick = (/** @type {MouseEvent} */ event) => {
        const target = /** @type {Element | null} */ (event.target);
        const row = /** @type {HTMLButtonElement | null} */ (target?.closest(`.${OPTION_CLASS}`) ?? null);
        if (!row) return;
        this.#selectRow(row);
    };

    #onPopoverToggle = (/** @type {ToggleEvent} */ event) => {
        const open = event.newState === 'open';
        this.#input?.setAttribute('aria-expanded', open ? 'true' : 'false');
        this.#triggerEl?.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            const selected = this.#rows.find((row) => row.dataset.value === this.#value) ?? null;
            this.#setActive(selected ?? this.#visibleRows()[0] ?? null);
            queueMicrotask(() => {
                // `preventScroll` keeps the document from jumping when
                // the popover opens far from the viewport center.
                this.#input?.focus({ preventScroll: true });
                if (selected) this.#scrollRowIntoList(selected, 'center');
            });
        } else {
            this.#setActive(null);
        }
    };
}

/**
 * @param {string} raw
 * @param {{ withSeconds: boolean, lenient: boolean }} options
 * @returns {number | null}
 */
function parseTime(raw, { withSeconds, lenient }) {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const hourPattern = lenient ? '\\d{1,2}' : '\\d{2}';
    const secondsPattern = withSeconds ? '(?::(\\d{2}))?' : '';
    const pattern = new RegExp(`^(${hourPattern}):(\\d{2})${secondsPattern}$`);
    const match = pattern.exec(trimmed);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = match[3] == null ? 0 : Number(match[3]);
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
    return hours * 3600 + minutes * 60 + seconds;
}

/**
 * @param {number} valueSeconds
 * @param {boolean} withSeconds
 */
function formatTime(valueSeconds, withSeconds) {
    const total = ((Math.round(valueSeconds) % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const base = `${pad2(hours)}:${pad2(minutes)}`;
    return withSeconds ? `${base}:${pad2(seconds)}` : base;
}

/** @param {number} value */
function pad2(value) {
    return String(value).padStart(2, '0');
}

function createClockIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', ICON_CLASS);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.75');
    svg.setAttribute('aria-hidden', 'true');
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '9');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', 'M12 7v5l3 2');
    svg.append(circle, path);
    return svg;
}

function createXIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', 'M6 6l12 12M18 6L6 18');
    svg.appendChild(path);
    return svg;
}

function createCheckIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', OPTION_CHECK_CLASS);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', 'M4.5 12.75l6 6 9-13.5');
    svg.appendChild(path);
    return svg;
}

/**
 * @param {string} id
 * @returns {string}
 */
function cssEscape(id) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(id);
    return id.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

/**
 * Define `<neon-timepicker>` if it has not been registered yet. Idempotent.
 *
 * @param {string} [tagName] Optional override tag name. Defaults to `neon-timepicker`.
 */
export function registerTimepicker(tagName = 'neon-timepicker') {
    if (typeof globalThis.customElements === 'undefined') return;
    if (!globalThis.customElements.get(tagName)) {
        globalThis.customElements.define(tagName, NeonTimepickerElement);
    }
}

// Side-effect register on import.
registerTimepicker();