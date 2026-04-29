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

    const init = (root) => {
        if (root.dataset.dpInit) return;
        root.dataset.dpInit = '1';

        const input = root.querySelector('[data-dp-input]');
        const clearBtn = root.querySelector('[data-dp-clear]');
        const popover = root.querySelector('[data-dp-popover]');
        const clearable = root.hasAttribute('data-clearable');

        const initial = parseISO(root.dataset.value || input?.value);
        const today = new Date();
        const state = {
            view: 'days',          // days | months | years
            cursor: initial ? new Date(initial) : new Date(today.getFullYear(), today.getMonth(), 1),
            selected: initial,
        };
        if (initial && input) input.value = fmtISO(initial);

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
            const isSelected = sameDay(date, state.selected);
            const cls = [
                'datepicker__cell',
                muted && '-muted',
                isToday && '-today',
                isSelected && '-selected',
            ].filter(Boolean).join(' ');
            return `<button class="${cls}" type="button" data-dp-pick-day="${fmtISO(date)}"${isSelected ? ' aria-pressed="true"' : ''}>${date.getDate()}</button>`;
        };

        const renderMonths = () => {
            const year = state.cursor.getFullYear();
            const cells = MONTH_SHORT.map((label, i) => {
                const isCurrent = today.getFullYear() === year && today.getMonth() === i;
                const isSelected = state.selected
                    && state.selected.getFullYear() === year
                    && state.selected.getMonth() === i;
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
            const cells = [];
            for (let i = 0; i < 16; i++) {
                const y = start + i;
                const muted = i === 0 || i > 12;
                const isCurrent = today.getFullYear() === y;
                const isSelected = state.selected && state.selected.getFullYear() === y;
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
                state.cursor = state.selected
                    ? new Date(state.selected.getFullYear(), state.selected.getMonth(), 1)
                    : new Date(today.getFullYear(), today.getMonth(), 1);
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
                    if (d) {
                        setSelected(d);
                        popover.hidePopover();
                    }
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
                setSelected(null);
            });
        }

        if (input) {
            input.addEventListener('input', () => {
                updateClear();
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
