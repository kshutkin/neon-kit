/**
 * `<neon-multicombobox>` — multi-select, filterable, form-associated
 * combobox built on top of the theme's `.combobox.-multi` markup.
 *
 * Authoring shape (light DOM): list `<option value="…">Label</option>`
 * children. The element synthesises the field + popover markup and
 * hides the raw `<option>`s. Add `selected` to any number of options
 * to seed the initial selection.
 *
 * Per ADR 0001 the element renders into Light DOM (no shadow root).
 *
 * Rewritten on `@slimlib/element`'s `defineElement` form mirroring
 * `combobox.jsx`. The public API is assigned directly onto the host
 * inside the render closure; pre-connect property writes (`el.values =
 * [...]` before mount) are captured by snapshot+strip in render.
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
    props,
    stringAttribute,
    withInternals,
    withValidation,
} from '@slimlib/element';
import { effect, signal } from '@slimlib/store';

/**
 * `name` reflection: empty string removes the attribute (matches the
 * legacy setter). `stringAttribute` would write `name=""` instead.
 *
 * @type {[ (raw: string | null) => string | null, (value: unknown) => string | null ]}
 */
const reflectedName = [
    (raw) => raw,
    (value) => (value == null || value === '' ? null : String(value)),
];

import { SvgIcon } from './svg-icon.jsx';
import xMark from '@neon-kit/icons/outline/x-mark';
import chevronDown from '@neon-kit/icons/outline/chevron-down';

let nextId = 0;

const FIELD_CLASS = 'combobox__field';
const POPOVER_CLASS = 'combobox__popover';
const SEARCH_CLASS = 'combobox__search';
const LIST_CLASS = 'combobox__list';
const OPTION_CLASS = 'combobox__option';
const OPTION_LABEL_CLASS = 'combobox__option-label';
const VALUES_CLASS = 'combobox__values';
const PLACEHOLDER_CLASS = 'combobox__placeholder';
const CLEAR_CLASS = 'combobox__clear';
const CHEVRON_CLASS = 'combobox__chevron';
const EMPTY_CLASS = 'combobox__empty';
const TAG_CLASS = 'tag';
const TAG_REMOVE_CLASS = 'tag__remove';
const CHECKBOX_CLASS = 'checkbox';

/**
 * @typedef {{ values: string[], options: HTMLOptionElement[] }} ChangeDetail
 * @typedef {{ query: string }} InputDetail
 */

/**
 * @param {string} id
 */
function cssEscape(id) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(id);
    return id.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

/**
 * @param {Set<string>} a
 * @param {Set<string>} b
 */
function setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
}

/**
 * @param {HTMLElement} host
 */
const renderMulticombobox = (host) => {
    const elementInternals = internals();

    const id = ++nextId;
    const idPrefix = `neon-multicombobox-${id}`;
    const popoverId = `${idPrefix}-pop`;
    const listId = `${idPrefix}-list`;

    if (!host.classList.contains('combobox')) host.classList.add('combobox');
    if (!host.classList.contains('-multi')) host.classList.add('-multi');

    // ---- Adopt pre-set `values` ---------------------------------------
    // `values` keeps a hand-written accessor (the getter is derived from
    // `selected`, not stored), so the snapshot+strip pattern still
    // applies to capture a pre-upgrade `el.values = [...]` write before
    // `Object.defineProperty` replaces the slot. All other props are
    // declared via `props()` below, which auto-adopts pre-upgrade values.
    /** @type {string[] | null} */
    let presetValues = null;
    if (Object.hasOwn(host, 'values')) {
        const raw = /** @type {any} */ (host).values;
        delete /** @type {any} */ (host).values;
        if (Array.isArray(raw)) presetValues = raw.map((x) => String(x));
    }

    // ---- Reactive props (auto-adopt pre-upgrade values) ---------------
    const state = props({
        placeholder: '',
        disabled: false,
        required: false,
        name: '',
        'data-clearable': false,
    });

    // ---- Reactive state ------------------------------------------------
    const options = signal(/** @type {HTMLOptionElement[]} */ ([]));
    const selected = signal(/** @type {Set<string>} */ (new Set()));

    // ---- Imperative state ---------------------------------------------
    /** @type {HTMLLabelElement[]} */
    let rows = [];
    let activeId = '';
    /** @type {string[]} */
    let initialValues = [];
    let initialized = false;
    /** @type {AbortController | null} */
    let listeners = null;
    /** @type {MutationObserver | null} */
    let mo = null;

    // ---- DOM -----------------------------------------------------------
    const placeholderEl = /** @type {HTMLSpanElement} */ (
        <span class={PLACEHOLDER_CLASS}>{state.placeholder}</span>
    );
    const valuesEl = /** @type {HTMLSpanElement} */ (
        <span class={`tag-list ${VALUES_CLASS}`} />
    );
    const clearEl = /** @type {HTMLButtonElement} */ (
        <button type="button" class={CLEAR_CLASS} aria-label="Clear all selections" tabindex="-1" />
    );
    clearEl.style.display = 'none';
    clearEl.appendChild(SvgIcon({ def: xMark }));

    const chevronEl = SvgIcon({ class: CHEVRON_CLASS, def: chevronDown });

    const fieldButton = /** @type {HTMLButtonElement} */ (
        <button
            type="button"
            class={FIELD_CLASS}
            aria-haspopup="listbox"
            aria-controls={listId}
            aria-expanded="false"
        >
            {valuesEl}
            {placeholderEl}
            {clearEl}
            {chevronEl}
        </button>
    );
    fieldButton.setAttribute('popovertarget', popoverId);

    const searchInput = /** @type {HTMLInputElement} */ (
        <input
            type="search"
            class="input"
            autocomplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="false"
            aria-controls={listId}
            placeholder="Search…"
        />
    );

    const emptyEl = /** @type {HTMLDivElement} */ (
        <div class={EMPTY_CLASS} hidden>No results</div>
    );

    const listEl = /** @type {HTMLDivElement} */ (
        <div id={listId} class={LIST_CLASS} role="listbox" aria-multiselectable="true">{emptyEl}</div>
    );

    const popover = /** @type {HTMLDivElement} */ (
        <div id={popoverId} class={POPOVER_CLASS}>
            <div class={SEARCH_CLASS}>{searchInput}</div>
            {listEl}
        </div>
    );
    popover.setAttribute('popover', '');

    // ---- Behavior ------------------------------------------------------

    const collectOptions = () => {
        const opts = /** @type {HTMLOptionElement[]} */ (
            Array.from(host.querySelectorAll(':scope > option'))
        );
        for (const o of opts) {
            if (o.style.display !== 'none') o.style.display = 'none';
        }
        options.set(opts);
    };

    /** @returns {string[]} */
    const resolveInitialValues = () => {
        const out = [];
        for (const opt of options()) {
            if (opt.hasAttribute('selected')) out.push(opt.value);
        }
        return out;
    };

    /** @param {MouseEvent} e */
    function onTagRemoveClick(e) {
        e.preventDefault();
        e.stopPropagation();
        if (state.disabled) return;
        const target = /** @type {HTMLElement | null} */ (e.currentTarget);
        const v = target?.dataset.value ?? '';
        const sel = selected();
        if (!v || !sel.has(v)) return;
        const next = new Set(sel);
        next.delete(v);
        applyValues(Array.from(next), { silent: false });
    }

    /** @param {string} query */
    const renderRows = (query) => {
        for (const row of rows) row.remove();
        rows = [];

        const q = query.trim().toLowerCase();
        const opts = options();
        const sel = selected();
        let visible = 0;
        for (let i = 0; i < opts.length; i++) {
            const opt = opts[i];
            const label = opt.textContent ?? '';
            const matches = q === '' || label.toLowerCase().includes(q);
            if (!matches) continue;

            const checked = sel.has(opt.value);
            const row = /** @type {HTMLLabelElement} */ (
                <label
                    class={OPTION_CLASS}
                    id={`${idPrefix}-opt-${i}`}
                    role="option"
                    data-value={opt.value}
                />
            );

            const cb = /** @type {HTMLInputElement} */ (
                <input type="checkbox" class={CHECKBOX_CLASS} tabindex="-1" />
            );
            cb.checked = checked;
            if (opt.disabled) {
                cb.disabled = true;
                row.setAttribute('aria-disabled', 'true');
            }

            const labelEl = /** @type {HTMLSpanElement} */ (
                <span class={OPTION_LABEL_CLASS}>{label}</span>
            );

            row.append(cb, labelEl);
            row.setAttribute('aria-selected', checked ? 'true' : 'false');

            listEl.insertBefore(row, emptyEl);
            rows.push(row);
            visible++;
        }
        emptyEl.hidden = visible !== 0;
        setActive(null);
    };

    /** @returns {HTMLLabelElement[]} */
    const visibleRows = () => rows.filter((r) => r.getAttribute('aria-disabled') !== 'true');

    /** @param {HTMLLabelElement | null} row */
    const setActive = (row) => {
        if (activeId) {
            const prev = listEl.querySelector(`#${cssEscape(activeId)}`);
            prev?.classList.remove('-active');
        }
        if (row) {
            row.classList.add('-active');
            activeId = row.id;
            searchInput.setAttribute('aria-activedescendant', row.id);
            row.scrollIntoView({ block: 'nearest' });
        } else {
            activeId = '';
            searchInput.removeAttribute('aria-activedescendant');
        }
    };

    /** @param {1 | -1} delta */
    const moveActive = (delta) => {
        const list = visibleRows();
        if (list.length === 0) return;
        const idx = activeId ? list.findIndex((r) => r.id === activeId) : -1;
        let next;
        if (idx < 0) next = delta > 0 ? list[0] : list[list.length - 1];
        else next = list[(idx + delta + list.length) % list.length];
        setActive(next);
    };

    const toggleActive = () => {
        if (!activeId) return;
        const row = rows.find((r) => r.id === activeId);
        if (row) toggleRow(row);
    };

    /** @param {HTMLLabelElement} row */
    const toggleRow = (row) => {
        if (row.getAttribute('aria-disabled') === 'true') return;
        const v = row.dataset.value ?? '';
        if (!v) return;
        const next = new Set(selected());
        if (next.has(v)) next.delete(v);
        else next.add(v);
        applyValues(Array.from(next), { silent: false });
    };

    const close = () => {
        if (popover.matches(':popover-open')) {
            try {
                popover.hidePopover();
            } catch (e) {
                if (DEV) {
                    // eslint-disable-next-line no-console
                    console.debug('<neon-multicombobox>: hidePopover failed', e);
                }
            }
        }
    };

    const renderTags = () => {
        while (valuesEl.firstChild) valuesEl.removeChild(valuesEl.firstChild);

        const sel = selected();
        const ordered = options().filter((o) => sel.has(o.value));
        for (const opt of ordered) {
            const remove = /** @type {HTMLButtonElement} */ (
                <button
                    type="button"
                    class={TAG_REMOVE_CLASS}
                    tabindex="-1"
                    aria-label={`Remove ${opt.textContent ?? opt.value}`}
                    data-value={opt.value}
                    on:click={onTagRemoveClick}
                />
            );
            remove.appendChild(SvgIcon({ def: xMark }));

            const tag = /** @type {HTMLSpanElement} */ (
                <span class={TAG_CLASS} data-value={opt.value} />
            );
            tag.append(document.createTextNode((opt.textContent ?? '') + ' '), remove);
            valuesEl.appendChild(tag);
        }

        placeholderEl.hidden = ordered.length !== 0;
    };

    const syncRowChecks = () => {
        const sel = selected();
        for (const row of rows) {
            const v = row.dataset.value ?? '';
            const checked = sel.has(v);
            const cb = /** @type {HTMLInputElement | null} */ (
                row.querySelector(`.${CHECKBOX_CLASS}`)
            );
            if (cb && cb.checked !== checked) cb.checked = checked;
            row.setAttribute('aria-selected', checked ? 'true' : 'false');
        }
    };

    const updateFormValue = () => {
        const name = state.name;
        const sel = selected();
        if (!name || sel.size === 0) {
            elementInternals.setFormValue(null);
            return;
        }
        const fd = new FormData();
        for (const opt of options()) {
            if (sel.has(opt.value)) fd.append(name, opt.value);
        }
        elementInternals.setFormValue(fd);
    };

    const syncClearVisibility = () => {
        const visible = state['data-clearable'] && selected().size > 0;
        clearEl.style.display = visible ? '' : 'none';
    };

    const updateValidity = () => {
        if (state.required && selected().size === 0) {
            elementInternals.setValidity(
                { valueMissing: true },
                'Please select at least one option.',
                fieldButton,
            );
        } else {
            elementInternals.setValidity({});
        }
    };

    /**
     * @param {Iterable<string>} input
     * @param {{ silent: boolean }} opts
     */
    const applyValues = (input, { silent }) => {
        const known = new Set(options().map((o) => o.value));
        const next = new Set();
        for (const raw of input) {
            const v = String(raw);
            if (known.has(v)) {
                next.add(v);
            } else if (DEV) {
                // eslint-disable-next-line no-console
                console.warn(`<neon-multicombobox>: dropped unknown value "${v}"`);
            }
        }

        const prev = selected();
        const same = setsEqual(prev, next);
        // Re-entrancy guard: skip duplicate work after init.
        if (initialized && same) return;
        initialized = true;

        selected.set(next);

        renderTags();
        syncRowChecks();
        syncClearVisibility();
        updateFormValue();
        updateValidity();

        if (!silent && !same) {
            host.dispatchEvent(
                new CustomEvent('change', {
                    bubbles: true,
                    detail: /** @type {ChangeDetail} */ ({
                        values: options().filter((o) => next.has(o.value)).map((o) => o.value),
                        options: options().filter((o) => next.has(o.value)),
                    }),
                }),
            );
        }
    };

    // ---- Public host API ----------------------------------------------
    // placeholder, disabled, required, name, data-clearable are declared
    // via props() above (reactive accessors installed on host).
    Object.defineProperty(host, 'values', {
        configurable: true, enumerable: true,
        get: () => options().filter((o) => selected().has(o.value)).map((o) => o.value),
        set: (v) => {
            const next = v == null ? [] : Array.from(v, (x) => String(x));
            applyValues(next, { silent: true });
        },
    });
    Object.defineProperty(host, 'value', {
        configurable: true, enumerable: true,
        get: () => /** @type {any} */ (host).values.join(','),
    });
    Object.defineProperty(host, 'selectedOptions', {
        configurable: true, enumerable: true,
        get: () => options().filter((o) => selected().has(o.value)),
    });
    Object.defineProperty(host, 'options', {
        configurable: true, enumerable: true,
        get: () => options().slice(),
    });
    Object.defineProperty(host, 'open', {
        configurable: true, enumerable: true,
        get: () => popover.matches(':popover-open'),
    });

    // ---- Attribute-driven effects -------------------------------------
    // Bidirectional reflection (disabled, required, name) is handled by
    // the attributes() middleware below; these effects only touch DOM
    // and side-effect logic.
    effect(() => {
        placeholderEl.textContent = state.placeholder;
    });
    effect(() => {
        const d = state.disabled;
        fieldButton.disabled = d;
        if (d) close();
    });
    effect(() => {
        const r = state.required;
        if (r) fieldButton.setAttribute('aria-required', 'true');
        else fieldButton.removeAttribute('aria-required');
        updateValidity();
    });
    effect(() => {
        void state.name;
        updateFormValue();
    });
    effect(() => {
        void state['data-clearable'];
        syncClearVisibility();
    });

    // ---- Initial paint -------------------------------------------------
    // fieldButton must be a descendant of the host before initial
    // `updateValidity()` — ElementInternals.setValidity rejects an
    // anchor outside the host's tree. So mount imperatively here and
    // return `null` from render rather than returning JSX nodes whose
    // mount happens AFTER this function returns.
    host.append(fieldButton, popover);
    collectOptions();
    initialValues = resolveInitialValues();
    applyValues(presetValues ?? initialValues, { silent: true });
    renderRows('');
    updateValidity();

    // ---- Event handlers ------------------------------------------------
    /** @param {KeyboardEvent} e */
    const onFieldKeydown = (e) => {
        if (state.disabled) return;
        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowUp':
            case 'Enter':
            case ' ':
                if (!popover.matches(':popover-open')) {
                    e.preventDefault();
                    try {
                        /** @type {any} */ (popover).showPopover({ source: fieldButton });
                    } catch (err) {
                        if (DEV) {
                            // eslint-disable-next-line no-console
                            console.debug('<neon-multicombobox>: showPopover failed', err);
                        }
                    }
                }
                return;
        }
    };

    /** @param {MouseEvent} e */
    const onClearClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state.disabled) return;
        if (selected().size === 0) return;
        applyValues([], { silent: false });
    };

    /** @param {Event} e */
    const onSearchInput = (e) => {
        e.stopPropagation();
        const q = searchInput.value;
        renderRows(q);
        const first = visibleRows()[0] ?? null;
        setActive(first);
        host.dispatchEvent(
            new CustomEvent('input', {
                bubbles: true,
                detail: /** @type {InputDetail} */ ({ query: q }),
            }),
        );
    };

    /** @param {KeyboardEvent} e */
    const onSearchKeydown = (e) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                moveActive(1);
                return;
            case 'ArrowUp':
                e.preventDefault();
                moveActive(-1);
                return;
            case 'Home': {
                e.preventDefault();
                const list = visibleRows();
                if (list.length) setActive(list[0]);
                return;
            }
            case 'End': {
                e.preventDefault();
                const list = visibleRows();
                if (list.length) setActive(list[list.length - 1]);
                return;
            }
            case 'Enter':
            case ' ': {
                if (e.key === ' ' && searchInput.value !== '') return;
                e.preventDefault();
                toggleActive();
                return;
            }
            case 'Escape':
                e.preventDefault();
                e.stopPropagation();
                close();
                fieldButton.focus();
                return;
            case 'Tab':
                close();
                return;
        }
    };

    /** @param {MouseEvent} e */
    const onListClick = (e) => {
        const target = /** @type {Element | null} */ (e.target);
        if (!target) return;
        const row = /** @type {HTMLLabelElement | null} */ (target.closest(`.${OPTION_CLASS}`));
        if (!row) return;
        if (rows.includes(row)) setActive(row);
    };

    /** @param {Event} e */
    const onListChange = (e) => {
        const target = /** @type {HTMLInputElement | null} */ (e.target);
        if (!target || target.type !== 'checkbox') return;
        e.stopPropagation();
        const row = /** @type {HTMLLabelElement | null} */ (target.closest(`.${OPTION_CLASS}`));
        if (!row) return;
        const v = row.dataset.value ?? '';
        if (!v) return;
        const next = new Set(selected());
        if (target.checked) next.add(v);
        else next.delete(v);
        applyValues(Array.from(next), { silent: false });
    };

    const onListMouseleave = () => {
        setActive(null);
    };

    /** @param {ToggleEvent} e */
    const onPopoverToggle = (e) => {
        const open = e.newState === 'open';
        fieldButton.setAttribute('aria-expanded', open ? 'true' : 'false');
        searchInput.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            searchInput.value = '';
            renderRows('');
            setActive(visibleRows()[0] ?? null);
            queueMicrotask(() => searchInput.focus());
        } else {
            setActive(null);
        }
    };

    /** @param {MutationRecord[]} records */
    const handleMutations = (records) => {
        let needsRebuild = false;
        for (const r of records) {
            if (r.type === 'childList') {
                for (const n of r.addedNodes) if (n.nodeName === 'OPTION') needsRebuild = true;
                for (const n of r.removedNodes) if (n.nodeName === 'OPTION') needsRebuild = true;
            } else if (r.type === 'characterData' || r.type === 'attributes') {
                const t = /** @type {Element | null} */ (
                    r.target.nodeType === 1 ? r.target : r.target.parentElement
                );
                if (t && t.tagName === 'OPTION' && host.contains(t)) needsRebuild = true;
            }
        }
        if (!needsRebuild) return;

        const previous = new Set(selected());
        collectOptions();
        const known = new Set(options().map((o) => o.value));
        const next = Array.from(previous).filter((v) => known.has(v));
        applyValues(next, { silent: true });
        renderRows(searchInput.value);
    };

    // ---- Lifecycle wiring ---------------------------------------------
    onConnect(() => {
        const ac = new AbortController();
        listeners = ac;
        const opts = { signal: ac.signal };

        fieldButton.addEventListener('keydown', /** @type {EventListener} */ (onFieldKeydown), opts);
        clearEl.addEventListener('click', /** @type {EventListener} */ (onClearClick), opts);
        searchInput.addEventListener('input', /** @type {EventListener} */ (onSearchInput), opts);
        searchInput.addEventListener('keydown', /** @type {EventListener} */ (onSearchKeydown), opts);
        listEl.addEventListener('click', /** @type {EventListener} */ (onListClick), opts);
        listEl.addEventListener('change', /** @type {EventListener} */ (onListChange), opts);
        listEl.addEventListener('mouseleave', /** @type {EventListener} */ (onListMouseleave), opts);
        popover.addEventListener('toggle', /** @type {EventListener} */ (onPopoverToggle), opts);

        mo = new MutationObserver(handleMutations);
        mo.observe(host, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['value', 'selected', 'disabled', 'label'],
        });
    });

    onDisconnect(() => {
        listeners?.abort();
        listeners = null;
        mo?.disconnect();
        mo = null;
    });

    onFormReset(() => {
        applyValues(initialValues, { silent: true });
    });

    onFormDisabled((disabled) => {
        state.disabled = disabled;
    });

    onFormStateRestore((state2) => {
        if (state2 instanceof FormData) {
            const all = state.name ? state2.getAll(state.name) : [];
            applyValues(all.map((x) => String(x)), { silent: true });
        }
    });

    return null;
};

/**
 * Public instance type of the `<neon-multicombobox>` element.
 *
 * @typedef {HTMLElement & {
 *   values: string[],
 *   readonly value: string,
 *   placeholder: string,
 *   disabled: boolean,
 *   required: boolean,
 *   name: string,
 *   readonly selectedOptions: HTMLOptionElement[],
 *   readonly options: HTMLOptionElement[],
 *   readonly open: boolean,
 *   readonly form: HTMLFormElement | null,
 *   readonly validity: ValidityState,
 *   readonly validationMessage: string,
 *   readonly willValidate: boolean,
 *   checkValidity(): boolean,
 *   reportValidity(): boolean,
 * }} NeonMulticomboboxElement
 */

defineElement(
    'neon-multicombobox',
    [
        attributes({
            placeholder: [stringAttribute[0]],
            disabled: booleanAttribute,
            required: booleanAttribute,
            name: reflectedName,
            'data-clearable': [booleanAttribute[0]],
        }),
        withInternals(),
        withValidation(),
        formAssociated(),
    ],
    renderMulticombobox,
);

export {};
