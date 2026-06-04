/**
 * `<neon-tooltip>` — autonomous custom element that turns its own
 * markup into a popover-based tooltip and wires its parent element as
 * the trigger.
 *
 * The element IS the popover (via the native `popover` attribute), so
 * there is no extra DOM created or torn down. The parent element is
 * the trigger; the tooltip body is whatever you put inside
 * `<neon-tooltip>`.
 *
 * Attributes:
 *
 *   placement   `top` (default) | `bottom` | `left` | `right`.
 *   trigger     Space-separated: `hover` `focus` `click`. Defaults
 *               to `hover focus` when the attribute is absent.
 *
 * Per ADR 0001 the element renders into Light DOM (no shadow root).
 *
 * Attribute changes propagate synchronously: the two API attributes are
 * declared via `props()` and observed by EAGER `effect()`s, so
 * `tip.setAttribute('placement', 'bottom')` commits the class
 * change before the call returns.
 */
import { DEV } from 'esm-env';

import {
    attributes,
    defineElement,
    onConnect,
    onDisconnect,
    props,
    stringAttribute,
} from '@slimlib/element';

const PLACEMENTS = /** @type {const} */ (['top', 'bottom', 'left', 'right']);

const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 100;

let nextId = 0;

/**
 * @typedef {'hover' | 'focus' | 'click'} Trigger
 * @typedef {{ target: 'parent' | 'self', event: string, action: 'show' | 'hide' | 'toggle' | 'cancelHide' }} Binding
 */

/** @type {Record<Trigger, Binding[]>} */
const TRIGGER_BINDINGS = {
    hover: [
        { target: 'parent', event: 'pointerenter', action: 'show' },
        { target: 'parent', event: 'pointerleave', action: 'hide' },
        { target: 'self', event: 'pointerenter', action: 'cancelHide' },
        { target: 'self', event: 'pointerleave', action: 'hide' },
    ],
    focus: [
        { target: 'parent', event: 'focusin', action: 'show' },
        { target: 'parent', event: 'focusout', action: 'hide' },
    ],
    click: [
        { target: 'parent', event: 'click', action: 'toggle' },
    ],
};

/**
 * @param {string | null} value
 * @returns {'top' | 'bottom' | 'left' | 'right'}
 */
function readPlacement(value) {
    return /** @type {any} */ (PLACEMENTS.includes(/** @type {any} */ (value)) ? value : 'top');
}

/**
 * @param {string | null} value
 * @returns {Set<Trigger>}
 */
function readTriggerSet(value) {
    /** @type {Set<Trigger>} */
    const set = new Set();
    if (value === null) {
        set.add('hover').add('focus');
        return set;
    }
    for (const part of value.trim().split(/\s+/)) {
        if (part === 'hover' || part === 'focus' || part === 'click') set.add(part);
    }
    return set;
}

/**
 * @param {Element} el
 */
function isFocusable(el) {
    const disabled = /** @type {any} */ (el).disabled === true;
    const tabindex = el.getAttribute('tabindex');
    return !disabled
        && tabindex !== '-1'
        && (tabindex !== null
            || el.matches('button, a[href], input, select, textarea, summary, [contenteditable=""], [contenteditable="true"]'));
}

/**
 * @param {HTMLElement} host
 */
const renderTooltip = (host) => {
    props({
        placement: /** @type {string | null} */ (null),
        trigger: /** @type {string | null} */ (null),
    });

    /** @type {HTMLElement | null} */
    let parent = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null;
    /** @type {AbortController | null} */
    let listeners = null;
    /** @type {'top' | 'bottom' | 'left' | 'right'} */
    let appliedPlacement = 'top';
    let setAriaDescribedBy = false;
    let anchorName = '';

    const clearTimer = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const showNow = () => {
        clearTimer();
        try {
            if (typeof (/** @type {any} */ (host)).showPopover === 'function' && !host.matches(':popover-open')) {
                /** @type {any} */ (host).showPopover();
            }
        } catch {
            /* already open or unsupported */
        }
    };

    const hideNow = () => {
        clearTimer();
        try {
            if (typeof (/** @type {any} */ (host)).hidePopover === 'function' && host.matches(':popover-open')) {
                /** @type {any} */ (host).hidePopover();
            }
        } catch {
            /* already closed */
        }
    };

    /** @param {number} delay */
    const scheduleShow = (delay = OPEN_DELAY_MS) => {
        if (typeof (/** @type {any} */ (host)).showPopover !== 'function') return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            try {
                if (host.matches(':popover-open')) return;
                /** @type {any} */ (host).showPopover();
            } catch {
                /* already open or detached */
            }
        }, delay);
    };

    /** @param {number} delay */
    const scheduleHide = (delay = CLOSE_DELAY_MS) => {
        if (typeof (/** @type {any} */ (host)).hidePopover !== 'function') return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            if (host.matches(':hover')) return;
            if (parent?.matches(':hover')) return;
            if (document.activeElement === parent) return;
            if (host.contains(document.activeElement)) return;
            try {
                if (host.matches(':popover-open')) /** @type {any} */ (host).hidePopover();
            } catch {
                /* already closed */
            }
        }, delay);
    };

    /** @type {Record<'show' | 'hide' | 'toggle' | 'cancelHide', () => void>} */
    const actions = {
        show: () => scheduleShow(),
        hide: () => scheduleHide(),
        toggle: () => {
            if (host.matches(':popover-open')) hideNow();
            else showNow();
        },
        cancelHide: () => clearTimer(),
    };

    /** @param {'top' | 'bottom' | 'left' | 'right'} value */
    const applyPlacementClass = (value) => {
        if (appliedPlacement === value && host.classList.contains(`-${value}`)) return;
        host.classList.remove('-top', '-bottom', '-left', '-right');
        host.classList.add(`-${value}`);
        appliedPlacement = value;
    };

    /** @param {Set<Trigger>} triggers */
    const applyTriggers = (triggers) => {
        listeners?.abort();
        if (!parent) return;
        const ctrl = new AbortController();
        listeners = ctrl;
        const opts = { signal: ctrl.signal };
        for (const trigger of triggers) {
            for (const binding of TRIGGER_BINDINGS[trigger]) {
                const target = binding.target === 'parent' ? parent : host;
                target.addEventListener(binding.event, actions[binding.action], opts);
            }
        }
    };

    // ---- Public host API ----------------------------------------------
    /** @type {any} */ (host).showTooltip = showNow;
    /** @type {any} */ (host).hideTooltip = hideNow;

    // The two API attributes only drive imperative side effects (class
    // toggle, listener rewiring); nothing in a reactive view consumes
    // them. `props()` gives us pre-upgrade adoption and a clean
    // declaration site, but we wrap its setters with a sync hook so
    // attribute writes commit before setAttribute() returns (the
    // store's effect scheduler is microtask-deferred).
    /** @param {string} name @param {(value: string | null) => void} sideEffect */
    const wrapPropSetter = (name, sideEffect) => {
        const descriptor = Object.getOwnPropertyDescriptor(host, name);
        if (!descriptor || !descriptor.set || !descriptor.get) return;
        const { get, set } = descriptor;
        Object.defineProperty(host, name, {
            configurable: true,
            enumerable: true,
            get,
            set(value) {
                set.call(host, value);
                if (!parent) return;
                sideEffect(value == null ? null : String(value));
            },
        });
    };
    wrapPropSetter('placement', (v) => applyPlacementClass(readPlacement(v)));
    wrapPropSetter('trigger', (v) => applyTriggers(readTriggerSet(v)));

    onConnect(() => {
        parent = host.parentElement;
        if (!parent) return;

        if (!host.id) host.id = `neon-tooltip-${++nextId}`;
        if (!host.hasAttribute('popover')) host.setAttribute('popover', 'manual');
        host.classList.add('tooltip');

        if (!host.querySelector(':scope > .tooltip__arrow')) {
            host.appendChild(<div class="tooltip__arrow" />);
        }

        if (!host.hasAttribute('role') && !host.querySelector(':scope > :not(.tooltip__arrow)')) {
            host.setAttribute('role', 'tooltip');
        }

        const existingAnchor = parent.style.getPropertyValue('anchor-name');
        if (existingAnchor) {
            anchorName = '';
            if (!host.style.getPropertyValue('position-anchor')) {
                host.style.setProperty('position-anchor', existingAnchor);
            }
        } else {
            anchorName = `--neon-tooltip-anchor-${host.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            parent.style.setProperty('anchor-name', anchorName);
            if (!host.style.getPropertyValue('position-anchor')) {
                host.style.setProperty('position-anchor', anchorName);
            }
        }

        if (!parent.hasAttribute('aria-describedby')) {
            parent.setAttribute('aria-describedby', host.id);
            setAriaDescribedBy = true;
        }

        applyPlacementClass(readPlacement(host.getAttribute('placement')));
        applyTriggers(readTriggerSet(host.getAttribute('trigger')));

        if (DEV && readTriggerSet(host.getAttribute('trigger')).has('focus') && !isFocusable(parent)) {
            // eslint-disable-next-line no-console
            console.debug(
                '<neon-tooltip>: parent element is not focusable; the `focus` trigger will not fire.',
                parent,
            );
        }
    });

    onDisconnect(() => {
        clearTimer();
        listeners?.abort();
        listeners = null;
        if (parent) {
            if (setAriaDescribedBy && parent.getAttribute('aria-describedby') === host.id) {
                parent.removeAttribute('aria-describedby');
            }
            if (anchorName && parent.style.getPropertyValue('anchor-name') === anchorName) {
                parent.style.removeProperty('anchor-name');
            }
        }
        parent = null;
        setAriaDescribedBy = false;
        anchorName = '';
    });

    return null;
};

/**
 * Public instance type of the `<neon-tooltip>` element.
 *
 * @typedef {HTMLElement & {
 *   showTooltip(): void,
 *   hideTooltip(): void,
 * }} NeonTooltipElement
 */

defineElement(
    'neon-tooltip',
    [
        attributes({
            placement: [stringAttribute[0]],
            trigger: [stringAttribute[0]],
        }),
    ],
    renderTooltip,
);

export {};
