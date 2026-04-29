/* Combobox demo behavior — used only by the docs site to make the
   single- and multi-select layouts interactive. This is NOT a shipped
   library; it lives in the docs because the section fragments are
   injected via innerHTML and per-fragment <script> tags don't run.

   Behaviors (single):
     - Click field (or Space/Enter while focused) toggles popover.
     - Clicking an option sets the value and closes.
     - Optional clear button removes the value (also clicks-through to
       avoid opening the popover).
     - Optional search filter narrows visible options live.
     - Optional create button appends a new option from the typed query.

   Behaviors (multi):
     - Field acts as a focus container for the inline input.
     - Options rendered with .checkbox; clicking toggles a tag in the
       field. Tag's × removes the corresponding tag.
     - Optional search filter narrows visible options.
     - Optional select-all toggles every visible option (indeterminate
       when partially selected).
     - Optional create-new appends a tag from the typed query.
     - Pressing Enter in the inline input creates (when creatable) or
       selects the first match.
     - Pressing Backspace in an empty input removes the last tag.

   Boots once on DOMContentLoaded and re-boots whenever the docs router
   swaps the inner fragment (observes #content-inner mutations).
*/

(() => {
    const REMOVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18"/></svg>`;
    const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="combobox__option-check" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>`;

    const parseList = (raw, fallback = []) => {
        if (!raw) return fallback;
        try { return JSON.parse(raw); } catch { return fallback; }
    };

    const escapeHtml = (s) =>
        String(s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);

    /* --------------------------- single-select --------------------------- */

    const initSingle = (root) => {
        if (root.dataset.cbInit) return;
        root.dataset.cbInit = '1';

        const field = root.querySelector('.combobox__field');
        const valueEl = root.querySelector('[data-cb-value]');
        const placeholderEl = root.querySelector('[data-cb-placeholder]');
        const clearEl = root.querySelector('[data-cb-clear]');
        const popover = root.querySelector('[data-cb-popover]');
        const list = root.querySelector('[data-cb-list]');
        const searchEl = root.querySelector('[data-cb-search]');
        const footer = root.querySelector('[data-cb-footer]');
        const createBtn = root.querySelector('[data-cb-create]');
        const createLabel = root.querySelector('[data-cb-create-label]');

        const state = {
            options: parseList(root.dataset.options, []),
            value: root.dataset.value || null,
            query: '',
        };

        const setValue = (v) => {
            state.value = v;
            if (v == null) {
                if (valueEl) { valueEl.textContent = ''; valueEl.hidden = true; }
                if (placeholderEl) placeholderEl.hidden = false;
                if (clearEl) clearEl.hidden = true;
            } else {
                if (valueEl) { valueEl.textContent = v; valueEl.hidden = false; }
                if (placeholderEl) placeholderEl.hidden = true;
                if (clearEl) clearEl.hidden = false;
            }
            renderList();
        };

        const renderList = () => {
            const q = state.query.trim().toLowerCase();
            const matches = state.options.filter((o) =>
                !q || o.toLowerCase().includes(q),
            );
            if (matches.length === 0) {
                list.innerHTML = `<div class="combobox__empty">No results</div>`;
            } else {
                list.innerHTML = matches.map((o) => `
                    <button class="combobox__option" type="button" role="option"
                            data-cb-pick="${escapeHtml(o)}"
                            aria-selected="${o === state.value ? 'true' : 'false'}">
                        <span></span>
                        <span class="combobox__option-label">${escapeHtml(o)}</span>
                        ${CHECK_SVG}
                    </button>
                `).join('');
            }

            if (footer && createBtn) {
                const trimmed = state.query.trim();
                const exists = state.options.some(
                    (o) => o.toLowerCase() === trimmed.toLowerCase(),
                );
                const show = trimmed.length > 0 && !exists;
                footer.hidden = !show;
                if (show && createLabel) {
                    createLabel.textContent = `Create "${trimmed}"`;
                }
            }
        };

        // Open / close — sync aria-expanded with popover toggle events.
        if (popover && field) {
            popover.addEventListener('toggle', (e) => {
                field.setAttribute('aria-expanded', e.newState === 'open' ? 'true' : 'false');
                if (e.newState === 'open') {
                    state.query = '';
                    if (searchEl) { searchEl.value = ''; searchEl.focus(); }
                    renderList();
                }
            });
        }

        // Clear button — stop click from re-opening / submitting field.
        if (clearEl) {
            const clear = (e) => {
                e.preventDefault();
                e.stopPropagation();
                setValue(null);
            };
            clearEl.addEventListener('click', clear);
            clearEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') clear(e);
            });
        }

        // Pick option.
        list.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-cb-pick]');
            if (!btn) return;
            setValue(btn.dataset.cbPick);
            if (popover && popover.matches(':popover-open')) popover.hidePopover();
        });

        // Search filter.
        if (searchEl) {
            searchEl.addEventListener('input', () => {
                state.query = searchEl.value;
                renderList();
            });
        }

        // Create new.
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                const v = state.query.trim();
                if (!v) return;
                if (!state.options.includes(v)) state.options.push(v);
                setValue(v);
                if (popover && popover.matches(':popover-open')) popover.hidePopover();
            });
        }

        setValue(state.value);
    };

    /* ---------------------------- multi-select --------------------------- */

    const initMulti = (root) => {
        if (root.dataset.cbInit) return;
        root.dataset.cbInit = '1';

        const field = root.querySelector('[data-cb-field]');
        const valuesEl = root.querySelector('[data-cb-values]');
        const inputEl = root.querySelector('[data-cb-input]');
        const popover = root.querySelector('[data-cb-popover]');
        const list = root.querySelector('[data-cb-list]');
        const searchEl = root.querySelector('[data-cb-search]');
        const footer = root.querySelector('[data-cb-footer]');
        const createBtn = root.querySelector('[data-cb-create]');
        const createLabel = root.querySelector('[data-cb-create-label]');
        const selectAllRow = root.querySelector('[data-cb-select-all]');
        const selectAllInput = root.querySelector('[data-cb-select-all-input]');
        const creatable = root.hasAttribute('data-creatable');

        const state = {
            options: parseList(root.dataset.options, []),
            value: parseList(root.dataset.value, []),
            query: '',
        };

        const renderTags = () => {
            valuesEl.innerHTML = state.value.map((v) => `
                <span class="tag">
                    ${escapeHtml(v)}
                    <button type="button" class="tag__remove" data-cb-remove="${escapeHtml(v)}" aria-label="Remove ${escapeHtml(v)}">
                        ${REMOVE_SVG}
                    </button>
                </span>
            `).join('');
        };

        const renderList = () => {
            const q = state.query.trim().toLowerCase();
            const matches = state.options.filter((o) =>
                !q || o.toLowerCase().includes(q),
            );
            if (matches.length === 0) {
                list.innerHTML = `<div class="combobox__empty">No results</div>`;
            } else {
                list.innerHTML = matches.map((o) => `
                    <label class="combobox__option" data-cb-toggle="${escapeHtml(o)}">
                        <input type="checkbox" class="checkbox" ${state.value.includes(o) ? 'checked' : ''} tabindex="-1">
                        <span class="combobox__option-label">${escapeHtml(o)}</span>
                    </label>
                `).join('');
            }

            // Select-all indeterminate / checked sync.
            if (selectAllInput) {
                const visibleSelected = matches.filter((m) => state.value.includes(m)).length;
                selectAllInput.checked = matches.length > 0 && visibleSelected === matches.length;
                selectAllInput.indeterminate =
                    visibleSelected > 0 && visibleSelected < matches.length;
            }

            if (footer && createBtn && creatable) {
                const trimmed = state.query.trim();
                const exists = state.options.some(
                    (o) => o.toLowerCase() === trimmed.toLowerCase(),
                );
                const show = trimmed.length > 0 && !exists;
                footer.hidden = !show;
                if (show && createLabel) {
                    createLabel.textContent = `Create "${trimmed}"`;
                }
            }
        };

        const toggle = (v) => {
            const idx = state.value.indexOf(v);
            if (idx === -1) state.value.push(v);
            else state.value.splice(idx, 1);
            renderTags();
            renderList();
        };

        const remove = (v) => {
            state.value = state.value.filter((x) => x !== v);
            renderTags();
            renderList();
        };

        const create = (raw) => {
            const v = raw.trim();
            if (!v) return;
            if (!state.options.includes(v)) state.options.push(v);
            if (!state.value.includes(v)) state.value.push(v);
            renderTags();
            renderList();
        };

        // Field click focuses inline input — feels like a textarea.
        field.addEventListener('mousedown', (e) => {
            if (e.target.closest('.tag__remove, .combobox__chevron-btn, .tag')) return;
            // Defer so the click doesn't steal focus from popover triggers.
            queueMicrotask(() => inputEl.focus());
        });

        // Open / close.
        if (popover) {
            popover.addEventListener('toggle', (e) => {
                if (e.newState === 'open') {
                    root.setAttribute('data-open', '');
                    state.query = inputEl.value || '';
                    if (searchEl) { searchEl.value = state.query; }
                    renderList();
                    (searchEl || inputEl).focus();
                } else {
                    root.removeAttribute('data-open');
                }
            });
        }

        // Tag remove.
        valuesEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-cb-remove]');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            remove(btn.dataset.cbRemove);
        });

        // Option toggle. Uses click on the label; suppress the implicit
        // checkbox click so we control the checked state.
        list.addEventListener('click', (e) => {
            const row = e.target.closest('[data-cb-toggle]');
            if (!row) return;
            e.preventDefault();
            toggle(row.dataset.cbToggle);
        });

        // Search filter (popover-side).
        if (searchEl) {
            searchEl.addEventListener('input', () => {
                state.query = searchEl.value;
                if (inputEl) inputEl.value = state.query;
                renderList();
            });
        }

        // Inline input — type-to-filter; Enter creates or picks first
        // match; Backspace on empty removes last tag.
        inputEl.addEventListener('input', () => {
            state.query = inputEl.value;
            if (searchEl) searchEl.value = state.query;
            renderList();
            if (popover && !popover.matches(':popover-open')) {
                try { popover.showPopover(); } catch { /* unsupported */ }
            }
        });

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && inputEl.value === '' && state.value.length) {
                e.preventDefault();
                remove(state.value[state.value.length - 1]);
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                const q = inputEl.value.trim();
                if (!q) return;
                const match = state.options.find((o) => o.toLowerCase() === q.toLowerCase());
                if (match) {
                    if (!state.value.includes(match)) toggle(match);
                } else if (creatable) {
                    create(q);
                }
                inputEl.value = '';
                state.query = '';
                if (searchEl) searchEl.value = '';
                renderList();
            }
            if (e.key === 'Escape' && popover && popover.matches(':popover-open')) {
                popover.hidePopover();
            }
        });

        // Create new (footer button).
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                create(state.query);
                inputEl.value = '';
                state.query = '';
                if (searchEl) searchEl.value = '';
                renderList();
            });
        }

        // Select all toggle — operates on currently visible (filtered) options.
        if (selectAllRow) {
            selectAllRow.addEventListener('click', (e) => {
                e.preventDefault();
                const q = state.query.trim().toLowerCase();
                const visible = state.options.filter((o) =>
                    !q || o.toLowerCase().includes(q),
                );
                const allSelected = visible.length > 0 && visible.every((v) => state.value.includes(v));
                if (allSelected) {
                    state.value = state.value.filter((v) => !visible.includes(v));
                } else {
                    for (const v of visible) {
                        if (!state.value.includes(v)) state.value.push(v);
                    }
                }
                renderTags();
                renderList();
            });
        }

        renderTags();
        renderList();
    };

    const boot = (root = document) => {
        for (const el of root.querySelectorAll('[data-combobox="single"]')) initSingle(el);
        for (const el of root.querySelectorAll('[data-combobox="multi"]')) initMulti(el);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => boot(), { once: true });
    } else {
        boot();
    }

    // Re-boot on docs-router fragment swap.
    const inner = document.getElementById('content-inner');
    if (inner) {
        const observer = new MutationObserver(() => boot(inner));
        observer.observe(inner, { childList: true, subtree: true });
    }
})();
