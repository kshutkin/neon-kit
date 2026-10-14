import links from '@neon-kit/theme/components/links.module.css';
import buttons from '@neon-kit/theme/components/button.module.css';
import forms from '@neon-kit/theme/components/forms.module.css';
import menus from '@neon-kit/theme/components/menu.module.css';
import tooltips from '@neon-kit/theme/components/tooltip.module.css';
import keycaps from '@neon-kit/theme/components/kbd.module.css';
import tags from '@neon-kit/theme/components/tag.module.css';
import badges from '@neon-kit/theme/components/badge.module.css';
import shared from '@neon-kit/theme/shared.module.css';

const fragments = import.meta.glob('../sections/{wc-*,jsx-*,icon-web-component}.html', { query: '?raw', import: 'default', eager: true });
const slug = new URLSearchParams(location.search).get('component');
const fragment = fragments[`../sections/${slug}.html`];
const roles = { ...links, ...shared, ...forms, ...buttons, ...menus, ...tooltips, ...keycaps, ...tags, ...badges };
const content = document.getElementById('content-inner');

function bindAuthoredStyles(root) {
    for (const element of root.querySelectorAll('[class]')) {
        // Hosts own native classes. The page styles only consumer-authored markup.
        if (!element.localName.startsWith('neon-')) {
            for (const name of [...element.classList]) {
                if (roles[name]) {
                    element.classList.remove(name);
                    element.classList.add(...roles[name].split(' '));
                }
            }
        }
    }
}

function syncPageTheme() {
    if (window.parent !== window) {
        const parent = window.parent.document.documentElement;
        const root = document.documentElement;
        root.style.cssText = '';
        root.style.colorScheme = parent.style.colorScheme || 'light dark';
        for (const name of parent.style) {
            if (name.startsWith('--neon-')) {
                root.style.setProperty(name, parent.style.getPropertyValue(name));
            }
        }
    }
}

if (!fragment) {
    throw new Error(`Unknown renderer example ${slug}`);
}
content.innerHTML = fragment;
content.addEventListener('submit', (event) => {
    const form = event.target;
    if (form instanceof HTMLFormElement && ['wc-cb-form', 'wc-mcb-form'].includes(form.id)) {
        event.preventDefault();
        const data = new FormData(form);
        const values = form.id === 'wc-mcb-form'
            ? Object.fromEntries([...new Set(data.keys())].map((name) => [name, data.getAll(name)]))
            : Object.fromEntries(data);
        const output = document.getElementById(`${form.id}-out`);
        output.textContent = JSON.stringify(values, null, 2);
        output.hidden = false;
    }
});
bindAuthoredStyles(content);
addEventListener('message', (event) => {
    if (event.source === window.parent && event.origin === location.origin) {
        if (event.data?.type === 'neon-docs:theme') {
            syncPageTheme();
        } else if (event.data?.type === 'neon-docs:measure') {
            reportHeight();
        }
    }
});
syncPageTheme();
if (slug.startsWith('wc-')) {
    await import('../wc.js');
} else if (slug === 'jsx-menu') {
    await import('../jsx-menu.jsx');
} else if (slug === 'jsx-tooltip') {
    await import('../jsx-tooltip.jsx');
}
await import('../icons.js');
document.dispatchEvent(new CustomEvent('neon-docs:render', { detail: { slug } }));
if (content.querySelector('neon-icon')) {
    await customElements.whenDefined('neon-icon');
}
bindAuthoredStyles(content);
new MutationObserver(() => bindAuthoredStyles(content)).observe(content, { childList: true, subtree: true });
function reportHeight() {
    window.parent.postMessage({ type: 'neon-docs:height', height: document.body.scrollHeight }, location.origin);
}
new ResizeObserver(reportHeight).observe(document.body);
window.rendererReady = true;
