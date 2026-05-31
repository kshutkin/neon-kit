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
    stringAttribute,
    withInternals,
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

    // ---- Adopt any pre-set own data props ------------------------------
    // The attributes() middleware writes `host[key] = parsed` from
    // attributeChangedCallback, which fires for initial attributes
    // BEFORE render runs. Any pre-connect property assignment by user
    // code also lands as a plain own property. Snapshot then strip
    // before defineProperty replaces the slots.
    /** @type {Record<string, unknown>} */
    const preset = {};
    for (const key of ['value', 'placeholder', 'disabled', 'required', 'name']) {
        if (Object.hasOwn(host, key)) {
            preset[key] = /** @type {any} */ (host)[key];
            delete /** @type {any} */ (host)[key];
        }
    }
    // 'data-clearable' uses dashed-case; middleware writes that exact key.
    if (Object.hasOwn(host, 'data-clearable')) {
        preset['data-clearable'] = /** @type {any} */ (host)['data-clearable'];
        delete /** @type {any} */ (host)['data-clearable'];
    }

    // ---- Reactive state ------------------------------------------------
    const options = signal(/** @type {HTMLOptionElement[]} */ ([]));
    const selected = signal(/** @type {HTMLOptionElement | null} */ (null));

    /** @type {string} */
    const initialPlaceholder = typeof preset.placeholder === 'string'
        ? preset.placeholder
        : (host.getAttribute('placeholder') ?? '');
    const placeholderSig = signal(initialPlaceholder);
    const disabledSig = signal(
        typeof preset.disabled === 'boolean' ? preset.disabled : host.hasAttribute('disabled'),
    );
    const requiredSig = signal(
        typeof preset.required === 'boolean' ? preset.required : host.hasAttribute('required'),
    );
    const nameSig = signal(
        typeof preset.name === 'string' ? preset.name : (host.getAttribute('name') ?? ''),
    );
    const clearableSig = signal(
        typeof preset['data-clearable'] === 'boolean'
            ? /** @type {boolean} */ (preset['data-clearable'])
            : host.hasAttribute('data-clearable'),
    );

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
        const visible = clearableSig() && selected() !== null;
        // Inline `display` (not the `hidden` attribute) — the theme's
        // `.combobox__clear { display: inline-flex }` outranks `[hidden]`.
        clearEl.style.display = visible ? '' : 'none';
    };

    const updateValidity = () => {
        if (requiredSig() && !selected()) {
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
            return;
        }

        const prev = selected();
        // Re-entrant guard: the value-attribute reflection below writes
        // `host.value = …` through the attributes() middleware, which
        // calls back into this function via the value setter. Once
        // initialized and stable, short-circuit.
        if (initialized && opt === prev) return;
        initialized = true;

        selected.set(opt);

        // Reflect to attribute. Empty value removes the attribute to
        // match the legacy behavior.
        if (opt) {
            if (host.getAttribute('value') !== opt.value) host.setAttribute('value', opt.value);
        } else if (host.hasAttribute('value')) {
            host.removeAttribute('value');
        }

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
    Object.defineProperty(host, 'value', {
        configurable: true, enumerable: true,
        get: () => selected()?.value ?? '',
        set: (v) => applyValue(v == null ? '' : String(v), { silent: true, focusField: false }),
    });
    Object.defineProperty(host, 'placeholder', {
        configurable: true, enumerable: true,
        get: () => placeholderSig(),
        set: (v) => placeholderSig.set(v == null ? '' : String(v)),
    });
    Object.defineProperty(host, 'disabled', {
        configurable: true, enumerable: true,
        get: () => disabledSig(),
        set: (v) => disabledSig.set(!!v),
    });
    Object.defineProperty(host, 'required', {
        configurable: true, enumerable: true,
        get: () => requiredSig(),
        set: (v) => requiredSig.set(!!v),
    });
    Object.defineProperty(host, 'name', {
        configurable: true, enumerable: true,
        get: () => nameSig(),
        set: (v) => nameSig.set(v == null ? '' : String(v)),
    });
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
        get: () => elementInternals.willValidate,
    });
    /** @type {any} */ (host).checkValidity = () => elementInternals.checkValidity();
    /** @type {any} */ (host).reportValidity = () => elementInternals.reportValidity();

    // ---- Attribute-driven effects -------------------------------------
    // placeholder → DOM
    effect(() => {
        const ph = placeholderSig();
        placeholderEl.textContent = ph;
        searchInput.placeholder = ph || 'Search…';
    });
    // disabled → DOM + attribute reflection (mirrors prop change to
    // host attribute, matching the legacy setter behavior).
    effect(() => {
        const d = disabledSig();
        fieldButton.disabled = d;
        if (d) close();
        if (d) {
            if (!host.hasAttribute('disabled')) host.setAttribute('disabled', '');
        } else if (host.hasAttribute('disabled')) {
            host.removeAttribute('disabled');
        }
    });
    // required → aria + validity + attribute reflection.
    effect(() => {
        const r = requiredSig();
        if (r) fieldButton.setAttribute('aria-required', 'true');
        else fieldButton.removeAttribute('aria-required');
        if (r) {
            if (!host.hasAttribute('required')) host.setAttribute('required', '');
        } else if (host.hasAttribute('required')) {
            host.removeAttribute('required');
        }
        updateValidity();
    });
    // name → attribute reflection (ElementInternals reads the host
    // attribute directly to populate FormData).
    effect(() => {
        const n = nameSig();
        if (n === '') {
            if (host.hasAttribute('name')) host.removeAttribute('name');
        } else if (host.getAttribute('name') !== n) {
            host.setAttribute('name', n);
        }
    });
    // data-clearable → clear button visibility.
    effect(() => {
        void clearableSig();
        syncClearVisibility();
    });

    // ---- Initial paint -------------------------------------------------
    host.append(fieldButton, popover);
    collectOptions();
    initialValue = typeof preset.value === 'string' && preset.value !== ''
        ? preset.value
        : resolveInitialValue();
    applyValue(initialValue, { silent: true, focusField: false });
    renderRows('');
    // Effects scheduled above flush on a microtask; ensure validity is
    // committed at least once now so a synchronous `checkValidity()`
    // call right after mount observes the correct flags.
    updateValidity();

    // ---- Event handlers ------------------------------------------------
    /** @param {KeyboardEvent} e */
    const onFieldKeydown = (e) => {
        if (disabledSig()) return;
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
        if (disabledSig()) return;
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
        disabledSig.set(disabled);
    });

    onFormStateRestore((state) => {
        if (typeof state === 'string') {
            applyValue(state, { silent: true, focusField: false });
        }
    });

    return null;
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
            value: [stringAttribute[0]],
            placeholder: [stringAttribute[0]],
            disabled: [booleanAttribute[0]],
            required: [booleanAttribute[0]],
            name: [stringAttribute[0]],
            'data-clearable': [booleanAttribute[0]],
        }),
        withInternals(),
        formAssociated(),
    ],
    renderCombobox,
);

export {};
