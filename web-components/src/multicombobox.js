/**
 * `<neon-multicombobox>` — multi-select, filterable, form-associated
 * combobox built on top of the theme's `.combobox.-multi` markup.
 *
 * Authoring shape (light DOM): list `<option value="…">Label</option>`
 * children. The element synthesises the field + popover markup and
 * hides the raw `<option>`s. Add `selected` to any number of options
 * to seed the initial selection.
 *
 *   <neon-multicombobox name="country" required placeholder="Pick…">
 *     <option value="us" selected>United States</option>
 *     <option value="uk">United Kingdom</option>
 *   </neon-multicombobox>
 *
 * Selected items render as `.tag` chips inside the field; the popover
 * lists `<label>` rows wrapping a real `<input type="checkbox">`. Form
 * submission appends one `FormData` entry per selected value (matching
 * native `<select multiple>` semantics).
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
const VALUES_CLASS = 'combobox__values';
const PLACEHOLDER_CLASS = 'combobox__placeholder';
const CLEAR_CLASS = 'combobox__clear';
const CHEVRON_CLASS = 'combobox__chevron';
const EMPTY_CLASS = 'combobox__empty';
const TAG_CLASS = 'tag';
const TAG_REMOVE_CLASS = 'tag__remove';
const CHECKBOX_CLASS = 'checkbox';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @typedef {{ values: string[], options: HTMLOptionElement[] }} ChangeDetail
 * @typedef {{ query: string }} InputDetail
 */

export class NeonMulticomboboxElement extends HTMLElement {
    static formAssociated = true;

    static get observedAttributes() {
        return ['placeholder', 'disabled', 'required', 'name', 'data-clearable'];
    }

    /** @type {ElementInternals} */
    #internals;
    /** @type {HTMLButtonElement | null} */ #fieldButton = null;
    /** @type {HTMLSpanElement | null} */ #valuesEl = null;
    /** @type {HTMLSpanElement | null} */ #placeholderEl = null;
    /** @type {HTMLButtonElement | null} */ #clearEl = null;
    /** @type {HTMLDivElement | null} */ #popover = null;
    /** @type {HTMLInputElement | null} */ #searchInput = null;
    /** @type {HTMLDivElement | null} */ #listEl = null;
    /** @type {HTMLDivElement | null} */ #emptyEl = null;
    /** @type {HTMLLabelElement[]} */ #rows = [];
    /** @type {HTMLOptionElement[]} */ #options = [];
    /** @type {Set<string>} */ #selected = new Set();
    /** @type {string[]} */ #initialValues = [];
    /** @type {string} */ #activeId = '';
    /** @type {string} */ #popoverId = '';
    /** @type {string} */ #listId = '';
    /** @type {string} */ #idPrefix = '';
    /** @type {AbortController | null} */ #listeners = null;
    /** @type {MutationObserver | null} */ #mo = null;
    #connected = false;
    /** Stash for `values` set before connection. */
    /** @type {string[] | null} */ #pendingValues = null;

    constructor() {
        super();
        this.#internals = this.attachInternals();
    }

    connectedCallback() {
        if (this.#connected) return;
        this.#connected = true;

        const id = ++nextId;
        this.#idPrefix = `neon-multicombobox-${id}`;
        this.#popoverId = `${this.#idPrefix}-pop`;
        this.#listId = `${this.#idPrefix}-list`;

        if (!this.classList.contains('combobox')) this.classList.add('combobox');
        if (!this.classList.contains('-multi')) this.classList.add('-multi');

        this.#buildUi();
        this.#collectOptions();
        this.#initialValues = this.#resolveInitialValues();
        const initial = this.#pendingValues ?? this.#initialValues;
        this.#pendingValues = null;
        this.#applyValues(initial, { silent: true });
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
        this.#listEl?.addEventListener('change', /** @type {EventListener} */ (this.#onListChange), opts);
        this.#listEl?.addEventListener('mouseleave', /** @type {EventListener} */ (this.#onListMouseleave), opts);
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
                break;
            case 'data-clearable':
                this.#syncClearVisibility();
                break;
        }
        void newValue;
    }

    // ---- Public API ------------------------------------------------------

    /**
     * Defensive copy of the currently selected values, in option order.
     * @returns {string[]}
     */
    get values() {
        return this.#options
            .filter((o) => this.#selected.has(o.value))
            .map((o) => o.value);
    }

    /** @param {readonly string[] | ReadonlySet<string> | null | undefined} v */
    set values(v) {
        const next = v == null ? [] : Array.from(v, (x) => String(x));
        if (!this.#connected) {
            this.#pendingValues = next;
            return;
        }
        this.#applyValues(next, { silent: true });
    }

    /**
     * Back-compat read-only convenience: comma-joined values.
     * @returns {string}
     */
    get value() {
        return this.values.join(',');
    }

    /** @returns {HTMLOptionElement[]} */
    get selectedOptions() {
        return this.#options.filter((o) => this.#selected.has(o.value));
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
        // No-op: setFormValue is called from #applyValues.
    }

    formResetCallback() {
        this.#applyValues(this.#initialValues, { silent: true });
    }

    /**
     * @param {boolean} disabled
     */
    formDisabledCallback(disabled) {
        if (disabled) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }

    /**
     * @param {string | File | FormData | null} state
     */
    formStateRestoreCallback(state) {
        if (state instanceof FormData) {
            const name = this.name;
            const all = name ? state.getAll(name) : [];
            this.#applyValues(all.map((x) => String(x)), { silent: true });
        }
    }

    // ---- UI construction ------------------------------------------------

    #buildUi() {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = FIELD_CLASS;
        button.setAttribute('popovertarget', this.#popoverId);
        button.setAttribute('aria-haspopup', 'listbox');
        button.setAttribute('aria-controls', this.#listId);
        button.setAttribute('aria-expanded', 'false');

        const values = document.createElement('span');
        values.className = `tag-list ${VALUES_CLASS}`;

        const placeholder = document.createElement('span');
        placeholder.className = PLACEHOLDER_CLASS;
        placeholder.textContent = this.getAttribute('placeholder') ?? '';

        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = CLEAR_CLASS;
        clear.setAttribute('aria-label', 'Clear all selections');
        clear.style.display = 'none';
        clear.tabIndex = -1;
        clear.appendChild(makeXSvg());

        const chevron = makeChevronSvg();

        button.append(values, placeholder, clear, chevron);

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
        input.placeholder = 'Search…';
        search.appendChild(input);

        const list = document.createElement('div');
        list.id = this.#listId;
        list.className = LIST_CLASS;
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-multiselectable', 'true');

        const empty = document.createElement('div');
        empty.className = EMPTY_CLASS;
        empty.textContent = 'No results';
        empty.hidden = true;
        list.appendChild(empty);

        popover.append(search, list);

        this.#fieldButton = button;
        this.#valuesEl = values;
        this.#placeholderEl = placeholder;
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
            if (o.style.display !== 'none') o.style.display = 'none';
        }
        this.#options = opts;
    }

    /** @param {string} query */
    /** @param {string} query */
    #renderRows(query) {
        if (!this.#listEl || !this.#emptyEl) return;
        for (const row of this.#rows) row.remove();
        this.#rows = [];

        const q = query.trim().toLowerCase();
        let visible = 0;
        for (let i = 0; i < this.#options.length; i++) {
            const opt = this.#options[i];
            const label = opt.textContent ?? '';
            const matches = q === '' || label.toLowerCase().includes(q);
            if (!matches) continue;

            const row = document.createElement('label');
            row.className = OPTION_CLASS;
            row.id = `${this.#idPrefix}-opt-${i}`;
            row.setAttribute('role', 'option');
            row.dataset.value = opt.value;

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = CHECKBOX_CLASS;
            cb.tabIndex = -1;
            cb.checked = this.#selected.has(opt.value);
            if (opt.disabled) {
                cb.disabled = true;
                row.setAttribute('aria-disabled', 'true');
            }

            const labelEl = document.createElement('span');
            labelEl.className = OPTION_LABEL_CLASS;
            labelEl.textContent = label;

            row.append(cb, labelEl);
            row.setAttribute('aria-selected', cb.checked ? 'true' : 'false');

            this.#listEl.insertBefore(row, this.#emptyEl);
            this.#rows.push(row);
            visible++;
        }
        this.#emptyEl.hidden = visible !== 0;
        this.#setActive(null);
    }

    /** @returns {HTMLLabelElement[]} */
    #visibleRows() {
        return this.#rows.filter((r) => r.getAttribute('aria-disabled') !== 'true');
    }

    /**
     * @param {HTMLLabelElement | null} row
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

    #toggleActive() {
        if (!this.#activeId) return;
        const row = this.#rows.find((r) => r.id === this.#activeId);
        if (row) this.#toggleRow(row);
    }

    /**
     * @param {HTMLLabelElement} row
     */
    #toggleRow(row) {
        if (row.getAttribute('aria-disabled') === 'true') return;
        const v = row.dataset.value ?? '';
        if (!v) return;
        const next = new Set(this.#selected);
        if (next.has(v)) next.delete(v);
        else next.add(v);
        this.#applyValues(Array.from(next), { silent: false });
    }

    #close() {
        if (this.#popover?.matches(':popover-open')) {
            try {
                this.#popover.hidePopover();
            } catch (e) {
                if (DEV) {
                    // eslint-disable-next-line no-console
                    console.debug('<neon-multicombobox>: hidePopover failed', e);
                }
            }
        }
    }

    /**
     * Apply a new set of values. Unknown values are dropped silently
     * (with a DEV warning). When `silent` is false, dispatches a
     * single `change` event if the selection actually changed.
     *
     * @param {Iterable<string>} input
     * @param {{ silent: boolean }} opts
     */
    #applyValues(input, { silent }) {
        const known = new Set(this.#options.map((o) => o.value));
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

        const prev = this.#selected;
        const changed = !setsEqual(prev, next);
        this.#selected = next;

        this.#renderTags();
        this.#syncRowChecks();
        this.#syncClearVisibility();
        this.#updateFormValue();
        this.#updateValidity();

        if (!silent && changed) {
            this.dispatchEvent(
                new CustomEvent('change', {
                    bubbles: true,
                    detail: /** @type {ChangeDetail} */ ({
                        values: this.values,
                        options: this.selectedOptions,
                    }),
                }),
            );
        }
    }

    #renderTags() {
        if (!this.#valuesEl || !this.#placeholderEl) return;
        // Clear existing tags.
        while (this.#valuesEl.firstChild) this.#valuesEl.removeChild(this.#valuesEl.firstChild);

        const ordered = this.#options.filter((o) => this.#selected.has(o.value));
        for (const opt of ordered) {
            const tag = document.createElement('span');
            tag.className = TAG_CLASS;
            tag.dataset.value = opt.value;

            const labelText = document.createTextNode((opt.textContent ?? '') + ' ');
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = TAG_REMOVE_CLASS;
            remove.tabIndex = -1;
            remove.setAttribute('aria-label', `Remove ${opt.textContent ?? opt.value}`);
            remove.dataset.value = opt.value;
            remove.appendChild(makeXSvg());
            // The field is itself a <button popovertarget>; clicking the
            // remove control must NOT bubble up and toggle the popover.
            remove.addEventListener('click', this.#onTagRemoveClick);

            tag.append(labelText, remove);
            this.#valuesEl.appendChild(tag);
        }

        const empty = ordered.length === 0;
        this.#placeholderEl.hidden = !empty;
    }

    #syncRowChecks() {
        for (const row of this.#rows) {
            const v = row.dataset.value ?? '';
            const checked = this.#selected.has(v);
            const cb = /** @type {HTMLInputElement | null} */ (row.querySelector(`.${CHECKBOX_CLASS}`));
            if (cb && cb.checked !== checked) cb.checked = checked;
            row.setAttribute('aria-selected', checked ? 'true' : 'false');
        }
    }

    #updateFormValue() {
        const name = this.name;
        if (!name || this.#selected.size === 0) {
            this.#internals.setFormValue(null);
            return;
        }
        const fd = new FormData();
        for (const opt of this.#options) {
            if (this.#selected.has(opt.value)) fd.append(name, opt.value);
        }
        this.#internals.setFormValue(fd);
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
        const visible = this.hasAttribute('data-clearable') && this.#selected.size > 0;
        this.#clearEl.style.display = visible ? '' : 'none';
    }

    #updateValidity() {
        if (!this.#fieldButton) return;
        if (this.required && this.#selected.size === 0) {
            this.#internals.setValidity(
                { valueMissing: true },
                'Please select at least one option.',
                this.#fieldButton,
            );
        } else {
            this.#internals.setValidity({});
        }
    }

    /** @returns {string[]} */
    #resolveInitialValues() {
        const out = [];
        for (const opt of this.#options) {
            if (opt.hasAttribute('selected')) out.push(opt.value);
        }
        return out;
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
                        /** @type {any} */ (this.#popover)?.showPopover({ source: this.#fieldButton ?? undefined });
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

    #onClearClick = (/** @type {MouseEvent} */ e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.disabled) return;
        if (this.#selected.size === 0) return;
        this.#applyValues([], { silent: false });
    };

    #onTagRemoveClick = (/** @type {MouseEvent} */ e) => {
        // Stop the click from reaching the field button, which would
        // toggle the popover via its `popovertarget` association.
        e.preventDefault();
        e.stopPropagation();
        if (this.disabled) return;
        const target = /** @type {HTMLElement | null} */ (e.currentTarget);
        const v = target?.dataset.value ?? '';
        if (!v || !this.#selected.has(v)) return;
        const next = new Set(this.#selected);
        next.delete(v);
        this.#applyValues(Array.from(next), { silent: false });
    };

    #onSearchInput = (/** @type {Event} */ e) => {
        e.stopPropagation();
        const q = this.#searchInput?.value ?? '';
        this.#renderRows(q);
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
            case ' ': {
                // Don't intercept Space in a non-empty search input —
                // the user is typing.
                if (e.key === ' ' && (this.#searchInput?.value ?? '') !== '') return;
                e.preventDefault();
                this.#toggleActive();
                return;
            }
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
        // Let native <label>/<input> mechanics handle the checkbox toggle;
        // we only react to the resulting `change` event from the input.
        // This handler exists to keep the active-descendant in sync when
        // pointer hovers a row.
        const row = /** @type {HTMLLabelElement | null} */ (target.closest(`.${OPTION_CLASS}`));
        if (!row) return;
        // Move active highlight to the clicked row for keyboard parity.
        if (this.#rows.includes(row)) this.#setActive(row);
    };

    #onListChange = (/** @type {Event} */ e) => {
        const target = /** @type {HTMLInputElement | null} */ (e.target);
        if (!target || target.type !== 'checkbox') return;
        // Stop the inner checkbox's `change` from bubbling out of the
        // host — consumers should only see our own change event.
        e.stopPropagation();
        const row = /** @type {HTMLLabelElement | null} */ (target.closest(`.${OPTION_CLASS}`));
        if (!row) return;
        const v = row.dataset.value ?? '';
        if (!v) return;
        const next = new Set(this.#selected);
        if (target.checked) next.add(v);
        else next.delete(v);
        this.#applyValues(Array.from(next), { silent: false });
    };

    #onListMouseleave = (/** @type {MouseEvent} */ _e) => {
        this.#setActive(null);
    };

    #onPopoverToggle = (/** @type {ToggleEvent} */ e) => {
        const open = e.newState === 'open';
        this.#fieldButton?.setAttribute('aria-expanded', open ? 'true' : 'false');
        this.#searchInput?.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            if (this.#searchInput) this.#searchInput.value = '';
            this.#renderRows('');
            this.#setActive(this.#visibleRows()[0] ?? null);
            queueMicrotask(() => this.#searchInput?.focus());
        } else {
            this.#setActive(null);
        }
    };

    /**
     * @param {MutationRecord[]} records
     */
    #handleMutations(records) {
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

        const previous = new Set(this.#selected);
        this.#collectOptions();
        const known = new Set(this.#options.map((o) => o.value));
        const next = Array.from(previous).filter((v) => known.has(v));
        this.#applyValues(next, { silent: true });
        this.#renderRows(this.#searchInput?.value ?? '');
    }
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

/** @returns {SVGSVGElement} */
function makeXSvg() {
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

/** @returns {SVGSVGElement} */
function makeChevronSvg() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', CHEVRON_CLASS);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('d', 'm19.5 8.25-7.5 7.5-7.5-7.5');
    svg.appendChild(path);
    return svg;
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
 * Define `<neon-multicombobox>` if it has not been registered yet. Idempotent.
 *
 * @param {string} [tagName] Optional override tag name. Defaults to `neon-multicombobox`.
 */
export function registerMulticombobox(tagName = 'neon-multicombobox') {
    if (typeof globalThis.customElements === 'undefined') return;
    if (!globalThis.customElements.get(tagName)) {
        globalThis.customElements.define(tagName, NeonMulticomboboxElement);
    }
}

// Side-effect register on import.
registerMulticombobox();
