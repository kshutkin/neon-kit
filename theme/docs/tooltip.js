/* Tooltip demo behavior — minimal hover/focus opener for the docs site.

   The tooltip CSS in `components/tooltip.css` is opener-agnostic: it
   only styles the popover. Native `popovertarget` already handles click
   and keyboard activation for free, so this script exists solely to add
   hover + focus-driven opening for elements that opt in via:

       <button class="btn" popovertarget="tip-1" data-tooltip-hover>…</button>

   Show is debounced by a small open delay so casual cursor flyovers
   don't flash tooltips. Hide is immediate when the pointer leaves both
   the trigger and its tooltip.
*/

(() => {
    const OPEN_DELAY_MS = 120;
    const CLOSE_DELAY_MS = 80;

    const timers = new WeakMap();

    const popoverFor = (trigger) => {
        const id = trigger.getAttribute('popovertarget');
        return id ? document.getElementById(id) : null;
    };

    const scheduleShow = (trigger) => {
        const popover = popoverFor(trigger);
        if (!popover || typeof popover.showPopover !== 'function') return;
        clearTimeout(timers.get(trigger));
        timers.set(trigger, setTimeout(() => {
            try {
                if (!popover.matches(':popover-open')) popover.showPopover();
            } catch { /* already open or detached */ }
        }, OPEN_DELAY_MS));
    };

    const scheduleHide = (trigger) => {
        const popover = popoverFor(trigger);
        if (!popover || typeof popover.hidePopover !== 'function') return;
        clearTimeout(timers.get(trigger));
        timers.set(trigger, setTimeout(() => {
            // Don't close if the pointer moved onto the tooltip itself
            // or if the trigger still has focus.
            if (popover.matches(':hover')) return;
            if (trigger.matches(':hover, :focus-visible')) return;
            try {
                if (popover.matches(':popover-open')) popover.hidePopover();
            } catch { /* already closed */ }
        }, CLOSE_DELAY_MS));
    };

    const findTrigger = (target) => {
        if (!target || typeof target.closest !== 'function') return null;
        return target.closest('[data-tooltip-hover][popovertarget]');
    };

    const findPopover = (target) => {
        if (!target || typeof target.closest !== 'function') return null;
        return target.closest('.tooltip[popover]');
    };

    const onEnter = (e) => {
        const trigger = findTrigger(e.target);
        if (!trigger) return;
        scheduleShow(trigger);
    };

    const onLeave = (e) => {
        const trigger = findTrigger(e.target);
        if (!trigger) return;
        scheduleHide(trigger);
    };

    const onFocusIn = (e) => {
        const trigger = findTrigger(e.target);
        if (!trigger) return;
        scheduleShow(trigger);
    };

    const onFocusOut = (e) => {
        const trigger = findTrigger(e.target);
        if (!trigger) return;
        scheduleHide(trigger);
    };

    // Pointer events on the popover keep it open while the cursor sits
    // over rich content (links, buttons inside the tooltip body).
    const onPopoverEnter = (e) => {
        const popover = findPopover(e.target);
        if (!popover) return;
        // Find the invoker(s) with hover behavior pointing at this popover.
        const triggers = document.querySelectorAll(
            `[data-tooltip-hover][popovertarget="${CSS.escape(popover.id)}"]`,
        );
        for (const t of triggers) clearTimeout(timers.get(t));
    };

    const onPopoverLeave = (e) => {
        const popover = findPopover(e.target);
        if (!popover) return;
        const triggers = document.querySelectorAll(
            `[data-tooltip-hover][popovertarget="${CSS.escape(popover.id)}"]`,
        );
        for (const t of triggers) scheduleHide(t);
    };

    document.addEventListener('mouseenter', onEnter, true);
    document.addEventListener('mouseleave', onLeave, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('mouseenter', onPopoverEnter, true);
    document.addEventListener('mouseleave', onPopoverLeave, true);
})();
