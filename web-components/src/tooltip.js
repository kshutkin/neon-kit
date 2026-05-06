/**
 * `<neon-tooltip>` — autonomous custom element that turns its own
 * markup into a popover-based tooltip and wires its parent element as
 * the trigger.
 *
 * The element IS the popover (via the native `popover` attribute), so
 * there is no extra DOM created or torn down. The parent element is
 * the trigger; the tooltip body is whatever you put inside
 * `<neon-tooltip>` — text, rich HTML, anything.
 *
 * Usage:
 *
 *   <button>Save
 *       <neon-tooltip>Saves the current document.</neon-tooltip>
 *   </button>
 *
 *   <a href="/help">Help
 *       <neon-tooltip data-placement="bottom">
 *           <strong>Need a hand?</strong>
 *           <p>Open the help center in a new tab.</p>
 *       </neon-tooltip>
 *   </a>
 *
 * Attributes (all optional):
 *
 *   data-placement   `top` (default) | `bottom` | `left` | `right`.
 *   data-trigger     Space-separated: `hover` `focus` `click`. Defaults
 *                    to `hover focus` when the attribute is absent.
 *                    Set <code>data-trigger=""</code> to opt out of all
 *                    automatic triggers and drive the tooltip yourself
 *                    via <code>showTooltip()</code> / <code>hideTooltip()</code>.
 *
 * The tooltip styles itself with the `.tooltip` and `.-<placement>`
 * classes from `@neon-kit/theme`. A `.tooltip__arrow` child is added
 * automatically if you do not provide one.
 *
 * Caveats:
 * - Parent must be a real element. Void elements (`<input>`, `<img>`,
 *   `<br>`) cannot host children — wrap them.
 * - Parent must be focusable for the `focus` trigger to fire. We do
 *   not add `tabindex` ourselves; if the parent is not focusable and
 *   `focus` is in the trigger set, a `console.debug` hint is printed.
 * - Multiple `<neon-tooltip>` children of the same parent both attach
 *   listeners; the second one to connect wins `aria-describedby`.
 * - Inside SVG you'll need a `<foreignObject>` host (the usual
 *   foreign-namespace caveat).
 */

const PLACEMENTS = /** @type {const} */ (['top', 'bottom', 'left', 'right']);

const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 100;

let nextId = 0;

/**
 * @typedef {'hover' | 'focus' | 'click'} Trigger
 * @typedef {{ target: 'parent' | 'self', event: string, action: 'show' | 'hide' | 'toggle' | 'cancelHide' }} Binding
 */

/**
 * Map a trigger keyword to the listeners that implement it. Each entry
 * is `{ target, event, action }`. The component installs only the
 * bindings for the triggers in the active set.
 *
 * @type {Record<Trigger, Binding[]>}
 */
const TRIGGER_BINDINGS = {
    hover: [
        { target: 'parent', event: 'pointerenter', action: 'show' },
        { target: 'parent', event: 'pointerleave', action: 'hide' },
        // Keep the popover open while the cursor is over rich content.
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

export class NeonTooltipElement extends HTMLElement {
    static get observedAttributes() {
        return ['data-placement', 'data-trigger'];
    }

    /** @type {HTMLElement | null} */
    #parent = null;
    /** @type {Set<Trigger>} */
    #triggers = new Set();
    /** @type {ReturnType<typeof setTimeout> | null} */
    #timer = null;
    /** @type {AbortController | null} */
    #listeners = null;

    // Track which attributes we set on the parent so we can restore
    // cleanly. We never overwrite values the consumer set themselves.
    #setAriaDescribedBy = false;
    #anchorName = '';

    /** @type {Record<'show' | 'hide' | 'toggle' | 'cancelHide', () => void>} */
    #actions = {
        show: () => this.#scheduleShow(),
        hide: () => this.#scheduleHide(),
        toggle: () => {
            // Click toggles immediately, with no open delay.
            if (this.matches(':popover-open')) this.hideTooltip();
            else this.showTooltip();
        },
        cancelHide: () => {
            if (this.#timer) {
                clearTimeout(this.#timer);
                this.#timer = null;
            }
        },
    };

    connectedCallback() {
        const parent = this.parentElement;
        if (!parent) return;
        this.#parent = parent;

        if (!this.id) this.id = `neon-tooltip-${++nextId}`;
        if (!this.hasAttribute('popover')) this.setAttribute('popover', 'manual');
        this.classList.add('tooltip');

        // Auto-add an arrow if the consumer did not include one.
        if (!this.querySelector(':scope > .tooltip__arrow')) {
            const arrow = document.createElement('div');
            arrow.className = 'tooltip__arrow';
            this.appendChild(arrow);
        }

        // If the body is text-only, mark it as a tooltip for AT.
        if (!this.hasAttribute('role') && !this.querySelector(':scope > :not(.tooltip__arrow)')) {
            this.setAttribute('role', 'tooltip');
        }

        // Wire CSS anchor positioning. We assign a unique anchor name to
        // the parent and reference it from this popover. If the parent
        // already has an `anchor-name`, reuse it instead of overwriting.
        const existingAnchor = parent.style.getPropertyValue('anchor-name');
        if (existingAnchor) {
            this.#anchorName = '';
            if (!this.style.getPropertyValue('position-anchor')) {
                this.style.setProperty('position-anchor', existingAnchor);
            }
        } else {
            this.#anchorName = `--neon-tooltip-anchor-${this.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            parent.style.setProperty('anchor-name', this.#anchorName);
            if (!this.style.getPropertyValue('position-anchor')) {
                this.style.setProperty('position-anchor', this.#anchorName);
            }
        }

        // Wire aria-describedby on the parent unless the consumer set it.
        if (!parent.hasAttribute('aria-describedby')) {
            parent.setAttribute('aria-describedby', this.id);
            this.#setAriaDescribedBy = true;
        }

        this.#refresh();
        this.#applyTriggers();

        if (this.#triggers.has('focus') && !isFocusable(parent)) {
            // eslint-disable-next-line no-console
            console.debug(
                '<neon-tooltip>: parent element is not focusable; the `focus` trigger will not fire.',
                parent,
            );
        }
    }

    disconnectedCallback() {
        if (this.#timer) {
            clearTimeout(this.#timer);
            this.#timer = null;
        }
        this.#listeners?.abort();
        this.#listeners = null;
        const parent = this.#parent;
        if (parent) {
            if (this.#setAriaDescribedBy && parent.getAttribute('aria-describedby') === this.id) {
                parent.removeAttribute('aria-describedby');
            }
            if (this.#anchorName && parent.style.getPropertyValue('anchor-name') === this.#anchorName) {
                parent.style.removeProperty('anchor-name');
            }
        }
        this.#parent = null;
        this.#setAriaDescribedBy = false;
        this.#anchorName = '';
    }

    attributeChangedCallback() {
        if (!this.#parent) return;
        this.#refresh();
        this.#applyTriggers();
    }

    /** Programmatically show the tooltip. */
    showTooltip() {
        if (this.#timer) {
            clearTimeout(this.#timer);
            this.#timer = null;
        }
        try {
            if (typeof (/** @type {any} */ (this)).showPopover === 'function' && !this.matches(':popover-open')) {
                /** @type {any} */ (this).showPopover();
            }
        } catch {
            /* already open or unsupported */
        }
    }

    /** Programmatically hide the tooltip. */
    hideTooltip() {
        if (this.#timer) {
            clearTimeout(this.#timer);
            this.#timer = null;
        }
        try {
            if (typeof (/** @type {any} */ (this)).hidePopover === 'function' && this.matches(':popover-open')) {
                /** @type {any} */ (this).hidePopover();
            }
        } catch {
            /* already closed */
        }
    }

    #refresh() {
        const placement = readPlacement(this.getAttribute('data-placement'));
        this.classList.remove('-top', '-bottom', '-left', '-right');
        this.classList.add(`-${placement}`);

        this.#triggers = readTriggerSet(this.getAttribute('data-trigger'));
    }

    /**
     * Bind exactly the listeners required by the active trigger set.
     * Called on connect and whenever `data-trigger` changes.
     */
    #applyTriggers() {
        this.#listeners?.abort();
        const parent = this.#parent;
        if (!parent) return;
        const ctrl = new AbortController();
        this.#listeners = ctrl;
        const opts = { signal: ctrl.signal };
        for (const trigger of this.#triggers) {
            for (const binding of TRIGGER_BINDINGS[trigger]) {
                const target = binding.target === 'parent' ? parent : this;
                target.addEventListener(binding.event, this.#actions[binding.action], opts);
            }
        }
    }

    /**
     * @param {number} delay
     */
    #scheduleShow(delay = OPEN_DELAY_MS) {
        if (typeof (/** @type {any} */ (this)).showPopover !== 'function') return;
        if (this.#timer) clearTimeout(this.#timer);
        this.#timer = setTimeout(() => {
            try {
                if (this.matches(':popover-open')) return;
                /** @type {any} */ (this).showPopover();
            } catch {
                /* already open or detached */
            }
        }, delay);
    }

    /**
     * @param {number} delay
     */
    #scheduleHide(delay = CLOSE_DELAY_MS) {
        if (typeof (/** @type {any} */ (this)).hidePopover !== 'function') return;
        if (this.#timer) clearTimeout(this.#timer);
        this.#timer = setTimeout(() => {
            const parent = this.#parent;
            if (this.matches(':hover')) return;
            if (parent?.matches(':hover')) return;
            if (document.activeElement === parent) return;
            if (this.contains(document.activeElement)) return;
            try {
                if (this.matches(':popover-open')) /** @type {any} */ (this).hidePopover();
            } catch {
                /* already closed */
            }
        }, delay);
    }
}

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
        // Attribute absent → default to hover + focus.
        set.add('hover').add('focus');
        return set;
    }
    for (const part of value.trim().split(/\s+/)) {
        if (part === 'hover' || part === 'focus' || part === 'click') {
            set.add(part);
        }
    }
    return set;
}

/**
 * Best-effort focusability check. We only flag obvious cases — there
 * are still edge cases (contenteditable, custom-element delegatesFocus,
 * etc.) but a debug hint is enough to point the user at the issue.
 *
 * @param {Element} el
 */
function isFocusable(el) {
    if (el.matches('button, a[href], input, select, textarea, summary, [contenteditable=""], [contenteditable="true"]')) {
        const ti = el.getAttribute('tabindex');
        return !ti || ti !== '-1';
    }
    const ti = el.getAttribute('tabindex');
    return ti !== null && ti !== '-1';
}

/**
 * Define `<neon-tooltip>` as an autonomous custom element. Idempotent.
 *
 * @param {string} [tagName] Optional override for the tag name.
 *   Defaults to `neon-tooltip`.
 */
export function registerTooltip(tagName = 'neon-tooltip') {
    if (typeof globalThis.customElements === 'undefined') return;
    if (globalThis.customElements.get(tagName)) return;
    globalThis.customElements.define(tagName, NeonTooltipElement);
}

// Side-effect register on import.
registerTooltip();
