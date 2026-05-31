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
    stringAttribute,
    withInternals,
} from '@slimlib/element';
import { signal } from '@slimlib/store';

import { SvgIcon } from './svg-icon.jsx';
import xMark from '@neon-kit/icons/outline/x-mark';
import check from '@neon-kit/icons/outline/check';

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

    // ---- Adopt any pre-set own data props ----------------------------
    /** @type {Record<string, unknown>} */
    const preset = {};
    for (const key of [
        'value', 'min', 'max', 'step', 'placeholder', 'disabled',
        'readonly', 'required', 'name', 'autocomplete', 'list', 'seconds',
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
    let activeId = '';
    /** @type {HTMLButtonElement[]} */
    let rows = [];
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

    const isEffectivelyDisabled = () => host.hasAttribute('disabled') || formDisabled;
    const isMutable = () => !isEffectivelyDisabled() && !host.hasAttribute('readonly');
    const willValidateNow = () => !isEffectivelyDisabled() && !host.hasAttribute('readonly')
        && elementInternals.willValidate;
    const hasSeconds = () => host.hasAttribute('seconds');

    const isPopoverOpen = () => popover.matches(':popover-open');

    const resolveList = () => {
        const listId = host.getAttribute('list');
        if (!listId) return null;
        const el = host.ownerDocument.getElementById(listId);
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

    const minSeconds = () => parseTime(host.getAttribute('min') ?? '', { withSeconds: true, lenient: false });
    const maxSeconds = () => parseTime(host.getAttribute('max') ?? '', { withSeconds: true, lenient: false });

    /** @returns {number | null} */
    const stepSeconds = () => {
        const raw = host.getAttribute('step');
        if (raw == null || raw === '') return DEFAULT_STEP_SECONDS;
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
        input.placeholder = host.getAttribute('placeholder') ?? (hasSeconds() ? 'HH:MM:SS' : 'HH:MM');
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
            setInvalid({ badInput: true }, 'Enter a valid time.');
            return;
        }

        if (host.hasAttribute('required') && value() === '') {
            setInvalid({ valueMissing: true }, 'Please fill out this field.');
            return;
        }

        const secs = parseTime(value(), { withSeconds: true, lenient: false });
        if (secs != null) {
            const state = rangeState(secs);
            if (state === 'underflow') {
                setInvalid({ rangeUnderflow: true }, `Value must be ${host.getAttribute('min')} or later.`);
                return;
            }
            if (state === 'overflow') {
                setInvalid({ rangeOverflow: true }, `Value must be ${host.getAttribute('max')} or earlier.`);
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
            row.setAttribute('aria-selected', row.dataset.value === value() ? 'true' : 'false');
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
        const previous = value();
        value.set(next);
        if (syncText) input.value = next;
        elementInternals.setFormValue(next, next);
        syncClearVisibility();
        refreshSelectedRows();
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
        const secs = parseTime(value(), { withSeconds: true, lenient: false });
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
        const step = stepSeconds() ?? DEFAULT_STEP_SECONDS;
        const current = parseTime(value(), { withSeconds: true, lenient: false });
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
        if (!hadText && value() === '') return;
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
            const selected = rows.find((row) => row.dataset.value === value()) ?? null;
            setActive(selected ?? rows[0] ?? null);
            queueMicrotask(() => {
                input.focus({ preventScroll: true });
                if (selected) scrollRowIntoList(selected, 'center');
            });
        } else {
            setActive(null);
        }
    };

    // ---- Public host API -------------------------------------------
    Object.defineProperty(host, 'type', {
        configurable: true, enumerable: true,
        get: () => 'time',
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
            renderRows();
            updateValidity();
        },
    });
    Object.defineProperty(host, 'max', {
        configurable: true, enumerable: true,
        get: () => host.getAttribute('max') ?? '',
        set: (v) => {
            reflectStringAttr('max', v);
            renderRows();
            updateValidity();
        },
    });
    Object.defineProperty(host, 'step', {
        configurable: true, enumerable: true,
        get: () => host.getAttribute('step') ?? '',
        set: (v) => {
            reflectStringAttr('step', v);
            renderRows();
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
        set: (v) => { reflectStringAttr('name', v); },
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
    Object.defineProperty(host, 'readonly', {
        configurable: true, enumerable: true,
        get: () => host.hasAttribute('readonly'),
        set: (v) => { /** @type {any} */ (host).readOnly = v; },
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
    Object.defineProperty(host, 'seconds', {
        configurable: true, enumerable: true,
        get: () => host.hasAttribute('seconds'),
        set: (v) => {
            reflectBoolAttr('seconds', v);
            coerceCurrentValueToFormat();
            lastCommittedValue = value();
            syncInputAttributes();
            renderRows();
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
    Object.defineProperty(host, 'list', {
        configurable: true, enumerable: true,
        get: () => resolveList(),
        set: (v) => {
            reflectStringAttr('list', typeof v === 'string' ? v : (v && v.id) || '');
            renderRows();
            updateValidity();
        },
    });

    Object.defineProperty(host, 'valueAsNumber', {
        configurable: true, enumerable: true,
        get: () => {
            const secs = parseTime(value(), { withSeconds: true, lenient: false });
            return secs == null ? Number.NaN : secs * 1000;
        },
        set: (v) => {
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
    });
    Object.defineProperty(host, 'valueAsDate', {
        configurable: true, enumerable: true,
        get: () => {
            const secs = parseTime(value(), { withSeconds: true, lenient: false });
            return secs == null ? null : new Date(secs * 1000);
        },
        set: (v) => {
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

    // ---- Initial paint --------------------------------------------
    host.append(fieldEl, popover);
    const initialValueRaw = typeof preset.value === 'string'
        ? /** @type {string} */ (preset.value)
        : (host.getAttribute('value') ?? '');
    setValueFromString(initialValueRaw, { syncText: true, resetCommitted: true });
    syncInputAttributes();
    renderRows();
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
    return SvgIcon({
        class: ICON_CLASS,
        strokeWidth: '1.75',
        children: () => [
            <circle cx="12" cy="12" r="9" />,
            <path d="M12 7v5l3 2" />,
        ],
    });
}

function createXIcon() {
    return SvgIcon({ def: xMark });
}

function createCheckIcon() {
    return SvgIcon({
        class: OPTION_CHECK_CLASS,
        strokeWidth: '2.5',
        def: check,
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
        formAssociated(),
    ],
    renderTimepicker,
);

export {};
