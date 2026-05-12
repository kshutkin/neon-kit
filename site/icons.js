// Side-effect imports register `<neon-icon>` and wire dynamic
// icon loading via Vite's `import.meta.glob`.
import '@neon-kit/web-components/icon';
import '@neon-kit/web-components/icon-vite-loader';

// Variant switcher on the Icons docs page. Delegated at document
// level because section HTML is injected via innerHTML on soft-nav,
// so inline scripts inside the section would never run.
document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-icon-variant-nav] button[data-variant]') : null;
    if (!target) return;
    const nav = target.closest('[data-icon-variant-nav]');
    const variant = target.getAttribute('data-variant');
    if (!nav || !variant) return;
    for (const btn of nav.querySelectorAll('button[data-variant]')) {
        const active = btn === target;
        btn.classList.toggle('-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    for (const el of document.querySelectorAll('[data-icon-base]')) {
        const base = el.getAttribute('data-icon-base');
        if (base) el.setAttribute('name', `${variant}/${base}`);
    }
});
