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
    stringAttribute,
    withInternals,
} from '@slimlib/element';
import { signal } from '@slimlib/store';

import { SvgIcon } from './svg-icon.jsx';
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

    // ---- Adopt any pre-set own data props ------------------------------
    /** @type {Record<string, unknown>} */
    const preset = {};
    for (const key of [
        'value', 'min', 'max', 'step', 'placeholder', 'disabled',
        'readonly', 'required', 'name', 'autocomplete',
    ]) {
        if (Object.hasOwn(host, key)) {
            preset[key] = /** @type {any} */ (host)[key];
            delete /** @type {any} */ (host)[key];
        }
    }
    if (Object.hasOwn(host, 'data-clearable')) {
        preset['data-clearable'] = /** @type {any} */ (host)['data-clearable'];
        delete /** @type {any} */ (host)['data-clearable'];
    }

    // ---- State -------------------------------------------------------
    const value = signal(/** @type {string} */ (''));
    let lastCommittedValue = '';
    /** @type {DatepickerView} */
    let view = 'days';
    let cursorDateMs = todayDateMs();
    let formDisabled = false;
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

    const isEffectivelyDisabled = () => host.hasAttribute('disabled') || formDisabled;
    const isMutable = () => !isEffectivelyDisabled() && !host.hasAttribute('readonly');
    const willValidateNow = () => !isEffectivelyDisabled() && !host.hasAttribute('readonly')
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

    const minDateMs = () => parseDate(host.getAttribute('min') ?? '');
    const maxDateMs = () => parseDate(host.getAttribute('max') ?? '');

    /** @returns {number | null} */
    const stepDays = () => {
        const raw = host.getAttribute('step');
        if (raw == null || raw === '') return DEFAULT_STEP_DAYS;
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
        const text = input.value.trim() || value();
        const visible = host.hasAttribute('data-clearable') && text !== '';
        clearEl.style.display = visible ? '' : 'none';
    };

    const syncInputAttributes = () => {
        const disabled = isEffectivelyDisabled();
        const immutable = disabled || host.hasAttribute('readonly');
        input.disabled = disabled;
        input.readOnly = host.hasAttribute('readonly');
        input.required = host.hasAttribute('required');
        input.placeholder = host.getAttribute('placeholder') ?? 'YYYY-MM-DD';
        input.setAttribute('autocomplete', host.getAttribute('autocomplete') || 'off');
        if (host.hasAttribute('required')) input.setAttribute('aria-required', 'true');
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

        if (host.hasAttribute('required') && value() === '') {
            setInvalid({ valueMissing: true }, 'Please fill out this field.');
            return;
        }

        const ms = parseDate(value());
        if (ms != null) {
            if (isRangeUnderflow(ms)) {
                setInvalid({ rangeUnderflow: true }, `Value must be ${host.getAttribute('min')} or later.`);
                return;
            }
            if (isRangeOverflow(ms)) {
                setInvalid({ rangeOverflow: true }, `Value must be ${host.getAttribute('max')} or earlier.`);
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
        const { year, month } = partsFromDateMs(cursorDateMs);
        if (view === 'days') return `${MONTH_LONG[month]} ${year}`;
        if (view === 'months') return String(year);
        const start = year - (year % 12);
        return `${start} - ${start + 11}`;
    };

    const previousLabel = () =>
        view === 'days' ? 'Previous month' : view === 'months' ? 'Previous year' : 'Previous years';
    const nextLabel = () =>
        view === 'days' ? 'Next month' : view === 'months' ? 'Next year' : 'Next years';

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
        if (cell.dataset.date === value()) {
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

        const { year, month } = partsFromDateMs(cursorDateMs);
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
        const { year } = partsFromDateMs(cursorDateMs);
        const sel = parseDate(value());
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
        const { year } = partsFromDateMs(cursorDateMs);
        const startYear = year - (year % 12) - 1;
        const sel = parseDate(value());
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
        const body = view === 'days' ? renderDays() : view === 'months' ? renderMonths() : renderYears();
        popover.replaceChildren(renderNav(), body);
    };

    // ---- Core value flow -------------------------------------------

    /**
     * @param {string} next
     * @param {{ syncText: boolean, resetCommitted?: boolean }} opts
     * @returns {boolean} whether value changed
     */
    const applyValue = (next, { syncText, resetCommitted }) => {
        const previous = value();
        value.set(next);
        const ms = parseDate(next);
        if (ms != null) cursorDateMs = firstOfMonth(ms);
        if (syncText) input.value = next;
        elementInternals.setFormValue(next, next);
        syncClearVisibility();
        renderCalendar();
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
        if (lastCommittedValue === value()) return;
        lastCommittedValue = value();
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
        const current = parseDate(value());
        const base = current ?? minDateMs() ?? 0;
        const next = base + amount * step * DAY_MS;
        applyValue(formatDate(next), { syncText: true, resetCommitted: true });
    };

    // ---- Popover open / close --------------------------------------

    const open = () => {
        if (!isMutable()) return;
        view = 'days';
        const sel = parseDate(value());
        cursorDateMs = sel == null ? firstOfMonth(todayDateMs()) : firstOfMonth(sel);
        renderCalendar();
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
        const selectedCell = value()
            ? popover.querySelector(`[data-date="${cssEscape(value())}"]`)
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
        if (!hadText && value() === '') return;
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
            view = view === 'days' ? 'months' : view === 'months' ? 'years' : 'days';
            renderCalendar();
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
            const { year } = partsFromDateMs(cursorDateMs);
            cursorDateMs = dateMsFromParts(year, month, 1);
            view = 'days';
            renderCalendar();
            queueMicrotask(() => focusCalendarCell());
            return;
        }

        const yearCell = /** @type {HTMLButtonElement | null} */ (target.closest('[data-year]'));
        if (yearCell) {
            const year = Number(yearCell.dataset.year);
            const { month } = partsFromDateMs(cursorDateMs);
            cursorDateMs = dateMsFromParts(year, month, 1);
            view = 'months';
            renderCalendar();
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
        const { year, month } = partsFromDateMs(cursorDateMs);
        if (view === 'days') {
            cursorDateMs = dateMsFromParts(year, month + direction, 1);
        } else if (view === 'months') {
            cursorDateMs = dateMsFromParts(year + direction, month, 1);
        } else {
            cursorDateMs = dateMsFromParts(year + direction * 12, month, 1);
        }
        renderCalendar();
    };

    // ---- Public host API -------------------------------------------
    Object.defineProperty(host, 'type', {
        configurable: true, enumerable: true,
        get: () => 'date',
    });
    Object.defineProperty(host, 'value', {
        configurable: true, enumerable: true,
        get: () => value(),
        set: (v) => {
            setValueFromString(v == null ? '' : String(v), {
                syncText: true, resetCommitted: true,
            });
        },
    });
    Object.defineProperty(host, 'defaultValue', {
        configurable: true, enumerable: true,
        get: () => host.getAttribute('value') ?? '',
        set: (v) => {
            if (v == null) host.removeAttribute('value');
            else host.setAttribute('value', String(v));
        },
    });

    /**
     * @param {string} name
     * @param {string | number | null | undefined} v
     */
    const reflectStringAttr = (name, v) => {
        const next = v == null || v === '' ? null : String(v);
        if (next === null) {
            if (host.hasAttribute(name)) host.removeAttribute(name);
        } else if (host.getAttribute(name) !== next) {
            host.setAttribute(name, next);
        }
    };
    /**
     * @param {string} name
     * @param {unknown} v
     */
    const reflectBoolAttr = (name, v) => {
        const want = !!v;
        if (host.hasAttribute(name) !== want) {
            if (want) host.setAttribute(name, '');
            else host.removeAttribute(name);
        }
    };

    Object.defineProperty(host, 'min', {
        configurable: true, enumerable: true,
        get: () => host.getAttribute('min') ?? '',
        set: (v) => {
            reflectStringAttr('min', v);
            renderCalendar();
            updateValidity();
        },
    });
    Object.defineProperty(host, 'max', {
        configurable: true, enumerable: true,
        get: () => host.getAttribute('max') ?? '',
        set: (v) => {
            reflectStringAttr('max', v);
            renderCalendar();
            updateValidity();
        },
    });
    Object.defineProperty(host, 'step', {
        configurable: true, enumerable: true,
        get: () => host.getAttribute('step') ?? '',
        set: (v) => {
            reflectStringAttr('step', v);
            renderCalendar();
            updateValidity();
        },
    });
    Object.defineProperty(host, 'placeholder', {
        configurable: true, enumerable: true,
        get: () => host.getAttribute('placeholder') ?? '',
        set: (v) => {
            reflectStringAttr('placeholder', v);
            syncInputAttributes();
        },
    });
    Object.defineProperty(host, 'name', {
        configurable: true, enumerable: true,
        get: () => host.getAttribute('name') ?? '',
        set: (v) => {
            reflectStringAttr('name', v);
        },
    });
    Object.defineProperty(host, 'autocomplete', {
        configurable: true, enumerable: true,
        get: () => host.getAttribute('autocomplete') ?? '',
        set: (v) => {
            reflectStringAttr('autocomplete', v);
            syncInputAttributes();
        },
    });
    Object.defineProperty(host, 'disabled', {
        configurable: true, enumerable: true,
        get: () => host.hasAttribute('disabled'),
        set: (v) => {
            reflectBoolAttr('disabled', v);
            syncInputAttributes();
            updateValidity();
        },
    });
    Object.defineProperty(host, 'readOnly', {
        configurable: true, enumerable: true,
        get: () => host.hasAttribute('readonly'),
        set: (v) => {
            reflectBoolAttr('readonly', v);
            syncInputAttributes();
            updateValidity();
        },
    });
    Object.defineProperty(host, 'required', {
        configurable: true, enumerable: true,
        get: () => host.hasAttribute('required'),
        set: (v) => {
            reflectBoolAttr('required', v);
            syncInputAttributes();
            updateValidity();
        },
    });
    Object.defineProperty(host, 'data-clearable', {
        configurable: true, enumerable: true,
        get: () => host.hasAttribute('data-clearable'),
        set: (v) => {
            reflectBoolAttr('data-clearable', v);
            syncClearVisibility();
        },
    });
    Object.defineProperty(host, 'readonly', {
        configurable: true, enumerable: true,
        get: () => host.hasAttribute('readonly'),
        set: (v) => {
            /** @type {any} */ (host).readOnly = v;
        },
    });

    Object.defineProperty(host, 'valueAsNumber', {
        configurable: true, enumerable: true,
        get: () => {
            const ms = parseDate(value());
            return ms == null ? Number.NaN : ms;
        },
        set: (v) => {
            const n = Number(v);
            /** @type {any} */ (host).value = !Number.isFinite(n) ? '' : formatDate(startOfUtcDay(n));
        },
    });
    Object.defineProperty(host, 'valueAsDate', {
        configurable: true, enumerable: true,
        get: () => {
            const ms = parseDate(value());
            return ms == null ? null : new Date(ms);
        },
        set: (v) => {
            if (v == null || !(v instanceof Date) || Number.isNaN(v.getTime())) {
                /** @type {any} */ (host).value = '';
                return;
            }
            /** @type {any} */ (host).value = formatDate(dateMsFromParts(
                v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(),
            ));
        },
    });
    Object.defineProperty(host, 'labels', {
        configurable: true, enumerable: true,
        get: () => elementInternals.labels,
    });
    Object.defineProperty(host, 'form', {
        configurable: true, enumerable: true,
        get: () => elementInternals.form,
    });
    Object.defineProperty(host, 'validity', {
        configurable: true, enumerable: true,
        get: () => elementInternals.validity,
    });
    Object.defineProperty(host, 'validationMessage', {
        configurable: true, enumerable: true,
        get: () => elementInternals.validationMessage,
    });
    Object.defineProperty(host, 'willValidate', {
        configurable: true, enumerable: true,
        get: () => {
            if (host.hasAttribute('disabled') || formDisabled || host.hasAttribute('readonly')) return false;
            return elementInternals.willValidate;
        },
    });
    Object.defineProperty(host, 'open', {
        configurable: true, enumerable: true,
        get: () => isPopoverOpen(),
    });
    /** @type {any} */ (host).checkValidity = () => elementInternals.checkValidity();
    /** @type {any} */ (host).reportValidity = () => elementInternals.reportValidity();
    /** @type {any} */ (host).focus = (/** @type {FocusOptions} */ options) => input.focus(options);
    /** @type {any} */ (host).blur = () => input.blur();
    /** @type {any} */ (host).select = () => input.select();
    /** @type {any} */ (host).stepUp = (n = 1) => stepBy(Number(n));
    /** @type {any} */ (host).stepDown = (n = 1) => stepBy(-Number(n));

    // ---- Initial paint ---------------------------------------------
    host.append(fieldEl, popover);
    const initialValueRaw = typeof preset.value === 'string'
        ? /** @type {string} */ (preset.value)
        : (host.getAttribute('value') ?? '');
    setValueFromString(initialValueRaw, { syncText: true, resetCommitted: true });
    syncInputAttributes();
    renderCalendar();
    updateValidity();

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
        formDisabled = disabled;
        syncInputAttributes();
        updateValidity();
    });

    onFormStateRestore((state) => {
        if (typeof state === 'string') {
            setValueFromString(state, { syncText: true, resetCommitted: true });
        }
    });

    return null;
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
            value: [stringAttribute[0]],
            min: [stringAttribute[0]],
            max: [stringAttribute[0]],
            step: [stringAttribute[0]],
            placeholder: [stringAttribute[0]],
            disabled: [booleanAttribute[0]],
            readonly: [booleanAttribute[0]],
            required: [booleanAttribute[0]],
            name: [stringAttribute[0]],
            autocomplete: [stringAttribute[0]],
            'data-clearable': [booleanAttribute[0]],
        }),
        withInternals(),
        formAssociated(),
    ],
    renderDatepicker,
);

export {};
