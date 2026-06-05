/**
 * @typedef {number} FocusableFlags
 */
export const FOCUSABLE_PROGRAMMATIC = 1;

/**
 * @param {Element} element
 * @param {FocusableFlags} [flags]
 */
export function isFocusable(element, flags = 0) {
    const maybeDisabled = /** @type {Element & { disabled?: boolean }} */ (element);
    const disabled = maybeDisabled.disabled === true;
    const tabindex = element.getAttribute('tabindex');
    const allowsProgrammaticFocus = (flags & FOCUSABLE_PROGRAMMATIC) === FOCUSABLE_PROGRAMMATIC;
    const isKeyboardDisabled = !allowsProgrammaticFocus && tabindex === '-1';
    return !disabled
        && !isKeyboardDisabled
        && element.closest('[inert]') === null
        && !element.matches('input[type="hidden" i]')
        && (tabindex !== null
            || element.matches('button, a[href], area[href], input, select, textarea, summary, iframe, audio[controls], video[controls], [contenteditable=""], [contenteditable="true"]'));
}
