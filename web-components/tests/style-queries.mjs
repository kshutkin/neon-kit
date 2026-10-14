import * as combo from '@neon-kit/theme/components/combobox.module.css?neon';
import * as tags from '@neon-kit/theme/components/tag.module.css?neon';
import { classSelector } from '@neon-kit/core/utils';

export function styleClass(styles, name) {
    return styles[name] ?? tags[name] ?? combo[name] ?? name;
}
export function styledSelector(styles, selector) {
    return selector.replace(/\.([\w-]+)/g, (_, name) => classSelector(styleClass(styles, name)));
}
export function queryInternal(element, selector, styles) {
    const authored = selector.includes('option') && !selector.includes('.combobox__option') || element.tagName === 'NEON-TOOLTIP' && !selector.includes('tooltip__arrow');
    const root = authored ? element : element.shadowRoot ?? element;
    return root.querySelector(styledSelector(styles, selector));
}
export function queryAllInternal(element, selector, styles) {
    const authored = selector.includes(':scope > option');
    const root = authored ? element : element.shadowRoot ?? element;
    return root.querySelectorAll(styledSelector(styles, selector));
}
export function hasStyleClasses(element, classes) {
    return classes.split(' ').every((name) => element.classList.contains(name));
}
export function activeElement() {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) {
        element = element.shadowRoot.activeElement;
    }
    return element;
}
