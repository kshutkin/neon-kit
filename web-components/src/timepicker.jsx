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
 *
 * Rebuilt on `@slimlib/element`'s `defineElement` form mirroring
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
    stringAttribute,
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
    reflectStringAttr,
} from './form-control-utils.js';
import xMark from '@neon-kit/icons/outline/x-mark';
import check from '@neon-kit/icons/outline/check';
import clock from '@neon-kit/icons/outline/clock';

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

const DEFAULT_STEP_SECONDS = 60;
const DAY_SECONDS = 24 * 60 * 60;
const DAY_MILLISECONDS = DAY_SECONDS * 1000;
const MAX_LIST_OPTIONS = 1440;
const STEP_EPSILON = 1e-7;

/** @typedef {{ value: string, label: string }} TimeOption */

/**
 * @param {HTMLElement} host
 */
const renderTimepicker = (host) => {
    const elementInternals = internals();

    const id = ++nextId;
    const idPrefix = `neon-timepicker-${id}`;
    const popoverId = `${idPrefix}-pop`;
    const listId = `${idPrefix}-list`;
    const anchorName = `--${idPrefix}-anchor`;

    if (!host.classList.contains('timepicker')) host.classList.add('timepicker');

    // ---- Reactive props and state -----------------------------------
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
        list: '',
        seconds: false,
        'data-clearable': false,
    });
    let lastCommittedValue = '';
    let activeId = '';
    /** @type {HTMLButtonElement[]} */
    let rows = [];
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
            aria-expanded="false"
            aria-controls={listId}
        />
    );

    const clearEl = /** @type {HTMLButtonElement} */ (
        <button type="button" class={CLEAR_CLASS} aria-label="Clear time" tabindex="-1" />
    );
    clearEl.style.display = 'none';
    clearEl.appendChild(createXIcon());

    const triggerEl = /** @type {HTMLButtonElement} */ (
        <button
            type="button"
            class={TRIGGER_CLASS}
            aria-label="Open time list"
            aria-haspopup="listbox"
            aria-controls={listId}
            aria-expanded="false"
        />
    );
    triggerEl.appendChild(createClockIcon());

    const fieldEl = /** @type {HTMLDivElement} */ (
        <div class={FIELD_CLASS}>{input}{clearEl}{triggerEl}</div>
    );
    fieldEl.style.setProperty('anchor-name', anchorName);

    const emptyEl = /** @type {HTMLDivElement} */ (
        <div class={EMPTY_CLASS} hidden>No times</div>
    );

    const listEl = /** @type {HTMLDivElement} */ (
        <div id={listId} class={LIST_CLASS} role="listbox">{emptyEl}</div>
    );

    const popover = /** @type {HTMLDivElement} */ (
        <div id={popoverId} class={POPOVER_CLASS}>{listEl}</div>
    );
    popover.setAttribute('popover', '');
    popover.style.setProperty('position-anchor', anchorName);

    // ---- Helpers -----------------------------------------------------

    const isEffectivelyDisabled = () => state.disabled || formDisabled();
    const isMutable = () => !isEffectivelyDisabled() && !state.readonly;
    const willValidateNow = () => !isEffectivelyDisabled() && !state.readonly
        && elementInternals.willValidate;
    const hasSeconds = () => state.seconds;

    const isPopoverOpen = () => popover.matches(':popover-open');

    const resolveList = () => {
        if (!state.list) return null;
        const el = host.ownerDocument.getElementById(state.list);
        return el instanceof HTMLDataListElement ? el : null;
    };

    /** @param {string} raw */
    const normalizeValue = (raw) => {
        const trimmed = raw.trim();
        if (trimmed === '') return '';
        const secs = parseTime(trimmed, { withSeconds: hasSeconds(), lenient: false });
        if (secs == null) return '';
        if (!hasSeconds() && secs % 60 !== 0) return '';
        return formatTime(secs, hasSeconds());
    };

    /** @returns {string | null} */
    const readInputValue = () => {
        const raw = input.value.trim();
        if (raw === '') return '';
        const secs = parseTime(raw, { withSeconds: hasSeconds(), lenient: true });
        if (secs == null) return null;
        if (!hasSeconds() && secs % 60 !== 0) return null;
        return formatTime(secs, hasSeconds());
    };

    const minSeconds = () => parseTime(state.min, { withSeconds: true, lenient: false });
    const maxSeconds = () => parseTime(state.max, { withSeconds: true, lenient: false });

    /** @returns {number | null} */
    const stepSeconds = () => {
        const raw = state.step;
        if (raw === '') return DEFAULT_STEP_SECONDS;
        if (raw === 'any') return null;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : DEFAULT_STEP_SECONDS;
    };

    /** @param {number} secs */
    const rangeState = (secs) => {
        const min = minSeconds();
        const max = maxSeconds();
        if (min == null && max == null) return '';
        if (min != null && max != null && min > max) {
            if (secs >= min || secs <= max) return '';
            return 'underflow';
        }
        if (min != null && secs < min) return 'underflow';
        if (max != null && secs > max) return 'overflow';
        return '';
    };

    /** @param {number} secs */
    const isInAllowedRange = (secs) => rangeState(secs) === '';

    /** @param {number} secs */
    const hasStepMismatch = (secs) => {
        const step = stepSeconds();
        if (step == null) return false;
        const base = minSeconds()
            ?? parseTime(host.getAttribute('value') ?? '', { withSeconds: true, lenient: false })
            ?? 0;
        const rem = (((secs - base) % step) + step) % step;
        return rem > STEP_EPSILON && Math.abs(rem - step) > STEP_EPSILON;
    };

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
        input.placeholder = state.placeholder || (hasSeconds() ? 'HH:MM:SS' : 'HH:MM');
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
            setInvalid({ badInput: true }, 'Enter a valid time.');
            return;
        }

        if (state.required && state.value === '') {
            setInvalid({ valueMissing: true }, 'Please fill out this field.');
            return;
        }

        const secs = parseTime(state.value, { withSeconds: true, lenient: false });
        if (secs != null) {
            const range = rangeState(secs);
            if (range === 'underflow') {
                setInvalid({ rangeUnderflow: true }, `Value must be ${state.min} or later.`);
                return;
            }
            if (range === 'overflow') {
                setInvalid({ rangeOverflow: true }, `Value must be ${state.max} or earlier.`);
                return;
            }
            if (hasStepMismatch(secs)) {
                setInvalid({ stepMismatch: true }, 'Enter a valid time step.');
                return;
            }
        }

        input.removeAttribute('aria-invalid');
        elementInternals.setValidity({});
    };

    // ---- Option list rendering --------------------------------------

    const listStepSeconds = () => {
        let step = stepSeconds() ?? DEFAULT_STEP_SECONDS;
        if (!hasSeconds()) step = Math.max(DEFAULT_STEP_SECONDS, Math.ceil(step / 60) * 60);
        if (DAY_SECONDS / step > MAX_LIST_OPTIONS) step = Math.ceil(DAY_SECONDS / MAX_LIST_OPTIONS);
        if (!hasSeconds()) step = Math.max(DEFAULT_STEP_SECONDS, Math.ceil(step / 60) * 60);
        return Math.max(1, step);
    };

    /**
     * @param {HTMLDataListElement} datalist
     * @returns {TimeOption[]}
     */
    const datalistOptions = (datalist) => {
        /** @type {TimeOption[]} */
        const options = [];
        const seen = new Set();
        for (const option of datalist.options) {
            const v = normalizeValue(option.value);
            if (!v || seen.has(v)) continue;
            const secs = parseTime(v, { withSeconds: true, lenient: false });
            if (secs == null || !isInAllowedRange(secs)) continue;
            seen.add(v);
            options.push({ value: v, label: option.label || option.textContent || v });
        }
        return options;
    };

    /** @returns {TimeOption[]} */
    const timeOptions = () => {
        const datalist = resolveList();
        if (datalist) return datalistOptions(datalist);

        const step = listStepSeconds();
        /** @type {TimeOption[]} */
        const options = [];
        let secs = 0;
        let guard = 0;
        while (secs < DAY_SECONDS && guard < MAX_LIST_OPTIONS) {
            const rounded = Math.round(secs);
            if (isInAllowedRange(rounded)) {
                const v = formatTime(rounded, hasSeconds());
                options.push({ value: v, label: v });
            }
            secs += step;
            guard++;
        }
        return options;
    };

    const refreshSelectedRows = () => {
        for (const row of rows) {
            row.setAttribute('aria-selected', row.dataset.value === state.value ? 'true' : 'false');
        }
    };

    /** @param {HTMLButtonElement | null} row */
    const setActive = (row) => {
        if (activeId) {
            const previous = listEl.querySelector(`#${cssEscape(activeId)}`);
            previous?.classList.remove('-active');
        }
        if (row) {
            row.classList.add('-active');
            activeId = row.id;
            input.setAttribute('aria-activedescendant', row.id);
            scrollRowIntoList(row, 'nearest');
        } else {
            activeId = '';
            input.removeAttribute('aria-activedescendant');
        }
    };

    /**
     * @param {HTMLElement} row
     * @param {'nearest' | 'center'} mode
     */
    const scrollRowIntoList = (row, mode) => {
        const listRect = listEl.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        if (mode === 'center') {
            const target = rowRect.top - listRect.top - (listRect.height - rowRect.height) / 2;
            listEl.scrollTop += target;
            return;
        }
        if (rowRect.top < listRect.top) {
            listEl.scrollTop -= listRect.top - rowRect.top;
        } else if (rowRect.bottom > listRect.bottom) {
            listEl.scrollTop += rowRect.bottom - listRect.bottom;
        }
    };

    const renderRows = () => {
        for (const row of rows) row.remove();
        rows = [];

        const options = timeOptions();
        for (let index = 0; index < options.length; index++) {
            const option = options[index];
            const row = document.createElement('button');
            row.type = 'button';
            row.className = OPTION_CLASS;
            row.id = `${idPrefix}-opt-${index}`;
            row.dataset.value = option.value;
            row.setAttribute('role', 'option');

            const label = document.createElement('span');
            label.className = OPTION_LABEL_CLASS;
            label.textContent = option.label;
            row.append(label, createCheckIcon());

            listEl.insertBefore(row, emptyEl);
            rows.push(row);
        }

        emptyEl.hidden = options.length !== 0;
        setActive(null);
        refreshSelectedRows();
    };

    /** @param {1 | -1} delta */
    const moveActive = (delta) => {
        if (rows.length === 0) return;
        const index = activeId ? rows.findIndex((row) => row.id === activeId) : -1;
        const next = index < 0
            ? (delta > 0 ? rows[0] : rows[rows.length - 1])
            : rows[(index + delta + rows.length) % rows.length];
        setActive(next);
    };

    const activateActive = () => {
        if (!activeId) return;
        const row = rows.find((c) => c.id === activeId);
        if (row) selectRow(row);
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

    const coerceCurrentValueToFormat = () => {
        const secs = parseTime(state.value, { withSeconds: true, lenient: false });
        if (secs == null) {
            applyValue('', { syncText: true });
            return;
        }
        if (!hasSeconds() && secs % 60 !== 0) {
            applyValue('', { syncText: true });
            return;
        }
        applyValue(formatTime(secs, hasSeconds()), { syncText: true });
    };

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
        const step = stepSeconds() ?? DEFAULT_STEP_SECONDS;
        const current = parseTime(state.value, { withSeconds: true, lenient: false });
        const base = current ?? minSeconds() ?? 0;
        let next = base + amount * step;
        next = ((next % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
        if (!hasSeconds()) next = Math.round(next / 60) * 60;
        next = ((next % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
        applyValue(formatTime(next, hasSeconds()), { syncText: true, resetCommitted: true });
    };

    // ---- Popover open / close --------------------------------------

    const open = () => {
        if (!isMutable()) return;
        renderRows();
        try {
            if (!isPopoverOpen()) {
                /** @type {any} */ (popover).showPopover({ source: fieldEl });
            }
        } catch (e) {
            if (DEV) {
                // eslint-disable-next-line no-console
                console.debug('<neon-timepicker>: showPopover failed', e);
            }
        }
    };

    const close = () => {
        try {
            if (isPopoverOpen()) popover.hidePopover();
        } catch (e) {
            if (DEV) {
                // eslint-disable-next-line no-console
                console.debug('<neon-timepicker>: hidePopover failed', e);
            }
        }
    };

    /** @param {HTMLButtonElement} row */
    const selectRow = (row) => {
        const v = row.dataset.value ?? '';
        const changed = setValueFromString(v, { syncText: true });
        if (changed) {
            dispatchInput();
            dispatchChangeIfNeeded();
        }
        close();
        input.focus();
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
                if (!isPopoverOpen()) open();
                moveActive(1);
                return;
            case 'ArrowUp':
                e.preventDefault();
                if (!isPopoverOpen()) open();
                moveActive(-1);
                return;
            case 'Enter':
                if (isPopoverOpen()) {
                    e.preventDefault();
                    activateActive();
                }
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
        input.focus();
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
    const onListClick = (e) => {
        const target = /** @type {Element | null} */ (e.target);
        const row = /** @type {HTMLButtonElement | null} */ (target?.closest(`.${OPTION_CLASS}`) ?? null);
        if (!row) return;
        selectRow(row);
    };

    /** @param {ToggleEvent} e */
    const onPopoverToggle = (e) => {
        const isOpen = e.newState === 'open';
        input.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        triggerEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (isOpen) {
            const selected = rows.find((row) => row.dataset.value === state.value) ?? null;
            setActive(selected ?? rows[0] ?? null);
            queueMicrotask(() => {
                input.focus({ preventScroll: true });
                if (selected) scrollRowIntoList(selected, 'center');
            });
        } else {
            setActive(null);
        }
    };

    // ---- Reactive DOM effects --------------------------------------
    effect(() => {
        void state.min;
        void state.max;
        void state.step;
        void state.list;
        void state.seconds;
        renderRows();
    });

    effect(() => {
        void state.value;
        void state.min;
        void state.max;
        void state.step;
        void state.required;
        void state.disabled;
        void state.readonly;
        void state.seconds;
        void state['data-clearable'];
        void formDisabled();
        syncInputAttributes();
        refreshSelectedRows();
        updateValidity();
    });

    // ---- Public host API -------------------------------------------
    defineReadonlyProperty(host, 'type', () => 'time');
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
    defineWritableProperty(
        host,
        'readonly',
        () => state.readonly,
        (v) => { /** @type {any} */ (host).readOnly = v; },
    );
    defineBooleanProperty(host, state, 'required', 'required');
    defineBooleanProperty(
        host,
        state,
        'seconds',
        'seconds',
        () => {
            coerceCurrentValueToFormat();
            lastCommittedValue = state.value;
        },
    );
    defineBooleanProperty(host, state, 'data-clearable', 'data-clearable');
    defineWritableProperty(
        host,
        'list',
        () => resolveList(),
        (v) => {
            state.list = reflectStringAttr(
                host,
                'list',
                typeof v === 'string' ? v : (/** @type {{ id?: string } | null} */ (v))?.id || '',
            );
        },
    );

    defineWritableProperty(
        host,
        'valueAsNumber',
        () => {
            const secs = parseTime(state.value, { withSeconds: true, lenient: false });
            return secs == null ? Number.NaN : secs * 1000;
        },
        (v) => {
            const n = Number(v);
            if (!Number.isFinite(n) || n < 0 || n >= DAY_MILLISECONDS) {
                /** @type {any} */ (host).value = '';
                return;
            }
            const secs = Math.floor(n / 1000);
            if (!hasSeconds() && secs % 60 !== 0) {
                /** @type {any} */ (host).value = '';
                return;
            }
            /** @type {any} */ (host).value = formatTime(secs, hasSeconds());
        },
    );
    defineWritableProperty(
        host,
        'valueAsDate',
        () => {
            const secs = parseTime(state.value, { withSeconds: true, lenient: false });
            return secs == null ? null : new Date(secs * 1000);
        },
        (v) => {
            if (v == null || !(v instanceof Date) || Number.isNaN(v.getTime())) {
                /** @type {any} */ (host).value = '';
                return;
            }
            const secs = v.getUTCHours() * 3600 + v.getUTCMinutes() * 60 + v.getUTCSeconds();
            if (!hasSeconds() && secs % 60 !== 0) {
                /** @type {any} */ (host).value = '';
                return;
            }
            /** @type {any} */ (host).value = formatTime(secs, hasSeconds());
        },
    );
    defineReadonlyProperty(host, 'open', () => isPopoverOpen());
    defineFormControlApi(host, {
        focusTarget: input,
        willValidate: () => willValidateNow(),
        stepBy,
    });

    // ---- Initial paint --------------------------------------------
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
        listEl.addEventListener('click', /** @type {EventListener} */ (onListClick), opts);
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

// ---- Time helpers --------------------------------------------------

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

// ---- Icon helpers --------------------------------------------------

function createClockIcon() {
    return SvgIcon(clock, {
        class: ICON_CLASS,
        'stroke-width': '1.75',
        'aria-hidden': 'true',
    });
}

function createXIcon() {
    return SvgIcon(xMark, { 'aria-hidden': 'true' });
}

function createCheckIcon() {
    return SvgIcon(check, {
        class: OPTION_CHECK_CLASS,
        'stroke-width': '2.5',
        'aria-hidden': 'true',
    });
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
 * Public instance type of `<neon-timepicker>`.
 *
 * @typedef {HTMLElement & {
 *   readonly type: 'time',
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
 *   seconds: boolean,
 *   readonly list: HTMLDataListElement | null,
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
 * }} NeonTimepickerElement
 */

defineElement(
    'neon-timepicker',
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
            list: [stringAttribute[0]],
            seconds: [booleanAttribute[0]],
            'data-clearable': [booleanAttribute[0]],
        }),
        withInternals(),
        withValidation(),
        formAssociated(),
    ],
    renderTimepicker,
);

export {};
