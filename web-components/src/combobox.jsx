/**
 * `<neon-combobox>` — single-select, filterable, form-associated
 * combobox built on top of the theme's `.combobox` markup.
 *
 * Authoring shape (light DOM): list `<option value="…">Label</option>`
 * children. The element synthesises the field + popover markup and
 * hides the raw `<option>`s.
 *
 *   <neon-combobox name="country" required>
 *     <option value="us">United States</option>
 *     <option value="uk">United Kingdom</option>
 *   </neon-combobox>
 *
 * Implements the WAI-ARIA "combobox with list autocomplete (manual
 * selection)" pattern: focus stays on the search input, the listbox is
 * the popover, and `aria-activedescendant` tracks the highlighted row.
 *
 * Light DOM only — see docs/adr/0001-rendering-mode.md.
 *
 * Pilot rewrite on `@slimlib/element`'s `defineElement` form: no
 * shared base class, no Symbol-keyed prototype bridge. The element is
 * registered immediately on module import; the public instance API is
 * assigned directly onto the host inside the render closure. Attribute
 * observation flows through the `attributes()` middleware (no
 * hand-written `attributeChangedCallback`). Selection / options /
 * filter query are held as `@slimlib/store` signals. Synchronous
 * effects from `@slimlib/store` are allowed to flush on their natural
 * microtask — the spec wraps assertions that follow public writes in a
 * `tick`.
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
import xMark from '@neon-kit/icons/outline/x-mark';
import chevronDown from '@neon-kit/icons/outline/chevron-down';
import check from '@neon-kit/icons/outline/check';

let nextId = 0;

const FIELD_CLASS = 'combobox__field';
const POPOVER_CLASS = 'combobox__popover';
const SEARCH_CLASS = 'combobox__search';
const LIST_CLASS = 'combobox__list';
const OPTION_CLASS = 'combobox__option';
const OPTION_LABEL_CLASS = 'combobox__option-label';
const OPTION_CHECK_CLASS = 'combobox__option-check';
const VALUE_CLASS = 'combobox__value';
const PLACEHOLDER_CLASS = 'combobox__placeholder';
const CLEAR_CLASS = 'combobox__clear';
const CHEVRON_CLASS = 'combobox__chevron';
const EMPTY_CLASS = 'combobox__empty';

/**
 * @typedef {{ value: string, option: HTMLOptionElement | null }} ChangeDetail
 * @typedef {{ query: string }} InputDetail
 */

/**
 * CSS.escape with a safe fallback for old environments.
 *
 * @param {string} id
 * @returns {string}
 */
function cssEscape(id) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(id);
    return id.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

/**
 * @param {HTMLElement} host
 */
const renderCombobox = (host) => {
    const elementInternals = internals();

    const id = ++nextId;
    const idPrefix = `neon-combobox-${id}`;
    const popoverId = `${idPrefix}-pop`;
    const listId = `${idPrefix}-list`;

    if (!host.classList.contains('combobox')) host.classList.add('combobox');

    // ---- Reactive props (synchronously declared at render top) --------
    // `props()` installs reactive accessors for these keys on `host` and
    // auto-adopts any pre-upgrade own-property values written by the
    // attributes() middleware before render ran.
    const state = props({
        value: '',
        placeholder: '',
        disabled: false,
        required: false,
        name: '',
        'data-clearable': false,
    });

    // ---- Reactive state ------------------------------------------------
    const options = signal(/** @type {HTMLOptionElement[]} */ ([]));
    const selected = signal(/** @type {HTMLOptionElement | null} */ (null));

    const initialPlaceholder = state.placeholder;

    // ---- Imperative state ---------------------------------------------
    /** @type {HTMLButtonElement[]} */
    let rows = [];
    let activeId = '';
    let initialValue = '';
    let initialized = false;
    /** @type {AbortController | null} */
    let listeners = null;
    /** @type {MutationObserver | null} */
    let mo = null;

    // ---- DOM -----------------------------------------------------------
    const placeholderEl = /** @type {HTMLSpanElement} */ (
        <span class={PLACEHOLDER_CLASS}>{initialPlaceholder}</span>
    );
    const valueEl = /** @type {HTMLSpanElement} */ (<span class={VALUE_CLASS} hidden />);
    const clearEl = /** @type {HTMLButtonElement} */ (
        <button type="button" class={CLEAR_CLASS} aria-label="Clear selection" tabindex="-1" />
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
            {placeholderEl}
            {valueEl}
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
            placeholder={initialPlaceholder || 'Search…'}
        />
    );

    const emptyEl = /** @type {HTMLDivElement} */ (
        <div class={EMPTY_CLASS} hidden>No results</div>
    );

    const listEl = /** @type {HTMLDivElement} */ (
        <div id={listId} class={LIST_CLASS} role="listbox">{emptyEl}</div>
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

    /** @returns {string} */
    const resolveInitialValue = () => {
        const attr = host.getAttribute('value');
        const opts = options();
        if (attr != null) {
            const found = opts.find((o) => o.value === attr);
            if (found) return found.value;
        }
        const sel = opts.find((o) => o.hasAttribute('selected'));
        return sel ? sel.value : '';
    };

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

            const row = /** @type {HTMLButtonElement} */ (
                <button
                    type="button"
                    class={OPTION_CLASS}
                    id={`${idPrefix}-opt-${i}`}
                    role="option"
                    data-value={opt.value}
                >
                    <span class={OPTION_LABEL_CLASS}>{label}</span>
                </button>
            );
            if (opt.disabled) {
                row.disabled = true;
                row.setAttribute('aria-disabled', 'true');
            }
            row.appendChild(SvgIcon({ class: OPTION_CHECK_CLASS, strokeWidth: '2.5', def: check }));
            row.setAttribute('aria-selected', sel && opt === sel ? 'true' : 'false');

            listEl.insertBefore(row, emptyEl);
            rows.push(row);
            visible++;
        }
        emptyEl.hidden = visible !== 0;
        setActive(null);
    };

    /** @returns {HTMLButtonElement[]} */
    const visibleRows = () => rows.filter((r) => !r.disabled);

    /** @param {HTMLButtonElement | null} row */
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

    const activateActive = () => {
        if (!activeId) return;
        const row = rows.find((r) => r.id === activeId);
        if (row) selectRow(row);
    };

    /** @param {HTMLButtonElement} row */
    const selectRow = (row) => {
        const v = row.dataset.value ?? '';
        applyValue(v, { silent: false, focusField: true });
        close();
    };

    const close = () => {
        if (popover.matches(':popover-open')) {
            try {
                popover.hidePopover();
            } catch (e) {
                if (DEV) {
                    // eslint-disable-next-line no-console
                    console.debug('<neon-combobox>: hidePopover failed', e);
                }
            }
        }
    };

    const refreshSelectedAria = () => {
        const sel = selected();
        for (const row of rows) {
            const isSel = !!sel && row.dataset.value === sel.value;
            row.setAttribute('aria-selected', isSel ? 'true' : 'false');
        }
    };

    const renderValueText = () => {
        const sel = selected();
        if (sel) {
            valueEl.textContent = sel.textContent ?? '';
            valueEl.hidden = false;
            placeholderEl.hidden = true;
        } else {
            valueEl.textContent = '';
            valueEl.hidden = true;
            placeholderEl.hidden = false;
        }
    };

    const syncClearVisibility = () => {
        const visible = state['data-clearable'] && selected() !== null;
        // Inline `display` (not the `hidden` attribute) — the theme's
        // `.combobox__clear { display: inline-flex }` outranks `[hidden]`.
        clearEl.style.display = visible ? '' : 'none';
    };

    const updateValidity = () => {
        // The validation anchor must be a descendant of the host.
        // Skip while the returned JSX hasn't been mounted yet — the
        // initial validity gets committed explicitly from onMount().
        if (!host.contains(fieldButton)) return;
        if (state.required && !selected()) {
            elementInternals.setValidity(
                { valueMissing: true },
                'Please select an option.',
                fieldButton,
            );
        } else {
            elementInternals.setValidity({});
        }
    };

    /**
     * @param {string} v
     * @param {{ silent: boolean, focusField: boolean }} opts
     */
    const applyValue = (v, { silent, focusField }) => {
        const opt = options().find((o) => o.value === v) ?? null;
        // Match native <select>: setting an unknown non-empty value is
        // a no-op (selection unchanged). Empty string clears.
        if (v !== '' && !opt) {
            if (DEV) {
                // eslint-disable-next-line no-console
                console.debug(`<neon-combobox>: value "${v}" does not match any <option>`);
            }
            // The value prop is reactive via props(); a write of an
            // unknown value would otherwise leave state.value stuck on
            // a bogus string while `selected` stays on the real option.
            const curValue = selected()?.value ?? '';
            if (state.value !== curValue) state.value = curValue;
            return;
        }

        const prev = selected();
        // Re-entrant guard: the value-attribute reflection below writes
        // `host.value = …` through the attributes() middleware, which
        // re-enters via the value setter. Once initialized and stable,
        // short-circuit.
        if (initialized && opt === prev) {
            const newValue = opt?.value ?? '';
            if (state.value !== newValue) state.value = newValue;
            return;
        }
        initialized = true;

        selected.set(opt);

        // Reflect to attribute. Empty value removes the attribute to
        // match the legacy behavior. Kept manual because the
        // re-entrancy guard above straddles attribute, prop and
        // `selected` signal updates that a [parse, serialize] tuple
        // cannot express.
        if (opt) {
            if (host.getAttribute('value') !== opt.value) host.setAttribute('value', opt.value);
        } else if (host.hasAttribute('value')) {
            host.removeAttribute('value');
        }

        // Sync the reactive `value` prop with the resolved selection so
        // `host.value` reads back what was actually accepted.
        const newValue = opt?.value ?? '';
        if (state.value !== newValue) state.value = newValue;

        renderValueText();
        syncClearVisibility();
        refreshSelectedAria();

        elementInternals.setFormValue(opt ? opt.value : null);
        updateValidity();

        if (!silent && prev !== opt) {
            host.dispatchEvent(
                new CustomEvent('change', {
                    bubbles: true,
                    detail: /** @type {ChangeDetail} */ ({ value: opt?.value ?? '', option: opt }),
                }),
            );
        }

        if (focusField) fieldButton.focus();
    };

    // ---- Public host API ----------------------------------------------
    // `value`, `placeholder`, `disabled`, `required`, `name` and
    // `data-clearable` are installed by `props()` above.
    Object.defineProperty(host, 'selectedOption', {
        configurable: true, enumerable: true,
        get: () => selected(),
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
    // placeholder → DOM
    effect(() => {
        const ph = state.placeholder;
        placeholderEl.textContent = ph;
        searchInput.placeholder = ph || 'Search…';
    });
    // disabled → DOM. Attribute reflection is handled by the
    // booleanAttribute serializer in attributes() below.
    effect(() => {
        const d = state.disabled;
        fieldButton.disabled = d;
        if (d) close();
    });
    // required → aria + validity. Attribute reflection is handled by
    // the booleanAttribute serializer in attributes() below.
    effect(() => {
        const r = state.required;
        if (r) fieldButton.setAttribute('aria-required', 'true');
        else fieldButton.removeAttribute('aria-required');
        updateValidity();
    });
    // data-clearable → clear button visibility. Attribute reflection
    // not needed (this is read-only `data-*` from the author).
    effect(() => {
        void state['data-clearable'];
        syncClearVisibility();
    });

    // ---- Initial paint -------------------------------------------------
    collectOptions();
    initialValue = state.value !== '' ? state.value : resolveInitialValue();
    applyValue(initialValue, { silent: true, focusField: false });
    renderRows('');
    // Drive `selected` from external writes to the reactive `value`
    // prop (e.g. attribute changes routed via attributeChangedCallback,
    // or direct `host.value = …` assignments). Installed AFTER the
    // initial applyValue so the first effect run is a no-op via the
    // re-entrancy guard rather than a missed-options warning.
    effect(() => {
        applyValue(state.value, { silent: true, focusField: false });
    });
    // Effects scheduled above flush on a microtask; ensure validity is
    // committed at least once now so a synchronous `checkValidity()`
    // call right after mount observes the correct flags.
    onMount(() => {
        updateValidity();
    });

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
                            console.debug('<neon-combobox>: showPopover failed', err);
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
        if (!selected()) return;
        applyValue('', { silent: false, focusField: true });
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
                e.preventDefault();
                activateActive();
                return;
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
        const row = /** @type {HTMLButtonElement | null} */ (target.closest(`.${OPTION_CLASS}`));
        if (!row || row.disabled) return;
        selectRow(row);
    };

    /** @param {ToggleEvent} e */
    const onPopoverToggle = (e) => {
        const open = e.newState === 'open';
        fieldButton.setAttribute('aria-expanded', open ? 'true' : 'false');
        searchInput.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            searchInput.value = '';
            renderRows('');
            const sel = selected();
            const currentRow = sel
                ? rows.find((r) => r.dataset.value === sel.value) ?? null
                : null;
            setActive(currentRow ?? visibleRows()[0] ?? null);
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

        const sel = selected();
        const previousValue = sel?.value ?? (host.getAttribute('value') ?? '');
        collectOptions();
        const stillThere = options().find((o) => o.value === previousValue) ?? null;
        selected.set(stillThere);
        if (!stillThere && host.hasAttribute('value')) {
            host.removeAttribute('value');
        }
        renderValueText();
        syncClearVisibility();
        renderRows(searchInput.value);
        elementInternals.setFormValue(stillThere ? stillThere.value : null);
        updateValidity();
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
        applyValue(initialValue, { silent: true, focusField: false });
    });

    onFormDisabled((disabled) => {
        state.disabled = disabled;
    });

    onFormStateRestore((restored) => {
        if (typeof restored === 'string') {
            applyValue(restored, { silent: true, focusField: false });
        }
    });

    return [fieldButton, popover];
};

/**
 * Public instance type of the `<neon-combobox>` element. Use via
 * `document.createElement('neon-combobox')` /
 * `document.querySelector('neon-combobox')` — both are typed through
 * the `HTMLElementTagNameMap` augmentation in
 * `types/index.d.ts`.
 *
 * @typedef {HTMLElement & {
 *   value: string,
 *   placeholder: string,
 *   disabled: boolean,
 *   required: boolean,
 *   name: string,
 *   readonly selectedOption: HTMLOptionElement | null,
 *   readonly options: HTMLOptionElement[],
 *   readonly open: boolean,
 *   readonly form: HTMLFormElement | null,
 *   readonly validity: ValidityState,
 *   readonly validationMessage: string,
 *   readonly willValidate: boolean,
 *   checkValidity(): boolean,
 *   reportValidity(): boolean,
 * }} NeonComboboxElement
 */

defineElement(
    'neon-combobox',
    [
        attributes({
            // Parse-only: value reflection is performed manually inside
            // applyValue() because the re-entrancy guard across the
            // value attribute, the `value` prop and the `selected`
            // signal cannot be expressed as a [parse, serialize] pair.
            value: [stringAttribute[0]],
            placeholder: [stringAttribute[0]],
            disabled: booleanAttribute,
            required: booleanAttribute,
            name: stringAttribute,
            'data-clearable': [booleanAttribute[0]],
        }),
        withInternals(),
        withValidation(),
        formAssociated(),
    ],
    renderCombobox,
);

export {};
