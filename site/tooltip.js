/* Tooltip demo behavior — minimal hover/focus opener for the docs site.

   The tooltip CSS in `components/tooltip.css` is opener-agnostic: it only
   styles the popover. Native `popovertarget` already handles click and
   keyboard activation for free, so this script exists solely to add hover
   + focus-driven opening for triggers that opt in via:

       <button class="btn" popovertarget="tip-1" data-tooltip-hover>…</button>

   Show is debounced by a small open delay so casual cursor flyovers don't
   flash tooltips. Hide is delayed long enough that the cursor can travel
   from the trigger to the tooltip's body (so links / buttons inside rich
   tooltips remain reachable).

   Note on event choice: `mouseenter` / `mouseleave` do NOT bubble, so they
   can't be delegated from the document. We use `pointerover` / `pointerout`
   (which bubble) and detect crossings with `relatedTarget`.
*/

(() => {
    const OPEN_DELAY_MS = 120;
    const CLOSE_DELAY_MS = 100;

    const timers = new WeakMap();

    const findTriggerForPopover = (popover) =>
        document.querySelectorAll(
            `[data-tooltip-hover][popovertarget="${CSS.escape(popover.id)}"]`,
        );

    const popoverFor = (trigger) => {
        const id = trigger.getAttribute('popovertarget');
        return id ? document.getElementById(id) : null;
    };

    // Open / close are scheduled; any new event for the same trigger
    // cancels the pending action so rapid pointer travel doesn't flicker.
    // Make the trigger an explicit anchor for the popover. The browser
    // only auto-establishes the popover's implicit anchor when the
    // popover is opened via the `popovertarget` click invocation; on
    // programmatic `showPopover()` calls (hover / focus opens) the
    // anchor is `auto` and `position-area` falls back to the viewport.
    // Setting `anchor-name` on the trigger + `position-anchor` on the
    // popover with a name derived from the popover's id wires them
    // together deterministically.
    const ensureAnchorWiring = (trigger, popover) => {
        if (!popover.id) return;
        const name = `--tooltip-anchor-${popover.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        if (trigger.style.getPropertyValue('anchor-name') !== name) {
            trigger.style.setProperty('anchor-name', name);
        }
        if (popover.style.getPropertyValue('position-anchor') !== name) {
            popover.style.setProperty('position-anchor', name);
        }
    };

    const scheduleShow = (trigger) => {
        const popover = popoverFor(trigger);
        if (!popover || typeof popover.showPopover !== 'function') return;
        ensureAnchorWiring(trigger, popover);
        clearTimeout(timers.get(trigger));
        timers.set(trigger, setTimeout(() => {
            try {
                if (popover.matches(':popover-open')) return;
                // Pass `source` so any feature that needs the invoker
                // (autofocus, form-association) sees it. Anchor wiring
                // above is what makes `position-area` actually engage.
                try {
                    popover.showPopover({ source: trigger });
                } catch {
                    popover.showPopover();
                }
            } catch { /* already open or detached */ }
        }, OPEN_DELAY_MS));
    };

    const scheduleHide = (trigger) => {
        const popover = popoverFor(trigger);
        if (!popover || typeof popover.hidePopover !== 'function') return;
        clearTimeout(timers.get(trigger));
        timers.set(trigger, setTimeout(() => {
            // Don't close if the pointer moved into the tooltip body
            // (so users can mouse over to click links inside) or if the
            // trigger still owns keyboard focus.
            if (popover.matches(':hover')) return;
            if (trigger.matches(':hover')) return;
            if (document.activeElement === trigger) return;
            try {
                if (popover.matches(':popover-open')) popover.hidePopover();
            } catch { /* already closed */ }
        }, CLOSE_DELAY_MS));
    };

    // Pointer transitions on the trigger.
    document.addEventListener('pointerover', (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const trigger = target.closest('[data-tooltip-hover][popovertarget]');
        if (trigger) {
            // Coming into the trigger from outside (or from an unrelated element).
            const from = e.relatedTarget;
            if (!(from instanceof Node) || !trigger.contains(from)) {
                scheduleShow(trigger);
            }
            return;
        }
        // Pointer entered the popover itself — cancel any pending hide.
        const popover = target.closest('.tooltip[popover]');
        if (popover) {
            for (const t of findTriggerForPopover(popover)) {
                clearTimeout(timers.get(t));
            }
        }
    });

    document.addEventListener('pointerout', (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const to = e.relatedTarget;

        const trigger = target.closest('[data-tooltip-hover][popovertarget]');
        if (trigger) {
            // Leaving the trigger entirely (relatedTarget is outside it).
            if (!(to instanceof Node) || !trigger.contains(to)) {
                scheduleHide(trigger);
            }
            return;
        }
        const popover = target.closest('.tooltip[popover]');
        if (popover) {
            // Leaving the tooltip body — schedule hide on every associated trigger.
            if (!(to instanceof Node) || !popover.contains(to)) {
                for (const t of findTriggerForPopover(popover)) {
                    scheduleHide(t);
                }
            }
        }
    });

    // Keyboard focus — focusin / focusout DO bubble.
    document.addEventListener('focusin', (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const trigger = target.closest('[data-tooltip-hover][popovertarget]');
        if (trigger) scheduleShow(trigger);
    });

    document.addEventListener('focusout', (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const trigger = target.closest('[data-tooltip-hover][popovertarget]');
        if (trigger) scheduleHide(trigger);
    });
})();
