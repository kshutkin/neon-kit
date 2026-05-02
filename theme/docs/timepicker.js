/* Timepicker demo behavior — minimal implementation used only by the
   docs site. NOT a shipped library. Behaviors:

     - Renders a list of time points at a configured step (in minutes)
       from 00:00 to 23:HH.
     - Format is HH:MM by default; HH:MM:SS when `data-seconds` is set.
     - Clicking a row commits the value and closes.
     - Clear button blanks the value.
     - Optional timezone <select> updates the field's small zone hint
       and the wrapper's `data-tz` attribute.

   Combined `.datetime-picker` reuses the same boot path: it owns a
   single popover with a date panel (rendered inline by reusing the
   datepicker's grid markup) and a time panel.
*/

(() => {
    const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="combobox__option-check" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>`;
    const ICON_PREV = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5"/></svg>`;
    const ICON_NEXT = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"/></svg>`;

    const MONTH_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const WEEKDAY_SHORT = ['Mo','Tu','We','Th','Fr','Sa','Su'];

    const pad2 = (n) => String(n).padStart(2, '0');
    const escapeHtml = (s) =>
        String(s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);

    const fmtTime = ({ h, m, s }, withSeconds) =>
        withSeconds
            ? `${pad2(h)}:${pad2(m)}:${pad2(s ?? 0)}`
            : `${pad2(h)}:${pad2(m)}`;

    const parseTime = (raw) => {
        const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((raw || '').trim());
        if (!m) return null;
        const h = +m[1], min = +m[2], s = m[3] ? +m[3] : 0;
        if (h > 23 || min > 59 || s > 59) return null;
        return { h, m: min, s };
    };

    const fmtISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const parseISODate = (s) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || '').trim());
        if (!m) return null;
        const d = new Date(+m[1], +m[2] - 1, +m[3]);
        return Number.isNaN(d.getTime()) ? null : d;
    };

    const buildList = (step, withSeconds) => {
        const out = [];
        const totalMinutes = 24 * 60;
        for (let mins = 0; mins < totalMinutes; mins += step) {
            out.push({ h: Math.floor(mins / 60), m: mins % 60, s: 0 });
        }
        return out;
    };

    /* --------------------------- standalone time --------------------------- */

    const initTimepicker = (root) => {
        if (root.dataset.tpInit) return;
        root.dataset.tpInit = '1';

        const input = root.querySelector('[data-tp-input]');
        const clearBtn = root.querySelector('[data-tp-clear]');
        const popover = root.querySelector('[data-tp-popover]');
        const list = root.querySelector('[data-tp-list]');
        const fieldTz = root.querySelector('[data-tp-field-tz]');
        const tzPopover = root.querySelector('[data-tp-tz-popover]');
        const tzList = root.querySelector('[data-tp-tz-list]');
        const tzSearch = root.querySelector('[data-tp-tz-search]');

        // Anchor the popover to the visible `.timepicker__field` rather
        // than to the small clock-icon trigger — see datepicker.js for
        // the same workaround.
        const field = root.querySelector('.timepicker__field');
        if (popover && popover.id && field) {
            const name = `--tp-anchor-${popover.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            field.style.anchorName = name;
            popover.style.positionAnchor = name;
        }
        if (tzPopover && tzPopover.id && fieldTz) {
            const tzName = `--tp-tz-anchor-${tzPopover.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            fieldTz.style.anchorName = tzName;
            tzPopover.style.positionAnchor = tzName;
        }

        const step = +(root.dataset.step || 30);
        const withSeconds = root.hasAttribute('data-seconds');
        const clearable = root.hasAttribute('data-clearable');

        const tzOptions = (() => {
            try { return JSON.parse(root.dataset.tzOptions || '[]'); }
            catch { return []; }
        })();

        const state = {
            value: parseTime(root.dataset.value || input?.value || ''),
            tz: root.dataset.tz || null,
            tzQuery: '',
        };
        if (state.value && input) input.value = fmtTime(state.value, withSeconds);

        const updateClear = () => {
            if (!clearBtn) return;
            clearBtn.hidden = !(clearable && input && input.value.trim());
        };
        updateClear();

        const renderList = () => {
            if (!list) return;
            const opts = buildList(step, withSeconds);
            list.innerHTML = opts.map((t) => {
                const label = fmtTime(t, withSeconds);
                const selected = state.value &&
                    state.value.h === t.h &&
                    state.value.m === t.m &&
                    (!withSeconds || state.value.s === (t.s || 0));
                return `<button class="combobox__option" type="button" role="option"
                    data-tp-pick="${label}"
                    aria-selected="${selected ? 'true' : 'false'}">
                    <span class="combobox__option-label">${label}</span>
                    ${CHECK_SVG}
                </button>`;
            }).join('');
        };

        const renderTzList = () => {
            if (!tzList) return;
            const q = state.tzQuery.trim().toLowerCase();
            const matches = tzOptions.filter((tz) =>
                !q || tz.toLowerCase().includes(q),
            );
            if (matches.length === 0) {
                tzList.innerHTML = `<div class="combobox__empty">No results</div>`;
                return;
            }
            tzList.innerHTML = matches.map((tz) => `
                <button class="combobox__option" type="button" role="option"
                        data-tp-tz-pick="${escapeHtml(tz)}"
                        aria-selected="${tz === state.tz ? 'true' : 'false'}">
                    <span></span>
                    <span class="combobox__option-label">${escapeHtml(tz)}</span>
                    ${CHECK_SVG}
                </button>
            `).join('');
        };

        const setValue = (raw) => {
            const t = raw == null ? null : parseTime(raw);
            state.value = t;
            if (input) input.value = t ? fmtTime(t, withSeconds) : '';
            updateClear();
            renderList();
        };

        if (popover) {
            popover.addEventListener('toggle', (e) => {
                if (e.newState !== 'open') return;
                renderList();
                // Scroll the selected option into view.
                const selected = list?.querySelector('[aria-selected="true"]');
                if (selected) selected.scrollIntoView({ block: 'center' });
            });

            popover.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-tp-pick]');
                if (!btn) return;
                setValue(btn.dataset.tpPick);
                popover.hidePopover();
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                setValue(null);
            });
        }

        if (input) {
            input.addEventListener('input', () => {
                updateClear();
                const t = parseTime(input.value);
                if (t) state.value = t;
            });
        }

        if (tzPopover) {
            tzPopover.addEventListener('toggle', (e) => {
                if (e.newState !== 'open') return;
                state.tzQuery = '';
                if (tzSearch) tzSearch.value = '';
                renderTzList();
                // Focus the search input for keyboard-first use.
                requestAnimationFrame(() => tzSearch?.focus());
            });

            tzPopover.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-tp-tz-pick]');
                if (!btn) return;
                state.tz = btn.dataset.tpTzPick;
                root.dataset.tz = state.tz;
                if (fieldTz) fieldTz.textContent = state.tz;
                tzPopover.hidePopover();
            });
        }

        if (tzSearch) {
            tzSearch.addEventListener('input', () => {
                state.tzQuery = tzSearch.value;
                renderTzList();
            });
        }

        renderList();
    };

    /* --------------------------- combined dt picker ------------------------ */

    const initDateTimePicker = (root) => {
        if (root.dataset.dtInit) return;
        root.dataset.dtInit = '1';

        const dateInput = root.querySelector('[data-dt-date-input]');
        const timeInput = root.querySelector('[data-dt-time-input]');
        const clearBtn  = root.querySelector('[data-dt-clear]');
        const popover   = root.querySelector('[data-dt-popover]');
        const datePanel = root.querySelector('[data-dt-date-panel]');
        const timeList  = root.querySelector('[data-dt-time-list]');

        // Anchor the combined popover to the `.datetime-picker` wrapper
        // so it aligns with the full date+time row (rather than just one
        // of the two inner fields).
        const field = root;
        if (popover && popover.id && field) {
            const name = `--dt-anchor-${popover.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            field.style.anchorName = name;
            popover.style.positionAnchor = name;
        }

        const step = +(root.dataset.step || 30);
        const withSeconds = root.hasAttribute('data-seconds');
        const clearable = root.hasAttribute('data-clearable');

        const today = new Date();

        // Parse `YYYY-MM-DDTHH:MM[:SS]` from data-value if provided.
        const initialRaw = root.dataset.value || '';
        const isoMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)/.exec(initialRaw);

        const state = {
            date: isoMatch ? parseISODate(isoMatch[1]) : null,
            time: isoMatch ? parseTime(isoMatch[2]) : null,
            view: 'days',
            cursor: null,
        };
        state.cursor = state.date
            ? new Date(state.date.getFullYear(), state.date.getMonth(), 1)
            : new Date(today.getFullYear(), today.getMonth(), 1);

        if (state.date && dateInput) dateInput.value = fmtISODate(state.date);
        if (state.time && timeInput) timeInput.value = fmtTime(state.time, withSeconds);

        const updateClear = () => {
            if (!clearBtn) return;
            const hasValue = (dateInput && dateInput.value.trim()) || (timeInput && timeInput.value.trim());
            clearBtn.hidden = !(clearable && hasValue);
        };
        updateClear();

        const renderDatePanel = () => {
            if (!datePanel) return;
            const year = state.cursor.getFullYear();
            const month = state.cursor.getMonth();
            const navHeader = `
                <header class="datepicker__nav">
                    <button class="datepicker__nav-btn" type="button" data-dir="prev" data-dt-prev aria-label="Previous">${ICON_PREV}</button>
                    <button class="datepicker__view-switch" type="button" data-dt-switch>${MONTH_LONG[month]} ${year}</button>
                    <button class="datepicker__nav-btn" type="button" data-dir="next" data-dt-next aria-label="Next">${ICON_NEXT}</button>
                </header>
            `;
            const first = new Date(year, month, 1);
            const startWeekday = (first.getDay() + 6) % 7;
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const cells = [];
            for (const w of WEEKDAY_SHORT) cells.push(`<div class="datepicker__weekday">${w}</div>`);
            for (let i = startWeekday; i > 0; i--) cells.push(dayCell(new Date(year, month, 1 - i), true));
            for (let day = 1; day <= daysInMonth; day++) cells.push(dayCell(new Date(year, month, day), false));
            const total = startWeekday + daysInMonth;
            const trail = (7 - (total % 7)) % 7;
            for (let i = 1; i <= trail; i++) cells.push(dayCell(new Date(year, month + 1, i), true));
            datePanel.innerHTML = navHeader +
                `<div class="datepicker__grid -days">${cells.join('')}</div>`;
        };

        const dayCell = (date, muted) => {
            const isToday = date.getFullYear() === today.getFullYear() &&
                date.getMonth() === today.getMonth() &&
                date.getDate() === today.getDate();
            const isSelected = state.date &&
                date.getFullYear() === state.date.getFullYear() &&
                date.getMonth() === state.date.getMonth() &&
                date.getDate() === state.date.getDate();
            const cls = ['datepicker__cell',
                muted && '-muted', isToday && '-today', isSelected && '-selected']
                .filter(Boolean).join(' ');
            return `<button class="${cls}" type="button" data-dt-pick-day="${fmtISODate(date)}"${isSelected ? ' aria-pressed="true"' : ''}>${date.getDate()}</button>`;
        };

        const renderTimeList = () => {
            if (!timeList) return;
            const opts = buildList(step, withSeconds);
            timeList.innerHTML = opts.map((t) => {
                const label = fmtTime(t, withSeconds);
                const selected = state.time &&
                    state.time.h === t.h && state.time.m === t.m &&
                    (!withSeconds || state.time.s === (t.s || 0));
                return `<button class="combobox__option" type="button" role="option"
                    data-dt-pick-time="${label}"
                    aria-selected="${selected ? 'true' : 'false'}">
                    <span class="combobox__option-label">${label}</span>
                    ${CHECK_SVG}
                </button>`;
            }).join('');
        };

        if (popover) {
            popover.addEventListener('toggle', (e) => {
                if (e.newState !== 'open') return;
                renderDatePanel();
                renderTimeList();
                const sel = timeList?.querySelector('[aria-selected="true"]');
                if (sel) sel.scrollIntoView({ block: 'center' });
            });

            popover.addEventListener('click', (e) => {
                const t = e.target;
                if (t.closest('[data-dt-prev]')) {
                    state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() - 1, 1);
                    renderDatePanel();
                    return;
                }
                if (t.closest('[data-dt-next]')) {
                    state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + 1, 1);
                    renderDatePanel();
                    return;
                }
                const dayBtn = t.closest('[data-dt-pick-day]');
                if (dayBtn) {
                    const d = parseISODate(dayBtn.dataset.dtPickDay);
                    if (d) {
                        state.date = d;
                        if (dateInput) dateInput.value = fmtISODate(d);
                        updateClear();
                        renderDatePanel();
                    }
                    return;
                }
                const timeBtn = t.closest('[data-dt-pick-time]');
                if (timeBtn) {
                    const tt = parseTime(timeBtn.dataset.dtPickTime);
                    if (tt) {
                        state.time = tt;
                        if (timeInput) timeInput.value = fmtTime(tt, withSeconds);
                        updateClear();
                        renderTimeList();
                        // Close once both are picked.
                        if (state.date) popover.hidePopover();
                    }
                    return;
                }
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                state.date = null;
                state.time = null;
                if (dateInput) dateInput.value = '';
                if (timeInput) timeInput.value = '';
                updateClear();
            });
        }

        if (dateInput) dateInput.addEventListener('input', () => {
            updateClear();
            const d = parseISODate(dateInput.value);
            if (d) {
                state.date = d;
                state.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
            }
        });

        if (timeInput) timeInput.addEventListener('input', () => {
            updateClear();
            const t = parseTime(timeInput.value);
            if (t) state.time = t;
        });
    };

    const boot = (root = document) => {
        for (const el of root.querySelectorAll('[data-timepicker]')) initTimepicker(el);
        for (const el of root.querySelectorAll('[data-datetime-picker]')) initDateTimePicker(el);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => boot(), { once: true });
    } else {
        boot();
    }

    const inner = document.getElementById('content-inner');
    if (inner) {
        const observer = new MutationObserver(() => boot(inner));
        observer.observe(inner, { childList: true, subtree: true });
    }
})();
