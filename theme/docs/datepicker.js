/* Datepicker demo behavior — minimal implementation used only by the
   docs site to make the field/popover layouts interactive. NOT a
   shipped library. Behavior:
     - Typed input parses YYYY-MM-DD; invalid input is left as-is.
     - Calendar trigger opens the popover, which renders one of three
       views: days (in a month), months (in a year), years (in a 12-year
       window with a leading and trailing pad).
     - Clicking the view-switch label cycles days → months → years.
     - Clicking the prev/next chevrons walks one unit (month / year /
       decade) at a time.
     - Clicking a cell in the days view commits the date and closes the
       popover; in months/years it drills back down toward days.
     - Optional clear button blanks the value.
     - Cells render with arrow-key roving-tabindex for keyboard nav.
*/

(() => {
    const ICON_PREV = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5"/></svg>`;
    const ICON_NEXT = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"/></svg>`;

    const MONTH_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const WEEKDAY_SHORT = ['Mo','Tu','We','Th','Fr','Sa','Su'];

    const pad2 = (n) => String(n).padStart(2, '0');
    const fmtISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const parseISO = (s) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || '').trim());
        if (!m) return null;
        const d = new Date(+m[1], +m[2] - 1, +m[3]);
        return Number.isNaN(d.getTime()) ? null : d;
    };
    const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const dayTime = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const cmpDay = (a, b) => dayTime(a) - dayTime(b);

    const init = (root) => {
        if (root.dataset.dpInit) return;
        root.dataset.dpInit = '1';

        const input = root.querySelector('[data-dp-input]');
        const clearBtn = root.querySelector('[data-dp-clear]');
        const popover = root.querySelector('[data-dp-popover]');
        const clearable = root.hasAttribute('data-clearable');
        const range = root.hasAttribute('data-range');

        // Anchor the popover to the visible field rather than to the
        // calendar-icon trigger button. Without this, `popovertarget`'s
        // implicit anchor is the tiny icon button, so the popover lands
        // hugging the right edge of the field instead of below it.
        const field = root.querySelector('.datepicker__field');
        if (popover && popover.id && field) {
            const name = `--dp-anchor-${popover.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            field.style.anchorName = name;
            popover.style.positionAnchor = name;
        }

        // Parse initial value. Range mode accepts "YYYY-MM-DD/YYYY-MM-DD".
        const rawInitial = (root.dataset.value || input?.value || '').trim();
        let initialStart = null, initialEnd = null;
        if (range) {
            const parts = rawInitial.split(/\s*\/\s*/);
            initialStart = parseISO(parts[0]);
            initialEnd = parseISO(parts[1]);
            if (initialStart && initialEnd && cmpDay(initialStart, initialEnd) > 0) {
                [initialStart, initialEnd] = [initialEnd, initialStart];
            }
        } else {
            initialStart = parseISO(rawInitial);
        }

        const today = new Date();
        const state = {
            view: 'days',          // days | months | years
            cursor: initialStart
                ? new Date(initialStart.getFullYear(), initialStart.getMonth(), 1)
                : new Date(today.getFullYear(), today.getMonth(), 1),
            selected: range ? null : initialStart,
            // Range state — start/end are the committed endpoints; hovered
            // tracks the cursor while the user is picking the second one.
            start: range ? initialStart : null,
            end: range ? initialEnd : null,
            hovered: null,
        };

        const formatRange = () => {
            if (state.start && state.end) return `${fmtISO(state.start)} / ${fmtISO(state.end)}`;
            if (state.start) return `${fmtISO(state.start)} / `;
            return '';
        };

        if (input) {
            if (range) input.value = formatRange();
            else if (initialStart) input.value = fmtISO(initialStart);
        }
        if (range && state.start && !state.end) root.classList.add('-range-pending');

        const updateClear = () => {
            if (!clearBtn) return;
            clearBtn.hidden = !(clearable && input && input.value.trim());
        };
        updateClear();

        const setSelected = (d) => {
            state.selected = d ? new Date(d) : null;
            if (input) input.value = d ? fmtISO(d) : '';
            updateClear();
        };

        const setRange = (s, e) => {
            state.start = s ? new Date(s) : null;
            state.end = e ? new Date(e) : null;
            state.hovered = null;
            if (input) input.value = formatRange();
            updateClear();
            // Wrapper flag drives the "pending" CSS — softer in-range band
            // and a dashed-outline trailing endpoint while we wait for the
            // user to commit the second click.
            root.classList.toggle('-range-pending', !!(state.start && !state.end));
        };

        // ----------------------------------------------------------------
        // Render
        // ----------------------------------------------------------------

        const navHeader = (label) => `
            <header class="datepicker__nav">
                <button class="datepicker__nav-btn" type="button" data-dir="prev" data-dp-prev aria-label="Previous">${ICON_PREV}</button>
                <button class="datepicker__view-switch" type="button" data-dp-switch>${label}</button>
                <button class="datepicker__nav-btn" type="button" data-dir="next" data-dp-next aria-label="Next">${ICON_NEXT}</button>
            </header>
        `;

        const renderDays = () => {
            const year = state.cursor.getFullYear();
            const month = state.cursor.getMonth();
            const first = new Date(year, month, 1);
            const startWeekday = (first.getDay() + 6) % 7; // Mon-first
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const cells = [];
            // Weekday header
            for (const w of WEEKDAY_SHORT) cells.push(`<div class="datepicker__weekday">${w}</div>`);
            // Leading pad
            for (let i = startWeekday; i > 0; i--) {
                const d = new Date(year, month, 1 - i);
                cells.push(cellHtml(d, true));
            }
            for (let day = 1; day <= daysInMonth; day++) {
                cells.push(cellHtml(new Date(year, month, day), false));
            }
            // Trailing pad — fill grid to multiple of 7
            const total = startWeekday + daysInMonth;
            const trail = (7 - (total % 7)) % 7;
            for (let i = 1; i <= trail; i++) {
                cells.push(cellHtml(new Date(year, month + 1, i), true));
            }
            return navHeader(`${MONTH_LONG[month]} ${year}`) +
                `<div class="datepicker__grid -days">${cells.join('')}</div>`;
        };

        const cellHtml = (date, muted) => {
            const isToday = sameDay(date, today);
            const cls = ['datepicker__cell'];
            if (muted) cls.push('-muted');
            if (isToday) cls.push('-today');

            let pressed = false;
            if (range) {
                // Use the hovered date as a tentative end while picking.
                const tentativeEnd = state.end || (state.start && state.hovered) || null;
                const lo = state.start && tentativeEnd && cmpDay(state.start, tentativeEnd) <= 0 ? state.start : tentativeEnd;
                const hi = state.start && tentativeEnd && cmpDay(state.start, tentativeEnd) <= 0 ? tentativeEnd : state.start;
                const isStart = sameDay(date, state.start);
                const isEnd = !!tentativeEnd && sameDay(date, tentativeEnd);
                if (isStart) cls.push('-range-start');
                if (isEnd) cls.push('-range-end');
                if (lo && hi && cmpDay(date, lo) > 0 && cmpDay(date, hi) < 0) cls.push('-in-range');
                pressed = isStart || isEnd;
            } else {
                const isSelected = sameDay(date, state.selected);
                if (isSelected) cls.push('-selected');
                pressed = isSelected;
            }
            return `<button class="${cls.join(' ')}" type="button" data-dp-pick-day="${fmtISO(date)}"${pressed ? ' aria-pressed="true"' : ''}>${date.getDate()}</button>`;
        };

        const renderMonths = () => {
            const year = state.cursor.getFullYear();
            // In range mode highlight the months containing either endpoint;
            // in single mode keep the existing selected-month indicator.
            const monthHasMark = (i) => {
                if (range) {
                    const hits = [state.start, state.end].filter(Boolean);
                    return hits.some((d) => d.getFullYear() === year && d.getMonth() === i);
                }
                return state.selected
                    && state.selected.getFullYear() === year
                    && state.selected.getMonth() === i;
            };
            const cells = MONTH_SHORT.map((label, i) => {
                const isCurrent = today.getFullYear() === year && today.getMonth() === i;
                const isSelected = monthHasMark(i);
                const cls = [
                    'datepicker__cell',
                    isCurrent && '-today',
                    isSelected && '-selected',
                ].filter(Boolean).join(' ');
                return `<button class="${cls}" type="button" data-dp-pick-month="${i}"${isSelected ? ' aria-pressed="true"' : ''}>${label}</button>`;
            }).join('');
            return navHeader(String(year)) +
                `<div class="datepicker__grid -months">${cells}</div>`;
        };

        const renderYears = () => {
            const year = state.cursor.getFullYear();
            const start = year - (year % 12) - 1; // pad with one leading + two trailing
            const yearHasMark = (y) => {
                if (range) {
                    const hits = [state.start, state.end].filter(Boolean);
                    return hits.some((d) => d.getFullYear() === y);
                }
                return state.selected && state.selected.getFullYear() === y;
            };
            const cells = [];
            for (let i = 0; i < 16; i++) {
                const y = start + i;
                const muted = i === 0 || i > 12;
                const isCurrent = today.getFullYear() === y;
                const isSelected = yearHasMark(y);
                const cls = [
                    'datepicker__cell',
                    muted && '-muted',
                    isCurrent && '-today',
                    isSelected && '-selected',
                ].filter(Boolean).join(' ');
                cells.push(`<button class="${cls}" type="button" data-dp-pick-year="${y}"${isSelected ? ' aria-pressed="true"' : ''}>${y}</button>`);
            }
            const decadeLabel = `${start + 1} – ${start + 12}`;
            return navHeader(decadeLabel) +
                `<div class="datepicker__grid -years">${cells.join('')}</div>`;
        };

        const render = () => {
            popover.innerHTML =
                state.view === 'days' ? renderDays() :
                state.view === 'months' ? renderMonths() :
                renderYears();
        };

        // ----------------------------------------------------------------
        // Behavior
        // ----------------------------------------------------------------

        if (popover) {
            popover.addEventListener('toggle', (e) => {
                if (e.newState !== 'open') return;
                // Reset to days view + cursor on the selected (or current) month.
                state.view = 'days';
                const anchor = range
                    ? (state.start || state.end)
                    : state.selected;
                state.cursor = anchor
                    ? new Date(anchor.getFullYear(), anchor.getMonth(), 1)
                    : new Date(today.getFullYear(), today.getMonth(), 1);
                state.hovered = null;
                render();
            });

            popover.addEventListener('click', (e) => {
                const t = e.target;
                if (t.closest('[data-dp-prev]')) {
                    if (state.view === 'days') state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() - 1, 1);
                    else if (state.view === 'months') state.cursor = new Date(state.cursor.getFullYear() - 1, state.cursor.getMonth(), 1);
                    else state.cursor = new Date(state.cursor.getFullYear() - 12, state.cursor.getMonth(), 1);
                    render();
                    return;
                }
                if (t.closest('[data-dp-next]')) {
                    if (state.view === 'days') state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + 1, 1);
                    else if (state.view === 'months') state.cursor = new Date(state.cursor.getFullYear() + 1, state.cursor.getMonth(), 1);
                    else state.cursor = new Date(state.cursor.getFullYear() + 12, state.cursor.getMonth(), 1);
                    render();
                    return;
                }
                if (t.closest('[data-dp-switch]')) {
                    state.view = state.view === 'days' ? 'months' : state.view === 'months' ? 'years' : 'days';
                    render();
                    return;
                }
                const dayBtn = t.closest('[data-dp-pick-day]');
                if (dayBtn) {
                    const d = parseISO(dayBtn.dataset.dpPickDay);
                    if (!d) return;
                    if (range) {
                        // First click (or restart after a complete range):
                        // arm the start endpoint and wait for a second click.
                        if (!state.start || (state.start && state.end)) {
                            setRange(d, null);
                            render();
                            return;
                        }
                        // Second click commits the range. Normalize order so
                        // start <= end regardless of which side was picked.
                        let s = state.start, e = d;
                        if (cmpDay(s, e) > 0) [s, e] = [e, s];
                        setRange(s, e);
                        popover.hidePopover();
                        return;
                    }
                    setSelected(d);
                    popover.hidePopover();
                    return;
                }
                const monthBtn = t.closest('[data-dp-pick-month]');
                if (monthBtn) {
                    state.cursor = new Date(state.cursor.getFullYear(), +monthBtn.dataset.dpPickMonth, 1);
                    state.view = 'days';
                    render();
                    return;
                }
                const yearBtn = t.closest('[data-dp-pick-year]');
                if (yearBtn) {
                    state.cursor = new Date(+yearBtn.dataset.dpPickYear, state.cursor.getMonth(), 1);
                    state.view = 'months';
                    render();
                    return;
                }
            });

            // While picking the second endpoint, follow the cursor so the
            // tentative band updates live. Cheap full re-render — there are
            // at most 42 cells.
            popover.addEventListener('mouseover', (e) => {
                if (!range) return;
                if (!state.start || state.end) return;
                const cell = e.target.closest('[data-dp-pick-day]');
                if (!cell) return;
                const d = parseISO(cell.dataset.dpPickDay);
                if (!d || sameDay(d, state.hovered)) return;
                state.hovered = d;
                render();
            });
            popover.addEventListener('mouseleave', () => {
                if (!range) return;
                if (state.hovered) { state.hovered = null; render(); }
            });

            // Arrow-key navigation between cells inside any grid view.
            popover.addEventListener('keydown', (e) => {
                const cell = e.target.closest('.datepicker__cell');
                if (!cell) return;
                const grid = cell.parentElement;
                const cells = [...grid.querySelectorAll('.datepicker__cell')];
                const idx = cells.indexOf(cell);
                if (idx === -1) return;
                const cols = grid.classList.contains('-days') ? 7 : 4;
                let next = idx;
                const isRtl = getComputedStyle(grid).direction === 'rtl';
                const left = isRtl ? 1 : -1;
                const right = -left;
                switch (e.key) {
                    case 'ArrowLeft':  next = idx + left;  break;
                    case 'ArrowRight': next = idx + right; break;
                    case 'ArrowUp':    next = idx - cols;  break;
                    case 'ArrowDown':  next = idx + cols;  break;
                    case 'Home':       next = idx - (idx % cols); break;
                    case 'End':        next = idx + (cols - 1 - (idx % cols)); break;
                    default: return;
                }
                e.preventDefault();
                if (cells[next]) cells[next].focus();
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (range) setRange(null, null);
                else setSelected(null);
            });
        }

        if (input) {
            input.addEventListener('input', () => {
                updateClear();
                if (range) return; // Bare-minimum: don't parse typed ranges.
                const d = parseISO(input.value);
                if (d) {
                    state.selected = d;
                    state.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
                }
            });
        }
    };

    const boot = (root = document) => {
        for (const el of root.querySelectorAll('[data-datepicker]')) init(el);
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
