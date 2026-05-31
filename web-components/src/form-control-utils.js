/**
 * Shared helpers for native-like form control custom elements.
 */

/**
 * Parse-only string attribute descriptor for `@slimlib/element`.
 *
 * @type {[(raw: string | null) => string]}
 */
export const parseString = [(raw) => raw ?? ''];

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
 *   internals: ElementInternals,
 *   focusTarget: HTMLInputElement,
 *   willValidate: () => boolean,
 *   stepBy: (amount: number) => void,
 * }} options
 */
export function defineFormControlApi(host, { internals, focusTarget, willValidate, stepBy }) {
    defineReadonlyProperty(host, 'labels', () => internals.labels);
    defineReadonlyProperty(host, 'form', () => internals.form);
    defineReadonlyProperty(host, 'validity', () => internals.validity);
    defineReadonlyProperty(host, 'validationMessage', () => internals.validationMessage);
    defineReadonlyProperty(host, 'willValidate', willValidate);

    /** @type {any} */ (host).checkValidity = () => internals.checkValidity();
    /** @type {any} */ (host).reportValidity = () => internals.reportValidity();
    /** @type {any} */ (host).focus = (/** @type {FocusOptions} */ options) => focusTarget.focus(options);
    /** @type {any} */ (host).blur = () => focusTarget.blur();
    /** @type {any} */ (host).select = () => focusTarget.select();
    /** @type {any} */ (host).stepUp = (n = 1) => stepBy(Number(n));
    /** @type {any} */ (host).stepDown = (n = 1) => stepBy(-Number(n));
}
