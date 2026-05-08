/**
 * `<neon-datepicker>` - form-associated date input built on top of the
 * theme's `.datepicker` markup.
 *
 * The public API follows native `<input type="date">` where practical:
 * `value`, `defaultValue`, `min`, `max`, `step`, `required`, `disabled`,
 * `readOnly`, `valueAsNumber`, `valueAsDate`, `stepUp()` and `stepDown()`.
 * Values use `YYYY-MM-DD`.
 *
 * Light DOM only - see docs/adr/0001-rendering-mode.md.
 */
import { DEV } from 'esm-env';

let nextId = 0;

const FIELD_CLASS = 'datepicker__field';
const INPUT_CLASS = 'datepicker__input';
const CLEAR_CLASS = 'datepicker__clear';
const TRIGGER_CLASS = 'datepicker__trigger';
const ICON_CLASS = 'datepicker__icon';
const POPOVER_CLASS = 'datepicker__popover';
const NAV_CLASS = 'datepicker__nav';
const NAV_BUTTON_CLASS = 'datepicker__nav-btn';
const VIEW_SWITCH_CLASS = 'datepicker__view-switch';
const GRID_CLASS = 'datepicker__grid';
const WEEKDAY_CLASS = 'datepicker__weekday';
const CELL_CLASS = 'datepicker__cell';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STEP_DAYS = 1;
const STEP_EPSILON = 1e-7;

const MONTH_LONG = /** @type {const} */ ([
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
]);
const MONTH_SHORT = /** @type {const} */ ([
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
]);
const WEEKDAY_SHORT = /** @type {const} */ (['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);

/** @typedef {'days' | 'months' | 'years'} DatepickerView */

export class NeonDatepickerElement extends HTMLElement {
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
    /** @type {string} */ #value = '';
    /** @type {string} */ #lastCommittedValue = '';
    /** @type {string} */ #idPrefix = '';
    /** @type {string} */ #popoverId = '';
    /** @type {DatepickerView} */ #view = 'days';
    /** @type {number} */ #cursorDateMs = todayDateMs();
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
        this.#idPrefix = `neon-datepicker-${id}`;
        this.#popoverId = `${this.#idPrefix}-pop`;

        if (!this.classList.contains('datepicker')) this.classList.add('datepicker');

        this.#buildUi();
        this.#setValueFromString(this.defaultValue, { syncText: true });
        this.#lastCommittedValue = this.#value;
        this.#syncInputAttributes();
        this.#renderCalendar();
        this.#updateValidity();

        const controller = new AbortController();
        this.#listeners = controller;
        const opts = { signal: controller.signal };

        this.#input?.addEventListener('input', /** @type {EventListener} */ (this.#onInput), opts);
        this.#input?.addEventListener('change', /** @type {EventListener} */ (this.#onInputChange), opts);
        this.#input?.addEventListener('keydown', /** @type {EventListener} */ (this.#onInputKeydown), opts);
        this.#triggerEl?.addEventListener('click', /** @type {EventListener} */ (this.#onTriggerClick), opts);
        this.#clearEl?.addEventListener('click', /** @type {EventListener} */ (this.#onClearClick), opts);
        this.#popover?.addEventListener('click', /** @type {EventListener} */ (this.#onPopoverClick), opts);
        this.#popover?.addEventListener('keydown', /** @type {EventListener} */ (this.#onPopoverKeydown), opts);
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
            case 'min':
            case 'max':
            case 'step':
                this.#renderCalendar();
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
        return 'date';
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

    get valueAsNumber() {
        const dateMs = parseDate(this.#value);
        return dateMs == null ? Number.NaN : dateMs;
    }

    /** @param {number} value */
    set valueAsNumber(value) {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) {
            this.value = '';
            return;
        }
        this.value = formatDate(startOfUtcDay(numberValue));
    }

    get valueAsDate() {
        const dateMs = parseDate(this.#value);
        return dateMs == null ? null : new Date(dateMs);
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
        this.value = formatDate(dateMsFromParts(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
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
        input.setAttribute('aria-haspopup', 'dialog');
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-controls', this.#popoverId);

        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = CLEAR_CLASS;
        clear.setAttribute('aria-label', 'Clear date');
        clear.style.display = 'none';
        clear.tabIndex = -1;
        clear.appendChild(createXIcon());

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = TRIGGER_CLASS;
        trigger.setAttribute('aria-label', 'Open calendar');
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-controls', this.#popoverId);
        trigger.setAttribute('aria-expanded', 'false');
        trigger.appendChild(createCalendarIcon());

        const popover = document.createElement('div');
        popover.id = this.#popoverId;
        popover.className = POPOVER_CLASS;
        popover.setAttribute('popover', '');
        popover.setAttribute('role', 'dialog');
        popover.style.setProperty('position-anchor', anchorName);

        field.append(input, clear, trigger);

        this.#fieldEl = field;
        this.#input = input;
        this.#clearEl = clear;
        this.#triggerEl = trigger;
        this.#popover = popover;

        this.append(field, popover);
    }

    #syncInputAttributes() {
        if (!this.#input || !this.#triggerEl || !this.#clearEl) return;

        const disabled = this.#isEffectivelyDisabled();
        const immutable = disabled || this.readOnly;
        this.#input.disabled = disabled;
        this.#input.readOnly = this.readOnly;
        this.#input.required = this.required;
        this.#input.placeholder = this.getAttribute('placeholder') ?? 'YYYY-MM-DD';
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
        const dateMs = parseDate(trimmed);
        return dateMs == null ? '' : formatDate(dateMs);
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
        const dateMs = parseDate(value);
        if (dateMs != null) this.#cursorDateMs = firstOfMonth(dateMs);
        if (syncText && this.#input) this.#input.value = value;
        this.#internals.setFormValue(this.#value, this.#value);
        this.#syncClearVisibility();
        this.#renderCalendar();
        this.#updateValidity();
        return previous !== this.#value;
    }

    /** @returns {string | null} */
    #readInputValue() {
        const raw = this.#input?.value.trim() ?? '';
        if (raw === '') return '';
        const dateMs = parseDate(raw);
        return dateMs == null ? null : formatDate(dateMs);
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
            this.#setInvalid({ badInput: true }, 'Enter a valid date.');
            return;
        }

        if (this.required && this.#value === '') {
            this.#setInvalid({ valueMissing: true }, 'Please fill out this field.');
            return;
        }

        const valueDateMs = parseDate(this.#value);
        if (valueDateMs != null) {
            if (this.#isRangeUnderflow(valueDateMs)) {
                this.#setInvalid({ rangeUnderflow: true }, `Value must be ${this.min} or later.`);
                return;
            }
            if (this.#isRangeOverflow(valueDateMs)) {
                this.#setInvalid({ rangeOverflow: true }, `Value must be ${this.max} or earlier.`);
                return;
            }
            if (this.#hasStepMismatch(valueDateMs)) {
                this.#setInvalid({ stepMismatch: true }, 'Enter a valid date step.');
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

    #renderCalendar() {
        if (!this.#popover) return;
        this.#popover.replaceChildren(
            this.#renderNav(),
            this.#view === 'days'
                ? this.#renderDays()
                : this.#view === 'months'
                    ? this.#renderMonths()
                    : this.#renderYears(),
        );
    }

    #renderNav() {
        const nav = document.createElement('header');
        nav.className = NAV_CLASS;

        const previous = document.createElement('button');
        previous.type = 'button';
        previous.className = NAV_BUTTON_CLASS;
        previous.dataset.dir = 'prev';
        previous.dataset.dpPrev = '';
        previous.setAttribute('aria-label', this.#previousLabel());
        previous.appendChild(createChevronIcon('prev'));

        const viewSwitch = document.createElement('button');
        viewSwitch.type = 'button';
        viewSwitch.className = VIEW_SWITCH_CLASS;
        viewSwitch.dataset.dpSwitch = '';
        viewSwitch.textContent = this.#navLabel();

        const next = document.createElement('button');
        next.type = 'button';
        next.className = NAV_BUTTON_CLASS;
        next.dataset.dir = 'next';
        next.dataset.dpNext = '';
        next.setAttribute('aria-label', this.#nextLabel());
        next.appendChild(createChevronIcon('next'));

        nav.append(previous, viewSwitch, next);
        return nav;
    }

    #renderDays() {
        const grid = document.createElement('div');
        grid.className = `${GRID_CLASS} -days`;

        for (const weekday of WEEKDAY_SHORT) {
            const item = document.createElement('div');
            item.className = WEEKDAY_CLASS;
            item.textContent = weekday;
            grid.appendChild(item);
        }

        const { year, month } = partsFromDateMs(this.#cursorDateMs);
        const first = dateMsFromParts(year, month, 1);
        const firstWeekday = (new Date(first).getUTCDay() + 6) % 7;
        const daysInMonth = new Date(dateMsFromParts(year, month + 1, 0)).getUTCDate();

        for (let offset = firstWeekday; offset > 0; offset--) {
            grid.appendChild(this.#renderDayCell(dateMsFromParts(year, month, 1 - offset), true));
        }
        for (let day = 1; day <= daysInMonth; day++) {
            grid.appendChild(this.#renderDayCell(dateMsFromParts(year, month, day), false));
        }
        const total = firstWeekday + daysInMonth;
        const trailing = (7 - (total % 7)) % 7;
        for (let offset = 1; offset <= trailing; offset++) {
            grid.appendChild(this.#renderDayCell(dateMsFromParts(year, month + 1, offset), true));
        }

        return grid;
    }

    /**
     * @param {number} dateMs
     * @param {boolean} muted
     */
    #renderDayCell(dateMs, muted) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = CELL_CLASS;
        cell.dataset.date = formatDate(dateMs);
        const { day } = partsFromDateMs(dateMs);
        cell.textContent = String(day);
        if (muted) cell.classList.add('-muted');
        if (dateMs === todayDateMs()) {
            cell.classList.add('-today');
            cell.dataset.today = '';
        }
        if (cell.dataset.date === this.#value) {
            cell.classList.add('-selected');
            cell.setAttribute('aria-pressed', 'true');
        }
        if (!this.#isDateSelectable(dateMs)) {
            cell.disabled = true;
            cell.setAttribute('aria-disabled', 'true');
        }
        return cell;
    }

    #renderMonths() {
        const grid = document.createElement('div');
        grid.className = `${GRID_CLASS} -months`;
        const { year } = partsFromDateMs(this.#cursorDateMs);
        const selected = parseDate(this.#value);
        const selectedParts = selected == null ? null : partsFromDateMs(selected);
        const todayParts = partsFromDateMs(todayDateMs());

        for (let month = 0; month < 12; month++) {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = CELL_CLASS;
            cell.dataset.month = String(month);
            cell.textContent = MONTH_SHORT[month];
            if (todayParts.year === year && todayParts.month === month) cell.classList.add('-today');
            if (selectedParts && selectedParts.year === year && selectedParts.month === month) {
                cell.classList.add('-selected');
                cell.setAttribute('aria-pressed', 'true');
            }
            grid.appendChild(cell);
        }
        return grid;
    }

    #renderYears() {
        const grid = document.createElement('div');
        grid.className = `${GRID_CLASS} -years`;
        const { year } = partsFromDateMs(this.#cursorDateMs);
        const startYear = year - (year % 12) - 1;
        const selected = parseDate(this.#value);
        const selectedYear = selected == null ? null : partsFromDateMs(selected).year;
        const todayYear = partsFromDateMs(todayDateMs()).year;

        for (let index = 0; index < 16; index++) {
            const cellYear = startYear + index;
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = CELL_CLASS;
            cell.dataset.year = String(cellYear);
            cell.textContent = String(cellYear);
            if (index === 0 || index > 12) cell.classList.add('-muted');
            if (cellYear === todayYear) cell.classList.add('-today');
            if (cellYear === selectedYear) {
                cell.classList.add('-selected');
                cell.setAttribute('aria-pressed', 'true');
            }
            grid.appendChild(cell);
        }
        return grid;
    }

    #navLabel() {
        const { year, month } = partsFromDateMs(this.#cursorDateMs);
        if (this.#view === 'days') return `${MONTH_LONG[month]} ${year}`;
        if (this.#view === 'months') return String(year);
        const startYear = year - (year % 12);
        return `${startYear} - ${startYear + 11}`;
    }

    #previousLabel() {
        if (this.#view === 'days') return 'Previous month';
        if (this.#view === 'months') return 'Previous year';
        return 'Previous years';
    }

    #nextLabel() {
        if (this.#view === 'days') return 'Next month';
        if (this.#view === 'months') return 'Next year';
        return 'Next years';
    }

    /** @param {number} dateMs */
    #isDateSelectable(dateMs) {
        return !this.#isRangeUnderflow(dateMs)
            && !this.#isRangeOverflow(dateMs)
            && !this.#hasStepMismatch(dateMs);
    }

    /** @returns {number | null} */
    #minDateMs() {
        return parseDate(this.min);
    }

    /** @returns {number | null} */
    #maxDateMs() {
        return parseDate(this.max);
    }

    /** @param {number} dateMs */
    #isRangeUnderflow(dateMs) {
        const min = this.#minDateMs();
        return min != null && dateMs < min;
    }

    /** @param {number} dateMs */
    #isRangeOverflow(dateMs) {
        const max = this.#maxDateMs();
        return max != null && dateMs > max;
    }

    /** @returns {number | null} */
    #stepDays() {
        const raw = this.getAttribute('step');
        if (raw == null || raw === '') return DEFAULT_STEP_DAYS;
        if (raw === 'any') return null;
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : DEFAULT_STEP_DAYS;
    }

    /** @param {number} dateMs */
    #hasStepMismatch(dateMs) {
        const step = this.#stepDays();
        if (step == null) return false;
        const stepMs = step * DAY_MS;
        const base = this.#minDateMs()
            ?? parseDate(this.defaultValue)
            ?? 0;
        const rawRemainder = ((dateMs - base) % stepMs + stepMs) % stepMs;
        return rawRemainder > STEP_EPSILON && Math.abs(rawRemainder - stepMs) > STEP_EPSILON;
    }

    /** @param {number} amount */
    #stepBy(amount) {
        if (!Number.isFinite(amount)) amount = 1;
        const step = this.#stepDays() ?? DEFAULT_STEP_DAYS;
        const current = parseDate(this.#value);
        const base = current ?? this.#minDateMs() ?? 0;
        const next = base + amount * step * DAY_MS;
        this.#applyValue(formatDate(next), { syncText: true });
        this.#lastCommittedValue = this.#value;
    }

    #open() {
        if (!this.#isMutable()) return;
        this.#view = 'days';
        const selected = parseDate(this.#value);
        this.#cursorDateMs = selected == null ? firstOfMonth(todayDateMs()) : firstOfMonth(selected);
        this.#renderCalendar();
        try {
            if (!this.open) {
                /** @type {any} */ (this.#popover)?.showPopover({ source: this.#fieldEl ?? undefined });
            }
        } catch (error) {
            if (DEV) {
                // eslint-disable-next-line no-console
                console.debug('<neon-datepicker>: showPopover failed', error);
            }
        }
    }

    #close() {
        try {
            if (this.open) this.#popover?.hidePopover();
        } catch (error) {
            if (DEV) {
                // eslint-disable-next-line no-console
                console.debug('<neon-datepicker>: hidePopover failed', error);
            }
        }
    }

    #focusCalendarCell() {
        const selected = this.#value
            ? this.#popover?.querySelector(`[data-date="${cssEscape(this.#value)}"]`)
            : null;
        const target = selected
            ?? this.#popover?.querySelector('[data-today]')
            ?? this.#popover?.querySelector(`.${CELL_CLASS}:not(:disabled)`);
        if (target instanceof HTMLElement) target.focus();
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
                this.#open();
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

    #onPopoverClick = (/** @type {MouseEvent} */ event) => {
        const target = /** @type {Element | null} */ (event.target);
        if (!target) return;

        if (target.closest('[data-dp-prev]')) {
            this.#moveCursor(-1);
            return;
        }
        if (target.closest('[data-dp-next]')) {
            this.#moveCursor(1);
            return;
        }
        if (target.closest('[data-dp-switch]')) {
            this.#view = this.#view === 'days' ? 'months' : this.#view === 'months' ? 'years' : 'days';
            this.#renderCalendar();
            return;
        }

        const dayCell = /** @type {HTMLButtonElement | null} */ (target.closest('[data-date]'));
        if (dayCell) {
            if (dayCell.disabled) return;
            const value = dayCell.dataset.date ?? '';
            const changed = this.#setValueFromString(value, { syncText: true });
            if (changed) {
                this.#dispatchInput();
                this.#dispatchChangeIfNeeded();
            }
            this.#close();
            this.#input?.focus();
            return;
        }

        const monthCell = /** @type {HTMLButtonElement | null} */ (target.closest('[data-month]'));
        if (monthCell) {
            const month = Number(monthCell.dataset.month);
            const { year } = partsFromDateMs(this.#cursorDateMs);
            this.#cursorDateMs = dateMsFromParts(year, month, 1);
            this.#view = 'days';
            this.#renderCalendar();
            queueMicrotask(() => this.#focusCalendarCell());
            return;
        }

        const yearCell = /** @type {HTMLButtonElement | null} */ (target.closest('[data-year]'));
        if (yearCell) {
            const year = Number(yearCell.dataset.year);
            const { month } = partsFromDateMs(this.#cursorDateMs);
            this.#cursorDateMs = dateMsFromParts(year, month, 1);
            this.#view = 'months';
            this.#renderCalendar();
        }
    };

    #onPopoverKeydown = (/** @type {KeyboardEvent} */ event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            this.#close();
            this.#input?.focus();
            return;
        }
        const target = /** @type {Element | null} */ (event.target);
        const cell = /** @type {HTMLElement | null} */ (target?.closest(`.${CELL_CLASS}`) ?? null);
        if (!cell) return;
        const grid = cell.parentElement;
        if (!grid) return;
        const cells = /** @type {HTMLElement[]} */ (Array.from(grid.querySelectorAll(`.${CELL_CLASS}:not(:disabled)`)));
        const index = cells.indexOf(cell);
        if (index === -1) return;
        const columns = grid.classList.contains('-days') ? 7 : 4;
        const isRtl = getComputedStyle(grid).direction === 'rtl';
        const left = isRtl ? 1 : -1;
        const right = -left;
        let nextIndex = index;
        switch (event.key) {
            case 'ArrowLeft':
                nextIndex = index + left;
                break;
            case 'ArrowRight':
                nextIndex = index + right;
                break;
            case 'ArrowUp':
                nextIndex = index - columns;
                break;
            case 'ArrowDown':
                nextIndex = index + columns;
                break;
            case 'Home':
                nextIndex = index - (index % columns);
                break;
            case 'End':
                nextIndex = index + (columns - 1 - (index % columns));
                break;
            default:
                return;
        }
        event.preventDefault();
        cells[nextIndex]?.focus();
    };

    #onPopoverToggle = (/** @type {ToggleEvent} */ event) => {
        const open = event.newState === 'open';
        this.#input?.setAttribute('aria-expanded', open ? 'true' : 'false');
        this.#triggerEl?.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) queueMicrotask(() => this.#focusCalendarCell());
    };

    /** @param {1 | -1} direction */
    #moveCursor(direction) {
        const { year, month } = partsFromDateMs(this.#cursorDateMs);
        if (this.#view === 'days') {
            this.#cursorDateMs = dateMsFromParts(year, month + direction, 1);
        } else if (this.#view === 'months') {
            this.#cursorDateMs = dateMsFromParts(year + direction, month, 1);
        } else {
            this.#cursorDateMs = dateMsFromParts(year + direction * 12, month, 1);
        }
        this.#renderCalendar();
    }
}

/** @param {string} raw */
function parseDate(raw) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < 1 || month < 1 || month > 12 || day < 1) return null;
    const dateMs = dateMsFromParts(year, month - 1, day);
    const parts = partsFromDateMs(dateMs);
    if (parts.year !== year || parts.month !== month - 1 || parts.day !== day) return null;
    return dateMs;
}

/** @param {number} dateMs */
function formatDate(dateMs) {
    const { year, month, day } = partsFromDateMs(dateMs);
    if (year < 1 || year > 9999) return '';
    return `${String(year).padStart(4, '0')}-${pad2(month + 1)}-${pad2(day)}`;
}

/**
 * @param {number} year
 * @param {number} month
 * @param {number} day
 */
function dateMsFromParts(year, month, day) {
    const date = new Date(Date.UTC(0, month, day));
    date.setUTCFullYear(year);
    return startOfUtcDay(date.getTime());
}

/** @param {number} dateMs */
function partsFromDateMs(dateMs) {
    const date = new Date(dateMs);
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth(),
        day: date.getUTCDate(),
    };
}

/** @param {number} dateMs */
function firstOfMonth(dateMs) {
    const { year, month } = partsFromDateMs(dateMs);
    return dateMsFromParts(year, month, 1);
}

/** @param {number} dateMs */
function startOfUtcDay(dateMs) {
    return Math.floor(dateMs / DAY_MS) * DAY_MS;
}

function todayDateMs() {
    const today = new Date();
    return dateMsFromParts(today.getFullYear(), today.getMonth(), today.getDate());
}

/** @param {number} value */
function pad2(value) {
    return String(value).padStart(2, '0');
}

function createCalendarIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', ICON_CLASS);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.75');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0V11.25A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5');
    svg.appendChild(path);
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

/** @param {'prev' | 'next'} direction */
function createChevronIcon(direction) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', direction === 'prev' ? 'M15.75 19.5 8.25 12l7.5-7.5' : 'm8.25 4.5 7.5 7.5-7.5 7.5');
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
 * Define `<neon-datepicker>` if it has not been registered yet. Idempotent.
 *
 * @param {string} [tagName] Optional override tag name. Defaults to `neon-datepicker`.
 */
export function registerDatepicker(tagName = 'neon-datepicker') {
    if (typeof globalThis.customElements === 'undefined') return;
    if (!globalThis.customElements.get(tagName)) {
        globalThis.customElements.define(tagName, NeonDatepickerElement);
    }
}

// Side-effect register on import.
registerDatepicker();