/**
 * Shared helpers for native-like form control custom elements.
 */

/**
 * @param {HTMLElement} host
 * @param {string} name
 * @param {string | number | null | undefined} value
 * @returns {string}
 */
export function reflectStringAttr(host, name, value) {
    const next = value == null || value === '' ? '' : String(value);
    if (next === '') {
        if (host.hasAttribute(name)) host.removeAttribute(name);
    } else if (host.getAttribute(name) !== next) {
        host.setAttribute(name, next);
    }
    return next;
}

/**
 * @param {HTMLElement} host
 * @param {string} name
 * @param {unknown} value
 * @returns {boolean}
 */
export function reflectBoolAttr(host, name, value) {
    const next = !!value;
    if (host.hasAttribute(name) !== next) {
        if (next) host.setAttribute(name, '');
        else host.removeAttribute(name);
    }
    return next;
}

/**
 * @param {HTMLElement} host
 * @param {string} name
 * @param {() => unknown} get
 */
export function defineReadonlyProperty(host, name, get) {
    Object.defineProperty(host, name, {
        configurable: true,
        enumerable: true,
        get,
    });
}

/**
 * @param {HTMLElement} host
 * @param {string} name
 * @param {() => unknown} get
 * @param {(value: unknown) => void} set
 */
export function defineWritableProperty(host, name, get, set) {
    Object.defineProperty(host, name, {
        configurable: true,
        enumerable: true,
        get,
        set,
    });
}

/**
 * @param {HTMLElement} host
 * @param {Record<string, any>} state
 * @param {string} name
 * @param {() => void} [afterSet]
 */
export function defineStringProperty(host, state, name, afterSet = () => {}) {
    defineWritableProperty(
        host,
        name,
        () => state[name],
        (value) => {
            state[name] = reflectStringAttr(host, name, /** @type {any} */ (value));
            afterSet();
        },
    );
}

/**
 * @param {HTMLElement} host
 * @param {Record<string, any>} state
 * @param {string} propName
 * @param {string} attrName
 * @param {() => void} [afterSet]
 */
export function defineBooleanProperty(host, state, propName, attrName, afterSet = () => {}) {
    defineWritableProperty(
        host,
        propName,
        () => !!state[attrName],
        (value) => {
            state[attrName] = reflectBoolAttr(host, attrName, value);
            afterSet();
        },
    );
}

/**
 * @param {HTMLElement} host
 * @param {{
 *   focusTarget: HTMLInputElement,
 *   willValidate: () => boolean,
 *   stepBy: (amount: number) => void,
 * }} options
 */
export function defineFormControlApi(host, { focusTarget, willValidate, stepBy }) {
    defineReadonlyProperty(host, 'willValidate', willValidate);

    /** @type {any} */ (host).focus = (/** @type {FocusOptions} */ options) => focusTarget.focus(options);
    /** @type {any} */ (host).blur = () => focusTarget.blur();
    /** @type {any} */ (host).select = () => focusTarget.select();
    /** @type {any} */ (host).stepUp = (n = 1) => stepBy(Number(n));
    /** @type {any} */ (host).stepDown = (n = 1) => stepBy(-Number(n));
}

/**
 * Associate light-tree labels and ARIA references with the generated control.
 * @param {HTMLElement} host
 * @param {ElementInternals} elementInternals
 * @param {HTMLElement} focusTarget
 * @param {HTMLElement[]} [additionalTargets]
 * @returns {() => void}
 */
export function connectFormLabels(host, elementInternals, focusTarget, additionalTargets = []) {
    const root = host.getRootNode();
    /** @param {string} name */
    const references = (name) => (host.getAttribute(name) ?? '').split(/\s+/).filter(Boolean)
        .map((id) => root instanceof Document || root instanceof ShadowRoot ? root.getElementById(id) : null)
        .filter((element) => element instanceof HTMLElement);
    const sync = () => {
        const descriptions = references('aria-describedby');
        const labels = host.hasAttribute('aria-labelledby') ? references('aria-labelledby')
            : host.hasAttribute('aria-label') ? [] : Array.from(elementInternals.labels ?? []).filter((element) => element instanceof HTMLElement);
        for (const target of [focusTarget, ...additionalTargets]) {
            target.ariaLabel = host.getAttribute('aria-label');
            target.ariaLabelledByElements = labels;
            target.ariaDescribedByElements = descriptions;
        }
    };
    sync();
    if (!host.hasAttribute('tabindex')) {
        host.tabIndex = -1;
    }
    /** @param {FocusEvent} event */
    const focus = (event) => {
        if (event.composedPath()[0] === host) {
            focusTarget.focus();
        }
    };
    host.addEventListener('focus', focus);
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'aria-labelledby', 'aria-describedby', 'id', 'for'] });
    return () => {
        observer.disconnect();
        host.removeEventListener('focus', focus);
    };
}
