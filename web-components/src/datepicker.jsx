/**
 * `<neon-datepicker>` - form-associated date input built on top of the
 * theme's `.datepicker` markup.
 *
 * The public API follows native `<input type="date">` where practical:
 * `value`, `defaultValue`, `min`, `max`, `step`, `required`, `disabled`,
 * `readOnly`, `valueAsNumber`, `valueAsDate`, `stepUp()` and `stepDown()`.
 *
 * Per ADR 0001 the element renders into Light DOM (no shadow root).
 *
 * Rewritten on `@slimlib/element`'s `defineElement` form mirroring
 * `combobox.jsx`. Public API is assigned directly onto the host inside
 * the render closure; attribute observation flows through the
 * `attributes()` middleware. Property writes commit synchronously by
 * running their side effects directly in the setter.
 */
import { DEV } from 'esm-env';

import {
    attributes,
    booleanAttribute,
    defineElement,
    formAssociated,
    internals,
    onConnect,
    onDisconnect,
    onFormDisabled,
    onFormReset,
    onFormStateRestore,
    onMount,
    props,
    withInternals,
    withValidation,
} from '@slimlib/element';
import { effect, signal } from '@slimlib/store';

import { SvgIcon } from './svg-icon.jsx';
import {
    defineBooleanProperty,
    defineFormControlApi,
    defineReadonlyProperty,
    defineStringProperty,
    defineWritableProperty,
    parseString,
    reflectStringAttr,
} from './form-control-utils.js';
import xMark from '@neon-kit/icons/outline/x-mark';
import chevronLeft from '@neon-kit/icons/outline/chevron-left';
import chevronRight from '@neon-kit/icons/outline/chevron-right';
import calendar from '@neon-kit/icons/outline/calendar';

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

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STEP_DAYS = 1;
const STEP_EPSILON = 1e-7;

const MONTH_LONG = /** @type {const} */ ([
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]);
const MONTH_SHORT = /** @type {const} */ ([
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]);
const WEEKDAY_SHORT = /** @type {const} */ (['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);

/** @typedef {'days' | 'months' | 'years'} DatepickerView */

/**
 * @param {HTMLElement} host
 */
const renderDatepicker = (host) => {
    const elementInternals = internals();

    const id = ++nextId;
    const idPrefix = `neon-datepicker-${id}`;
    const popoverId = `${idPrefix}-pop`;
    const anchorName = `--${idPrefix}-anchor`;

    if (!host.classList.contains('datepicker')) host.classList.add('datepicker');

    // ---- Reactive props and state ------------------------------------
    const state = props({
        value: '',
        min: '',
        max: '',
        step: '',
        placeholder: '',
        disabled: false,
        readonly: false,
        required: false,
        name: '',
        autocomplete: '',
        'data-clearable': false,
    });
    let lastCommittedValue = '';
    /** @type {import('@slimlib/store').Signal<DatepickerView>} */
    const view = signal(/** @type {DatepickerView} */ ('days'));
    const cursorDateMs = signal(todayDateMs());
    const formDisabled = signal(false);
    /** @type {AbortController | null} */
    let listeners = null;

    // ---- DOM ---------------------------------------------------------
    const input = /** @type {HTMLInputElement} */ (
        <input
            type="text"
            class={INPUT_CLASS}
            inputmode="numeric"
            autocomplete="off"
            role="combobox"
            aria-autocomplete="none"
            aria-haspopup="dialog"
            aria-expanded="false"
            aria-controls={popoverId}
        />
    );

    const clearEl = /** @type {HTMLButtonElement} */ (
        <button type="button" class={CLEAR_CLASS} aria-label="Clear date" tabindex="-1" />
    );
    clearEl.style.display = 'none';
    clearEl.appendChild(createXIcon());

    const triggerEl = /** @type {HTMLButtonElement} */ (
        <button
            type="button"
            class={TRIGGER_CLASS}
            aria-label="Open calendar"
            aria-haspopup="dialog"
            aria-controls={popoverId}
            aria-expanded="false"
        />
    );
    triggerEl.appendChild(createCalendarIcon());

    const fieldEl = /** @type {HTMLDivElement} */ (
        <div class={FIELD_CLASS}>{input}{clearEl}{triggerEl}</div>
    );
    fieldEl.style.setProperty('anchor-name', anchorName);

    const popover = /** @type {HTMLDivElement} */ (
        <div id={popoverId} class={POPOVER_CLASS} role="dialog" />
    );
    popover.setAttribute('popover', '');
    popover.style.setProperty('position-anchor', anchorName);

    // ---- Helpers -----------------------------------------------------

    const isEffectivelyDisabled = () => state.disabled || formDisabled();
    const isMutable = () => !isEffectivelyDisabled() && !state.readonly;
    const willValidateNow = () => !isEffectivelyDisabled() && !state.readonly
        && elementInternals.willValidate;

    const isPopoverOpen = () => popover.matches(':popover-open');

    /** @param {string} raw */
    const normalizeValue = (raw) => {
        const trimmed = raw.trim();
        if (trimmed === '') return '';
        const ms = parseDate(trimmed);
        return ms == null ? '' : formatDate(ms);
    };

    /** @returns {string | null} */
    const readInputValue = () => {
        const raw = input.value.trim();
        if (raw === '') return '';
        const ms = parseDate(raw);
        return ms == null ? null : formatDate(ms);
    };

    const minDateMs = () => parseDate(state.min);
    const maxDateMs = () => parseDate(state.max);

    /** @returns {number | null} */
    const stepDays = () => {
        const raw = state.step;
        if (raw === '') return DEFAULT_STEP_DAYS;
        if (raw === 'any') return null;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : DEFAULT_STEP_DAYS;
    };

    /** @param {number} dateMs */
    const isRangeUnderflow = (dateMs) => {
        const m = minDateMs();
        return m != null && dateMs < m;
    };

    /** @param {number} dateMs */
    const isRangeOverflow = (dateMs) => {
        const m = maxDateMs();
        return m != null && dateMs > m;
    };

    /** @param {number} dateMs */
    const hasStepMismatch = (dateMs) => {
        const step = stepDays();
        if (step == null) return false;
        const stepMs = step * DAY_MS;
        const base = minDateMs()
            ?? parseDate(host.getAttribute('value') ?? '')
            ?? 0;
        const rem = (((dateMs - base) % stepMs) + stepMs) % stepMs;
        return rem > STEP_EPSILON && Math.abs(rem - stepMs) > STEP_EPSILON;
    };

    /** @param {number} dateMs */
    const isDateSelectable = (dateMs) =>
        !isRangeUnderflow(dateMs) && !isRangeOverflow(dateMs) && !hasStepMismatch(dateMs);

    const syncClearVisibility = () => {
        const text = input.value.trim() || state.value;
        const visible = state['data-clearable'] && text !== '';
        clearEl.style.display = visible ? '' : 'none';
    };

    const syncInputAttributes = () => {
        const disabled = isEffectivelyDisabled();
        const immutable = disabled || state.readonly;
        input.disabled = disabled;
        input.readOnly = state.readonly;
        input.required = state.required;
        input.placeholder = state.placeholder || 'YYYY-MM-DD';
        input.setAttribute('autocomplete', state.autocomplete || 'off');
        if (state.required) input.setAttribute('aria-required', 'true');
        else input.removeAttribute('aria-required');

        triggerEl.disabled = immutable;
        clearEl.disabled = immutable;
        if (immutable) close();
        syncClearVisibility();
    };

    /**
     * @param {ValidityStateFlags} flags
     * @param {string} message
     */
    const setInvalid = (flags, message) => {
        input.setAttribute('aria-invalid', 'true');
        elementInternals.setValidity(flags, message, input);
    };

    const updateValidity = () => {
        if (!host.contains(input)) return;
        if (!willValidateNow()) {
            input.removeAttribute('aria-invalid');
            elementInternals.setValidity({});
            return;
        }

        const raw = input.value.trim();
        if (raw !== '' && readInputValue() == null) {
            setInvalid({ badInput: true }, 'Enter a valid date.');
            return;
        }

        if (state.required && state.value === '') {
            setInvalid({ valueMissing: true }, 'Please fill out this field.');
            return;
        }

        const ms = parseDate(state.value);
        if (ms != null) {
            if (isRangeUnderflow(ms)) {
                setInvalid({ rangeUnderflow: true }, `Value must be ${state.min} or later.`);
                return;
            }
            if (isRangeOverflow(ms)) {
                setInvalid({ rangeOverflow: true }, `Value must be ${state.max} or earlier.`);
                return;
            }
            if (hasStepMismatch(ms)) {
                setInvalid({ stepMismatch: true }, 'Enter a valid date step.');
                return;
            }
        }

        input.removeAttribute('aria-invalid');
        elementInternals.setValidity({});
    };

    // ---- Calendar rendering -----------------------------------------

    const navLabel = () => {
        const { year, month } = partsFromDateMs(cursorDateMs());
        const currentView = view();
        if (currentView === 'days') return `${MONTH_LONG[month]} ${year}`;
        if (currentView === 'months') return String(year);
        const start = year - (year % 12);
        return `${start} - ${start + 11}`;
    };

    const previousLabel = () => {
        const currentView = view();
        return currentView === 'days' ? 'Previous month' : currentView === 'months' ? 'Previous year' : 'Previous years';
    };
    const nextLabel = () => {
        const currentView = view();
        return currentView === 'days' ? 'Next month' : currentView === 'months' ? 'Next year' : 'Next years';
    };

    const renderNav = () => {
        const previous = document.createElement('button');
        previous.type = 'button';
        previous.className = NAV_BUTTON_CLASS;
        previous.dataset.dir = 'prev';
        previous.dataset.dpPrev = '';
        previous.setAttribute('aria-label', previousLabel());
        previous.appendChild(createChevronIcon('prev'));

        const viewSwitch = document.createElement('button');
        viewSwitch.type = 'button';
        viewSwitch.className = VIEW_SWITCH_CLASS;
        viewSwitch.dataset.dpSwitch = '';
        viewSwitch.textContent = navLabel();

        const next = document.createElement('button');
        next.type = 'button';
        next.className = NAV_BUTTON_CLASS;
        next.dataset.dir = 'next';
        next.dataset.dpNext = '';
        next.setAttribute('aria-label', nextLabel());
        next.appendChild(createChevronIcon('next'));

        const nav = document.createElement('header');
        nav.className = NAV_CLASS;
        nav.append(previous, viewSwitch, next);
        return nav;
    };

    /**
     * @param {number} dateMs
     * @param {boolean} muted
     */
    const renderDayCell = (dateMs, muted) => {
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
        if (cell.dataset.date === state.value) {
            cell.classList.add('-selected');
            cell.setAttribute('aria-pressed', 'true');
        }
        if (!isDateSelectable(dateMs)) {
            cell.disabled = true;
            cell.setAttribute('aria-disabled', 'true');
        }
        return cell;
    };

    const renderDays = () => {
        const grid = document.createElement('div');
        grid.className = `${GRID_CLASS} -days`;

        for (const weekday of WEEKDAY_SHORT) {
            const item = document.createElement('div');
            item.className = WEEKDAY_CLASS;
            item.textContent = weekday;
            grid.appendChild(item);
        }

        const { year, month } = partsFromDateMs(cursorDateMs());
        const first = dateMsFromParts(year, month, 1);
        const firstWeekday = (new Date(first).getUTCDay() + 6) % 7;
        const daysInMonth = new Date(dateMsFromParts(year, month + 1, 0)).getUTCDate();

        for (let off = firstWeekday; off > 0; off--) {
            grid.appendChild(renderDayCell(dateMsFromParts(year, month, 1 - off), true));
        }
        for (let d = 1; d <= daysInMonth; d++) {
            grid.appendChild(renderDayCell(dateMsFromParts(year, month, d), false));
        }
        const total = firstWeekday + daysInMonth;
        const trailing = (7 - (total % 7)) % 7;
        for (let off = 1; off <= trailing; off++) {
            grid.appendChild(renderDayCell(dateMsFromParts(year, month + 1, off), true));
        }
        return grid;
    };

    const renderMonths = () => {
        const grid = document.createElement('div');
        grid.className = `${GRID_CLASS} -months`;
        const { year } = partsFromDateMs(cursorDateMs());
        const sel = parseDate(state.value);
        const selParts = sel == null ? null : partsFromDateMs(sel);
        const todayParts = partsFromDateMs(todayDateMs());

        for (let month = 0; month < 12; month++) {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = CELL_CLASS;
            cell.dataset.month = String(month);
            cell.textContent = MONTH_SHORT[month];
            if (todayParts.year === year && todayParts.month === month) cell.classList.add('-today');
            if (selParts && selParts.year === year && selParts.month === month) {
                cell.classList.add('-selected');
                cell.setAttribute('aria-pressed', 'true');
            }
            grid.appendChild(cell);
        }
        return grid;
    };

    const renderYears = () => {
        const grid = document.createElement('div');
        grid.className = `${GRID_CLASS} -years`;
        const { year } = partsFromDateMs(cursorDateMs());
        const startYear = year - (year % 12) - 1;
        const sel = parseDate(state.value);
        const selYear = sel == null ? null : partsFromDateMs(sel).year;
        const todayYear = partsFromDateMs(todayDateMs()).year;

        for (let i = 0; i < 16; i++) {
            const cellYear = startYear + i;
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = CELL_CLASS;
            cell.dataset.year = String(cellYear);
            cell.textContent = String(cellYear);
            if (i === 0 || i > 12) cell.classList.add('-muted');
            if (cellYear === todayYear) cell.classList.add('-today');
            if (cellYear === selYear) {
                cell.classList.add('-selected');
                cell.setAttribute('aria-pressed', 'true');
            }
            grid.appendChild(cell);
        }
        return grid;
    };

    const renderCalendar = () => {
        const currentView = view();
        const body = currentView === 'days' ? renderDays() : currentView === 'months' ? renderMonths() : renderYears();
        popover.replaceChildren(renderNav(), body);
    };

    // ---- Core value flow -------------------------------------------

    /**
     * @param {string} next
     * @param {{ syncText: boolean, resetCommitted?: boolean }} opts
     * @returns {boolean} whether value changed
     */
    const applyValue = (next, { syncText, resetCommitted }) => {
        const previous = state.value;
        state.value = next;
        const ms = parseDate(next);
        if (ms != null) cursorDateMs.set(firstOfMonth(ms));
        if (syncText) input.value = next;
        elementInternals.setFormValue(next, next);
        syncClearVisibility();
        updateValidity();
        if (resetCommitted) lastCommittedValue = next;
        return previous !== next;
    };

    /**
     * @param {string} raw
     * @param {{ syncText: boolean, resetCommitted?: boolean }} opts
     */
    const setValueFromString = (raw, opts) => applyValue(normalizeValue(raw), opts);

    const dispatchInput = () => {
        host.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const dispatchChangeIfNeeded = () => {
        if (lastCommittedValue === state.value) return;
        lastCommittedValue = state.value;
        host.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const commitInputValue = () => {
        const next = readInputValue();
        if (next == null) applyValue('', { syncText: false });
        else applyValue(next, { syncText: true });
        dispatchChangeIfNeeded();
    };

    /** @param {number} amount */
    const stepBy = (amount) => {
        if (!Number.isFinite(amount)) amount = 1;
        const step = stepDays() ?? DEFAULT_STEP_DAYS;
        const current = parseDate(state.value);
        const base = current ?? minDateMs() ?? 0;
        const next = base + amount * step * DAY_MS;
        applyValue(formatDate(next), { syncText: true, resetCommitted: true });
    };

    // ---- Popover open / close --------------------------------------

    const open = () => {
        if (!isMutable()) return;
        view.set('days');
        const sel = parseDate(state.value);
        cursorDateMs.set(sel == null ? firstOfMonth(todayDateMs()) : firstOfMonth(sel));
        try {
            if (!isPopoverOpen()) {
                /** @type {any} */ (popover).showPopover({ source: fieldEl });
            }
        } catch (e) {
            if (DEV) {
                // eslint-disable-next-line no-console
                console.debug('<neon-datepicker>: showPopover failed', e);
            }
        }
    };

    const close = () => {
        try {
            if (isPopoverOpen()) popover.hidePopover();
        } catch (e) {
            if (DEV) {
                // eslint-disable-next-line no-console
                console.debug('<neon-datepicker>: hidePopover failed', e);
            }
        }
    };

    const focusCalendarCell = () => {
        const selectedCell = state.value
            ? popover.querySelector(`[data-date="${cssEscape(state.value)}"]`)
            : null;
        const target = selectedCell
            ?? popover.querySelector('[data-today]')
            ?? popover.querySelector(`.${CELL_CLASS}:not(:disabled)`);
        if (target instanceof HTMLElement) target.focus();
    };

    // ---- Event handlers --------------------------------------------

    /** @param {Event} e */
    const onInputEvent = (e) => {
        e.stopPropagation();
        const next = readInputValue();
        applyValue(next ?? '', { syncText: false });
        dispatchInput();
    };

    /** @param {Event} e */
    const onInputChange = (e) => {
        e.stopPropagation();
        commitInputValue();
    };

    /** @param {KeyboardEvent} e */
    const onInputKeydown = (e) => {
        if (!isMutable()) return;
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                open();
                return;
            case 'Escape':
                if (isPopoverOpen()) {
                    e.preventDefault();
                    e.stopPropagation();
                    close();
                }
                return;
            case 'Tab':
                commitInputValue();
                close();
                return;
        }
    };

    /** @param {MouseEvent} e */
    const onTriggerClick = (e) => {
        e.preventDefault();
        if (!isMutable()) return;
        if (isPopoverOpen()) close();
        else open();
    };

    /** @param {MouseEvent} e */
    const onClearClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isMutable()) return;
        const hadText = input.value.trim() !== '';
        if (!hadText && state.value === '') return;
        applyValue('', { syncText: true });
        dispatchInput();
        dispatchChangeIfNeeded();
        input.focus();
    };

    /** @param {MouseEvent} e */
    const onPopoverClick = (e) => {
        const target = /** @type {Element | null} */ (e.target);
        if (!target) return;

        if (target.closest('[data-dp-prev]')) {
            moveCursor(-1);
            return;
        }
        if (target.closest('[data-dp-next]')) {
            moveCursor(1);
            return;
        }
        if (target.closest('[data-dp-switch]')) {
            const currentView = view();
            view.set(currentView === 'days' ? 'months' : currentView === 'months' ? 'years' : 'days');
            return;
        }

        const dayCell = /** @type {HTMLButtonElement | null} */ (target.closest('[data-date]'));
        if (dayCell) {
            if (dayCell.disabled) return;
            const v = dayCell.dataset.date ?? '';
            const changed = setValueFromString(v, { syncText: true });
            if (changed) {
                dispatchInput();
                dispatchChangeIfNeeded();
            }
            close();
            input.focus();
            return;
        }

        const monthCell = /** @type {HTMLButtonElement | null} */ (target.closest('[data-month]'));
        if (monthCell) {
            const month = Number(monthCell.dataset.month);
            const { year } = partsFromDateMs(cursorDateMs());
            cursorDateMs.set(dateMsFromParts(year, month, 1));
            view.set('days');
            queueMicrotask(() => focusCalendarCell());
            return;
        }

        const yearCell = /** @type {HTMLButtonElement | null} */ (target.closest('[data-year]'));
        if (yearCell) {
            const year = Number(yearCell.dataset.year);
            const { month } = partsFromDateMs(cursorDateMs());
            cursorDateMs.set(dateMsFromParts(year, month, 1));
            view.set('months');
        }
    };

    /** @param {KeyboardEvent} e */
    const onPopoverKeydown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
            input.focus();
            return;
        }
        const target = /** @type {Element | null} */ (e.target);
        const cell = /** @type {HTMLElement | null} */ (target?.closest(`.${CELL_CLASS}`) ?? null);
        if (!cell) return;
        const grid = cell.parentElement;
        if (!grid) return;
        const cells = /** @type {HTMLElement[]} */ (
            Array.from(grid.querySelectorAll(`.${CELL_CLASS}:not(:disabled)`))
        );
        const index = cells.indexOf(cell);
        if (index === -1) return;
        const columns = grid.classList.contains('-days') ? 7 : 4;
        const isRtl = getComputedStyle(grid).direction === 'rtl';
        const left = isRtl ? 1 : -1;
        const right = -left;
        let nextIndex = index;
        switch (e.key) {
            case 'ArrowLeft': nextIndex = index + left; break;
            case 'ArrowRight': nextIndex = index + right; break;
            case 'ArrowUp': nextIndex = index - columns; break;
            case 'ArrowDown': nextIndex = index + columns; break;
            case 'Home': nextIndex = index - (index % columns); break;
            case 'End': nextIndex = index + (columns - 1 - (index % columns)); break;
            default: return;
        }
        e.preventDefault();
        cells[nextIndex]?.focus();
    };

    /** @param {ToggleEvent} e */
    const onPopoverToggle = (e) => {
        const isOpen = e.newState === 'open';
        input.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        triggerEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (isOpen) queueMicrotask(() => focusCalendarCell());
    };

    /** @param {1 | -1} direction */
    const moveCursor = (direction) => {
        const { year, month } = partsFromDateMs(cursorDateMs());
        const currentView = view();
        if (currentView === 'days') {
            cursorDateMs.set(dateMsFromParts(year, month + direction, 1));
        } else if (currentView === 'months') {
            cursorDateMs.set(dateMsFromParts(year + direction, month, 1));
        } else {
            cursorDateMs.set(dateMsFromParts(year + direction * 12, month, 1));
        }
    };

    // ---- Reactive DOM effects --------------------------------------
    effect(() => {
        void state.value;
        void state.min;
        void state.max;
        void state.step;
        void view();
        void cursorDateMs();
        renderCalendar();
    });

    effect(() => {
        void state.value;
        void state.min;
        void state.max;
        void state.step;
        void state.required;
        void state.disabled;
        void state.readonly;
        void formDisabled();
        syncInputAttributes();
        updateValidity();
    });

    // ---- Public host API -------------------------------------------
    defineReadonlyProperty(host, 'type', () => 'date');
    defineWritableProperty(
        host,
        'value',
        () => state.value,
        (v) => {
            setValueFromString(v == null ? '' : String(v), {
                syncText: true, resetCommitted: true,
            });
        },
    );
    defineWritableProperty(
        host,
        'defaultValue',
        () => host.getAttribute('value') ?? '',
        (v) => {
            reflectStringAttr(host, 'value', /** @type {any} */ (v));
        },
    );

    defineStringProperty(host, state, 'min');
    defineStringProperty(host, state, 'max');
    defineStringProperty(host, state, 'step');
    defineStringProperty(host, state, 'placeholder');
    defineStringProperty(host, state, 'name');
    defineStringProperty(host, state, 'autocomplete');
    defineBooleanProperty(host, state, 'disabled', 'disabled');
    defineBooleanProperty(host, state, 'readOnly', 'readonly');
    defineBooleanProperty(host, state, 'required', 'required');
    defineBooleanProperty(host, state, 'data-clearable', 'data-clearable');
    defineWritableProperty(
        host,
        'readonly',
        () => state.readonly,
        (v) => { /** @type {any} */ (host).readOnly = v; },
    );

    defineWritableProperty(
        host,
        'valueAsNumber',
        () => {
            const ms = parseDate(state.value);
            return ms == null ? Number.NaN : ms;
        },
        (v) => {
            const n = Number(v);
            /** @type {any} */ (host).value = !Number.isFinite(n) ? '' : formatDate(startOfUtcDay(n));
        },
    );
    defineWritableProperty(
        host,
        'valueAsDate',
        () => {
            const ms = parseDate(state.value);
            return ms == null ? null : new Date(ms);
        },
        (v) => {
            if (v == null || !(v instanceof Date) || Number.isNaN(v.getTime())) {
                /** @type {any} */ (host).value = '';
                return;
            }
            /** @type {any} */ (host).value = formatDate(dateMsFromParts(
                v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(),
            ));
        },
    );
    defineReadonlyProperty(host, 'open', () => isPopoverOpen());
    defineFormControlApi(host, {
        focusTarget: input,
        willValidate: () => willValidateNow(),
        stepBy,
    });

    // ---- Initial paint ---------------------------------------------
    setValueFromString(state.value, { syncText: true, resetCommitted: true });

    onMount(() => {
        updateValidity();
    });

    // ---- Lifecycle wiring -----------------------------------------
    onConnect(() => {
        const ac = new AbortController();
        listeners = ac;
        const opts = { signal: ac.signal };

        input.addEventListener('input', /** @type {EventListener} */ (onInputEvent), opts);
        input.addEventListener('change', /** @type {EventListener} */ (onInputChange), opts);
        input.addEventListener('keydown', /** @type {EventListener} */ (onInputKeydown), opts);
        triggerEl.addEventListener('click', /** @type {EventListener} */ (onTriggerClick), opts);
        clearEl.addEventListener('click', /** @type {EventListener} */ (onClearClick), opts);
        popover.addEventListener('click', /** @type {EventListener} */ (onPopoverClick), opts);
        popover.addEventListener('keydown', /** @type {EventListener} */ (onPopoverKeydown), opts);
        popover.addEventListener('toggle', /** @type {EventListener} */ (onPopoverToggle), opts);
    });

    onDisconnect(() => {
        listeners?.abort();
        listeners = null;
    });

    onFormReset(() => {
        setValueFromString(host.getAttribute('value') ?? '', {
            syncText: true, resetCommitted: true,
        });
    });

    onFormDisabled((disabled) => {
        formDisabled.set(disabled);
    });

    onFormStateRestore((state) => {
        if (typeof state === 'string') {
            setValueFromString(state, { syncText: true, resetCommitted: true });
        }
    });

    return [fieldEl, popover];
};

// ---- Date helpers --------------------------------------------------

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

// ---- Icon helpers --------------------------------------------------

function createCalendarIcon() {
    return SvgIcon({
        class: ICON_CLASS,
        strokeWidth: '1.75',
        def: calendar,
    });
}

function createXIcon() {
    return SvgIcon({ def: xMark });
}

/** @param {'prev' | 'next'} direction */
function createChevronIcon(direction) {
    return SvgIcon({
        def: direction === 'prev' ? chevronLeft : chevronRight,
    });
}

/**
 * @param {string} id
 */
function cssEscape(id) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(id);
    return id.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

/**
 * Public instance type of `<neon-datepicker>`.
 *
 * @typedef {HTMLElement & {
 *   readonly type: 'date',
 *   value: string,
 *   defaultValue: string,
 *   min: string,
 *   max: string,
 *   step: string,
 *   placeholder: string,
 *   name: string,
 *   autocomplete: string,
 *   disabled: boolean,
 *   readOnly: boolean,
 *   required: boolean,
 *   valueAsNumber: number,
 *   valueAsDate: Date | null,
 *   readonly labels: NodeList | null,
 *   readonly form: HTMLFormElement | null,
 *   readonly validity: ValidityState,
 *   readonly validationMessage: string,
 *   readonly willValidate: boolean,
 *   readonly open: boolean,
 *   checkValidity(): boolean,
 *   reportValidity(): boolean,
 *   focus(options?: FocusOptions): void,
 *   blur(): void,
 *   select(): void,
 *   stepUp(n?: number): void,
 *   stepDown(n?: number): void,
 * }} NeonDatepickerElement
 */

defineElement(
    'neon-datepicker',
    [
        attributes({
            value: parseString,
            min: parseString,
            max: parseString,
            step: parseString,
            placeholder: parseString,
            disabled: [booleanAttribute[0]],
            readonly: [booleanAttribute[0]],
            required: [booleanAttribute[0]],
            name: parseString,
            autocomplete: parseString,
            'data-clearable': [booleanAttribute[0]],
        }),
        withInternals(),
        withValidation(),
        formAssociated(),
    ],
    renderDatepicker,
);

export {};
