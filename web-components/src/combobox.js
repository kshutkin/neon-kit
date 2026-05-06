/**
 * `<neon-combobox>` — single-select, filterable, form-associated combobox
 * built on top of the theme's `.combobox` markup.
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
 */
import { DEV } from 'esm-env';

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

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @typedef {{ value: string, option: HTMLOptionElement | null }} ChangeDetail
 * @typedef {{ query: string }} InputDetail
 */

export class NeonComboboxElement extends HTMLElement {
    static formAssociated = true;

    static get observedAttributes() {
        return ['value', 'placeholder', 'disabled', 'required', 'name', 'data-clearable'];
    }

    /** @type {ElementInternals} */
    #internals;
    /** @type {HTMLButtonElement | null} */ #fieldButton = null;
    /** @type {HTMLSpanElement | null} */ #valueEl = null;
    /** @type {HTMLSpanElement | null} */ #placeholderEl = null;
    /** @type {HTMLButtonElement | null} */ #clearEl = null;
    /** @type {HTMLDivElement | null} */ #popover = null;
    /** @type {HTMLInputElement | null} */ #searchInput = null;
    /** @type {HTMLDivElement | null} */ #listEl = null;
    /** @type {HTMLDivElement | null} */ #emptyEl = null;
    /** @type {HTMLButtonElement[]} */ #rows = [];
    /** @type {HTMLOptionElement[]} */ #options = [];
    /** @type {HTMLOptionElement | null} */ #selected = null;
    /** @type {string} */ #initialValue = '';
    /** @type {string} */ #activeId = '';
    /** @type {string} */ #popoverId = '';
    /** @type {string} */ #listId = '';
    /** @type {string} */ #idPrefix = '';
    /** @type {AbortController | null} */ #listeners = null;
    /** @type {MutationObserver | null} */ #mo = null;
    #connected = false;
    #suppressChange = false;

    constructor() {
        super();
        this.#internals = this.attachInternals();
    }

    connectedCallback() {
        if (this.#connected) return;
        this.#connected = true;

        const id = ++nextId;
        this.#idPrefix = `neon-combobox-${id}`;
        this.#popoverId = `${this.#idPrefix}-pop`;
        this.#listId = `${this.#idPrefix}-list`;

        if (!this.classList.contains('combobox')) this.classList.add('combobox');

        this.#buildUi();
        this.#collectOptions();
        this.#initialValue = this.#resolveInitialValue();
        this.#applyValue(this.#initialValue, { silent: true, focusField: false });
        this.#renderRows('');
        this.#syncDisabled();
        this.#syncRequired();
        this.#syncPlaceholder();
        this.#updateValidity();

        const ac = new AbortController();
        this.#listeners = ac;
        const opts = { signal: ac.signal };

        this.#fieldButton?.addEventListener('keydown', /** @type {EventListener} */ (this.#onFieldKeydown), opts);
        this.#clearEl?.addEventListener('click', /** @type {EventListener} */ (this.#onClearClick), opts);
        this.#searchInput?.addEventListener('input', /** @type {EventListener} */ (this.#onSearchInput), opts);
        this.#searchInput?.addEventListener('keydown', /** @type {EventListener} */ (this.#onSearchKeydown), opts);
        this.#listEl?.addEventListener('click', /** @type {EventListener} */ (this.#onListClick), opts);
        this.#popover?.addEventListener('toggle', /** @type {EventListener} */ (this.#onPopoverToggle), opts);

        this.#mo = new MutationObserver((records) => this.#handleMutations(records));
        this.#mo.observe(this, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['value', 'selected', 'disabled', 'label'],
        });
    }

    disconnectedCallback() {
        this.#listeners?.abort();
        this.#listeners = null;
        this.#mo?.disconnect();
        this.#mo = null;
        this.#connected = false;
    }

    /**
     * @param {string} name
     * @param {string | null} _oldValue
     * @param {string | null} newValue
     */
    attributeChangedCallback(name, _oldValue, newValue) {
        if (!this.#connected) return;
        switch (name) {
            case 'value':
                if (this.#suppressChange) return;
                this.#applyValue(newValue ?? '', { silent: true, focusField: false });
                break;
            case 'placeholder':
                this.#syncPlaceholder();
                break;
            case 'disabled':
                this.#syncDisabled();
                break;
            case 'required':
                this.#syncRequired();
                this.#updateValidity();
                break;
            case 'name':
                // ElementInternals reads the `name` attribute directly.
                break;
            case 'data-clearable':
                this.#syncClearVisibility();
                break;
        }
    }

    // ---- Public API ------------------------------------------------------

    get value() {
        return this.#selected?.value ?? '';
    }

    set value(v) {
        const next = v == null ? '' : String(v);
        if (!this.#connected) {
            // Before connection, stash on the attribute so connectedCallback
            // picks it up via #resolveInitialValue.
            if (next === '') this.removeAttribute('value');
            else this.setAttribute('value', next);
            return;
        }
        this.#applyValue(next, { silent: true, focusField: false });
    }

    /** @returns {HTMLOptionElement | null} */
    get selectedOption() {
        return this.#selected;
    }

    /** @returns {HTMLOptionElement[]} */
    get options() {
        return this.#options.slice();
    }

    /** @returns {boolean} */
    get open() {
        return this.#popover?.matches(':popover-open') ?? false;
    }

    /** @returns {boolean} */
    get disabled() {
        return this.hasAttribute('disabled');
    }

    set disabled(v) {
        if (v) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }

    /** @returns {boolean} */
    get required() {
        return this.hasAttribute('required');
    }

    set required(v) {
        if (v) this.setAttribute('required', '');
        else this.removeAttribute('required');
    }

    get name() {
        return this.getAttribute('name') ?? '';
    }

    set name(v) {
        if (v == null || v === '') this.removeAttribute('name');
        else this.setAttribute('name', String(v));
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
        return this.#internals.willValidate;
    }

    checkValidity() {
        return this.#internals.checkValidity();
    }

    reportValidity() {
        return this.#internals.reportValidity();
    }

    // ---- Form-associated callbacks --------------------------------------

    formAssociatedCallback() {
        // No-op: setFormValue is called from #applyValue.
    }

    formResetCallback() {
        this.#applyValue(this.#initialValue, { silent: true, focusField: false });
    }

    /**
     * @param {boolean} disabled
     */
    formDisabledCallback(disabled) {
        // Mirror to attribute so syncDisabled picks it up.
        if (disabled) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }

    /**
     * @param {string | File | FormData | null} state
     */
    formStateRestoreCallback(state) {
        if (typeof state === 'string') {
            this.#applyValue(state, { silent: true, focusField: false });
        }
    }

    // ---- UI construction ------------------------------------------------

    #buildUi() {
        // Field button
        const button = document.createElement('button');
        button.type = 'button';
        button.className = FIELD_CLASS;
        button.setAttribute('popovertarget', this.#popoverId);
        button.setAttribute('aria-haspopup', 'listbox');
        button.setAttribute('aria-controls', this.#listId);
        button.setAttribute('aria-expanded', 'false');

        const placeholder = document.createElement('span');
        placeholder.className = PLACEHOLDER_CLASS;
        placeholder.textContent = this.getAttribute('placeholder') ?? '';

        const value = document.createElement('span');
        value.className = VALUE_CLASS;
        value.hidden = true;

        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = CLEAR_CLASS;
        clear.setAttribute('aria-label', 'Clear selection');
        clear.style.display = 'none';
        clear.tabIndex = -1;
        const clearSvg = document.createElementNS(SVG_NS, 'svg');
        clearSvg.setAttribute('viewBox', '0 0 24 24');
        clearSvg.setAttribute('fill', 'none');
        clearSvg.setAttribute('stroke', 'currentColor');
        clearSvg.setAttribute('stroke-width', '2');
        clearSvg.setAttribute('aria-hidden', 'true');
        const clearPath = document.createElementNS(SVG_NS, 'path');
        clearPath.setAttribute('stroke-linecap', 'round');
        clearPath.setAttribute('stroke-linejoin', 'round');
        clearPath.setAttribute('d', 'M6 6l12 12M18 6L6 18');
        clearSvg.appendChild(clearPath);
        clear.appendChild(clearSvg);

        const chevron = document.createElementNS(SVG_NS, 'svg');
        chevron.setAttribute('class', CHEVRON_CLASS);
        chevron.setAttribute('viewBox', '0 0 24 24');
        chevron.setAttribute('fill', 'none');
        chevron.setAttribute('stroke', 'currentColor');
        chevron.setAttribute('stroke-width', '2');
        chevron.setAttribute('aria-hidden', 'true');
        const chevronPath = document.createElementNS(SVG_NS, 'path');
        chevronPath.setAttribute('stroke-linecap', 'round');
        chevronPath.setAttribute('stroke-linejoin', 'round');
        chevronPath.setAttribute('d', 'm19.5 8.25-7.5 7.5-7.5-7.5');
        chevron.appendChild(chevronPath);

        button.append(placeholder, value, clear, chevron);

        // Popover
        const popover = document.createElement('div');
        popover.id = this.#popoverId;
        popover.className = POPOVER_CLASS;
        popover.setAttribute('popover', '');

        const search = document.createElement('div');
        search.className = SEARCH_CLASS;
        const input = document.createElement('input');
        input.type = 'search';
        input.className = 'input';
        input.autocomplete = 'off';
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-controls', this.#listId);
        input.placeholder = this.getAttribute('placeholder') ?? 'Search…';
        search.appendChild(input);

        const list = document.createElement('div');
        list.id = this.#listId;
        list.className = LIST_CLASS;
        list.setAttribute('role', 'listbox');

        const empty = document.createElement('div');
        empty.className = EMPTY_CLASS;
        empty.textContent = 'No results';
        empty.hidden = true;
        list.appendChild(empty);

        popover.append(search, list);

        this.#fieldButton = button;
        this.#placeholderEl = placeholder;
        this.#valueEl = value;
        this.#clearEl = clear;
        this.#popover = popover;
        this.#searchInput = input;
        this.#listEl = list;
        this.#emptyEl = empty;

        this.append(button, popover);
    }

    #collectOptions() {
        const opts = /** @type {HTMLOptionElement[]} */ (
            Array.from(this.querySelectorAll(':scope > option'))
        );
        for (const o of opts) {
            // Hide the raw <option> defensively — Light DOM CSS may not
            // catch every consumer setup.
            if (o.style.display !== 'none') o.style.display = 'none';
        }
        this.#options = opts;
    }

    #renderRows(query) {
        if (!this.#listEl || !this.#emptyEl) return;
        // Clear existing rows (keep the empty placeholder).
        for (const row of this.#rows) row.remove();
        this.#rows = [];

        const q = query.trim().toLowerCase();
        let visible = 0;
        for (let i = 0; i < this.#options.length; i++) {
            const opt = this.#options[i];
            const label = opt.textContent ?? '';
            const matches = q === '' || label.toLowerCase().includes(q);
            if (!matches) continue;

            const row = document.createElement('button');
            row.type = 'button';
            row.className = OPTION_CLASS;
            row.id = `${this.#idPrefix}-opt-${i}`;
            row.setAttribute('role', 'option');
            row.dataset.value = opt.value;
            if (opt.disabled) {
                row.disabled = true;
                row.setAttribute('aria-disabled', 'true');
            }
            const labelEl = document.createElement('span');
            labelEl.className = OPTION_LABEL_CLASS;
            labelEl.textContent = label;
            const checkSvg = document.createElementNS(SVG_NS, 'svg');
            checkSvg.setAttribute('class', OPTION_CHECK_CLASS);
            checkSvg.setAttribute('viewBox', '0 0 24 24');
            checkSvg.setAttribute('fill', 'none');
            checkSvg.setAttribute('stroke', 'currentColor');
            checkSvg.setAttribute('stroke-width', '2.5');
            checkSvg.setAttribute('aria-hidden', 'true');
            const checkPath = document.createElementNS(SVG_NS, 'path');
            checkPath.setAttribute('stroke-linecap', 'round');
            checkPath.setAttribute('stroke-linejoin', 'round');
            checkPath.setAttribute('d', 'M4.5 12.75l6 6 9-13.5');
            checkSvg.appendChild(checkPath);
            row.append(labelEl, checkSvg);

            if (this.#selected && opt === this.#selected) {
                row.setAttribute('aria-selected', 'true');
            } else {
                row.setAttribute('aria-selected', 'false');
            }
            this.#listEl.insertBefore(row, this.#emptyEl);
            this.#rows.push(row);
            visible++;
        }
        this.#emptyEl.hidden = visible !== 0;
        // Reset active descendant — caller is responsible for setting it.
        this.#setActive(null);
    }

    /** @returns {HTMLButtonElement[]} */
    #visibleRows() {
        return this.#rows.filter((r) => !r.disabled);
    }

    /**
     * @param {HTMLButtonElement | null} row
     */
    #setActive(row) {
        if (!this.#searchInput) return;
        if (this.#activeId) {
            const prev = this.#listEl?.querySelector(`#${cssEscape(this.#activeId)}`);
            prev?.classList.remove('-active');
        }
        if (row) {
            row.classList.add('-active');
            this.#activeId = row.id;
            this.#searchInput.setAttribute('aria-activedescendant', row.id);
            // Keep the row in view inside the scrollable list.
            row.scrollIntoView({ block: 'nearest' });
        } else {
            this.#activeId = '';
            this.#searchInput.removeAttribute('aria-activedescendant');
        }
    }

    /**
     * @param {1 | -1} delta
     */
    #moveActive(delta) {
        const rows = this.#visibleRows();
        if (rows.length === 0) return;
        const currentId = this.#activeId;
        const idx = currentId ? rows.findIndex((r) => r.id === currentId) : -1;
        let next;
        if (idx < 0) {
            next = delta > 0 ? rows[0] : rows[rows.length - 1];
        } else {
            next = rows[(idx + delta + rows.length) % rows.length];
        }
        this.#setActive(next);
    }

    #activateActive() {
        if (!this.#activeId) return;
        const row = this.#rows.find((r) => r.id === this.#activeId);
        if (row) this.#selectRow(row);
    }

    /**
     * @param {HTMLButtonElement} row
     */
    #selectRow(row) {
        const v = row.dataset.value ?? '';
        this.#applyValue(v, { silent: false, focusField: true });
        this.#close();
    }

    #close() {
        if (this.#popover?.matches(':popover-open')) {
            try {
                this.#popover.hidePopover();
            } catch (e) {
                if (DEV) {
                    // eslint-disable-next-line no-console
                    console.debug('<neon-combobox>: hidePopover failed', e);
                }
            }
        }
    }

    /**
     * Apply a value to the component. When `silent` is false, dispatch a
     * `change` event. When `focusField` is true, return focus to the
     * field button after the update.
     *
     * @param {string} v
     * @param {{ silent: boolean, focusField: boolean }} opts
     */
    #applyValue(v, { silent, focusField }) {
        const opt = this.#options.find((o) => o.value === v) ?? null;
        // Match native <select>: setting an unknown non-empty value is a
        // no-op (selection unchanged). Empty string clears.
        if (v !== '' && !opt) {
            if (DEV) {
                // eslint-disable-next-line no-console
                console.debug(`<neon-combobox>: value "${v}" does not match any <option>`);
            }
            return;
        }

        const prev = this.#selected;
        this.#selected = opt;
        // Reflect to attribute (silent for our own writes).
        this.#suppressChange = true;
        if (opt) {
            if (this.getAttribute('value') !== opt.value) this.setAttribute('value', opt.value);
        } else {
            if (this.hasAttribute('value')) this.removeAttribute('value');
        }
        this.#suppressChange = false;

        this.#renderValueText();
        this.#syncClearVisibility();
        this.#refreshSelectedAria();

        // Form value
        this.#internals.setFormValue(opt ? opt.value : null);
        this.#updateValidity();

        if (!silent && prev !== opt) {
            this.dispatchEvent(
                new CustomEvent('change', {
                    bubbles: true,
                    detail: /** @type {ChangeDetail} */ ({ value: opt?.value ?? '', option: opt }),
                }),
            );
        }

        if (focusField) {
            this.#fieldButton?.focus();
        }
    }

    #refreshSelectedAria() {
        for (const row of this.#rows) {
            const isSel = !!this.#selected && row.dataset.value === this.#selected.value;
            row.setAttribute('aria-selected', isSel ? 'true' : 'false');
        }
    }

    #renderValueText() {
        if (!this.#valueEl || !this.#placeholderEl) return;
        if (this.#selected) {
            this.#valueEl.textContent = this.#selected.textContent ?? '';
            this.#valueEl.hidden = false;
            this.#placeholderEl.hidden = true;
        } else {
            this.#valueEl.textContent = '';
            this.#valueEl.hidden = true;
            this.#placeholderEl.hidden = false;
        }
    }

    #syncPlaceholder() {
        if (!this.#placeholderEl) return;
        this.#placeholderEl.textContent = this.getAttribute('placeholder') ?? '';
    }

    #syncDisabled() {
        if (!this.#fieldButton) return;
        const d = this.disabled;
        this.#fieldButton.disabled = d;
        if (d) this.#close();
    }

    #syncRequired() {
        if (!this.#fieldButton) return;
        if (this.required) this.#fieldButton.setAttribute('aria-required', 'true');
        else this.#fieldButton.removeAttribute('aria-required');
    }

    #syncClearVisibility() {
        if (!this.#clearEl) return;
        const visible = this.hasAttribute('data-clearable') && this.#selected !== null;
        // Use inline `display` rather than the `hidden` attribute because
        // `.combobox__clear { display: inline-flex }` outranks `[hidden]`.
        this.#clearEl.style.display = visible ? '' : 'none';
    }

    #updateValidity() {
        if (!this.#fieldButton) return;
        if (this.required && !this.#selected) {
            this.#internals.setValidity(
                { valueMissing: true },
                'Please select an option.',
                this.#fieldButton,
            );
        } else {
            this.#internals.setValidity({});
        }
    }

    /** @returns {string} */
    #resolveInitialValue() {
        const attr = this.getAttribute('value');
        if (attr != null) {
            const found = this.#options.find((o) => o.value === attr);
            if (found) return found.value;
        }
        const sel = this.#options.find((o) => o.hasAttribute('selected'));
        return sel ? sel.value : '';
    }

    // ---- Event handlers --------------------------------------------------

    #onFieldKeydown = (/** @type {KeyboardEvent} */ e) => {
        if (this.disabled) return;
        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowUp':
            case 'Enter':
            case ' ':
                if (!this.open) {
                    e.preventDefault();
                    try {
                        // Pass `source` so the field button becomes the
                        // implicit invoker/anchor; without it
                        // anchor-size() and position-area resolve to
                        // nothing and the popover stretches across the
                        // viewport at the top of the screen.
                        this.#popover?.showPopover({ source: this.#fieldButton ?? undefined });
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

    #onClearClick = (/** @type {MouseEvent} */ e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.disabled) return;
        if (!this.#selected) return;
        this.#applyValue('', { silent: false, focusField: true });
    };

    #onSearchInput = (/** @type {Event} */ e) => {
        // Stop the native bubbling `input` so consumers don't see two
        // events (the inner input's, plus our own CustomEvent below).
        e.stopPropagation();
        const q = this.#searchInput?.value ?? '';
        this.#renderRows(q);
        // Highlight first visible row for a smoother autocomplete feel.
        const first = this.#visibleRows()[0] ?? null;
        this.#setActive(first);
        this.dispatchEvent(
            new CustomEvent('input', {
                bubbles: true,
                detail: /** @type {InputDetail} */ ({ query: q }),
            }),
        );
    };

    #onSearchKeydown = (/** @type {KeyboardEvent} */ e) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.#moveActive(1);
                return;
            case 'ArrowUp':
                e.preventDefault();
                this.#moveActive(-1);
                return;
            case 'Home': {
                e.preventDefault();
                const rows = this.#visibleRows();
                if (rows.length) this.#setActive(rows[0]);
                return;
            }
            case 'End': {
                e.preventDefault();
                const rows = this.#visibleRows();
                if (rows.length) this.#setActive(rows[rows.length - 1]);
                return;
            }
            case 'Enter':
                e.preventDefault();
                this.#activateActive();
                return;
            case 'Escape':
                e.preventDefault();
                e.stopPropagation();
                this.#close();
                this.#fieldButton?.focus();
                return;
            case 'Tab':
                this.#close();
                return;
        }
    };

    #onListClick = (/** @type {MouseEvent} */ e) => {
        const target = /** @type {Element | null} */ (e.target);
        if (!target) return;
        const row = /** @type {HTMLButtonElement | null} */ (target.closest(`.${OPTION_CLASS}`));
        if (!row || row.disabled) return;
        this.#selectRow(row);
    };

    #onPopoverToggle = (/** @type {ToggleEvent} */ e) => {
        const open = e.newState === 'open';
        this.#fieldButton?.setAttribute('aria-expanded', open ? 'true' : 'false');
        this.#searchInput?.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            // Reset filter to full list each open.
            if (this.#searchInput) this.#searchInput.value = '';
            this.#renderRows('');
            // Highlight current selection if any, else first row.
            const currentRow = this.#selected
                ? this.#rows.find((r) => r.dataset.value === this.#selected?.value) ?? null
                : null;
            this.#setActive(currentRow ?? this.#visibleRows()[0] ?? null);
            queueMicrotask(() => this.#searchInput?.focus());
        } else {
            // Drop the active-descendant pointer so AT doesn't keep
            // referencing a now-hidden row id.
            this.#setActive(null);
        }
    };

    /**
     * @param {MutationRecord[]} records
     */
    #handleMutations(records) {
        // Only react if something inside the option set actually changed.
        let needsRebuild = false;
        for (const r of records) {
            if (r.type === 'childList') {
                for (const n of r.addedNodes) if (n.nodeName === 'OPTION') needsRebuild = true;
                for (const n of r.removedNodes) if (n.nodeName === 'OPTION') needsRebuild = true;
            } else if (r.type === 'characterData' || r.type === 'attributes') {
                const t = /** @type {Element | null} */ (r.target.nodeType === 1 ? r.target : r.target.parentElement);
                if (t && t.tagName === 'OPTION' && this.contains(t)) needsRebuild = true;
            }
        }
        if (!needsRebuild) return;

        const previousValue = this.#selected?.value ?? this.value;
        this.#collectOptions();
        // Re-resolve selection: if the previous value still exists keep
        // it, otherwise drop selection silently (matches the no-op rule).
        const stillThere = this.#options.find((o) => o.value === previousValue) ?? null;
        this.#selected = stillThere;
        if (!stillThere && this.hasAttribute('value')) {
            this.#suppressChange = true;
            this.removeAttribute('value');
            this.#suppressChange = false;
        }
        this.#renderValueText();
        this.#syncClearVisibility();
        this.#renderRows(this.#searchInput?.value ?? '');
        this.#internals.setFormValue(stillThere ? stillThere.value : null);
        this.#updateValidity();
    }
}

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
 * Define `<neon-combobox>` if it has not been registered yet. Idempotent.
 *
 * @param {string} [tagName] Optional override tag name. Defaults to `neon-combobox`.
 */
export function registerCombobox(tagName = 'neon-combobox') {
    if (typeof globalThis.customElements === 'undefined') return;
    if (!globalThis.customElements.get(tagName)) {
        globalThis.customElements.define(tagName, NeonComboboxElement);
    }
}

// Side-effect register on import.
registerCombobox();
