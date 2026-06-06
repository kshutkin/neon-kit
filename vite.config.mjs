import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(import.meta.dirname, 'site');
const OUT = resolve(import.meta.dirname, 'dist-docs');
const WC_SRC = resolve(import.meta.dirname, 'web-components/src');
const BASE = '/neon-kit/';
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://kshutkin.github.io';

const WEB_COMPONENT_MODULES = [
  '@neon-kit/web-components',
  '@neon-kit/web-components/tooltip',
  '@neon-kit/web-components/menu',
  '@neon-kit/web-components/combobox',
  '@neon-kit/web-components/multicombobox',
  '@neon-kit/web-components/datepicker',
  '@neon-kit/web-components/timepicker',
  '@neon-kit/web-components/icon',
];

const WEB_COMPONENT_ALIASES = [
  { find: /^@neon-kit\/web-components$/, replacement: resolve(WC_SRC, 'index.js') },
  { find: /^@neon-kit\/web-components\/tooltip$/, replacement: resolve(WC_SRC, 'tooltip.jsx') },
  { find: /^@neon-kit\/web-components\/menu$/, replacement: resolve(WC_SRC, 'menu.js') },
  { find: /^@neon-kit\/web-components\/combobox$/, replacement: resolve(WC_SRC, 'combobox.jsx') },
  { find: /^@neon-kit\/web-components\/multicombobox$/, replacement: resolve(WC_SRC, 'multicombobox.jsx') },
  { find: /^@neon-kit\/web-components\/datepicker$/, replacement: resolve(WC_SRC, 'datepicker.jsx') },
  { find: /^@neon-kit\/web-components\/timepicker$/, replacement: resolve(WC_SRC, 'timepicker.jsx') },
  { find: /^@neon-kit\/web-components\/icon$/, replacement: resolve(WC_SRC, 'icon.jsx') },
];

const ROUTES = {
  about: { title: 'About', desc: 'Neon Kit is a Tailwind-based theme paired with optional Light-DOM web components built on native browser features and shipped as raw CSS and unbundled JS.' },
  'getting-started': { title: 'Getting Started', desc: 'Install Neon Kit, import the theme stylesheet, and add optional Light-DOM web components that use the shared theme CSS.' },
  icons:            { title: 'Icons',           desc: 'The full set of heroicon-derived SVG icons distributed as tree-shakeable ESM modules.' },
  'icon-web-component': { title: 'Icon Web Component', desc: '<neon-icon> - Light-DOM custom element for rendering @neon-kit/icons definitions as inline SVG.' },
  buttons:    { title: 'Buttons',    desc: 'Button variants and states in the Neon theme — default, primary CTA, ghost, and danger styles.', section: 'css', item: 'buttons' },
  panels:     { title: 'Panels',     desc: 'Panel and surface tokens — backgrounds, borders, and elevation in the Neon theme.', section: 'css', item: 'panels' },
  details:    { title: 'Details',    desc: 'Native <details> disclosures with Neon panel styling, custom summary chevrons, focus states, and disabled-looking states.', section: 'css', item: 'details' },
  dialogs:    { title: 'Dialogs',    desc: 'Modal dialog component built on the native <dialog> element with Neon theme styling.', section: 'css', item: 'dialogs' },
  menus:      { title: 'Menus',      desc: 'Dropdown menu component — focusable items with icons, shortcuts, chevrons, and groups, built on the native popover API.', section: 'css', item: 'menus' },
  navigation: { title: 'Navigation', desc: 'Navigation component — element-agnostic interactive rows for sidebars, horizontal tabs, and radio-segmented controls.', section: 'css', item: 'navigation' },
  kbd:        { title: 'Keyboard',   desc: 'Keyboard-shortcut nameplates — flat, non-interactive keycaps that align across single keys and multi-key combos.', section: 'css', item: 'kbd' },
  badges:     { title: 'Badges',     desc: 'Badge component — compact pill labels for counts, statuses, and categories, with semantic state modifiers.', section: 'css', item: 'badges' },
  tags:       { title: 'Tags',       desc: 'Tag component — labelled chips with a built-in remove affordance, sized in em to scale with surrounding text.', section: 'css', item: 'tags' },
  forms:      { title: 'Forms',      desc: 'Form controls — text inputs, checkboxes, radios, and fieldsets styled to match the Neon button family.', section: 'css', item: 'forms' },
  'combobox-single': { title: 'Combobox — Single', desc: 'Single-select combobox layout — focusable field with optional clear, search, and create-new in the dropdown.', section: 'css', item: 'combobox-single' },
  'combobox-multi':  { title: 'Combobox — Multi',  desc: 'Multi-select combobox layout — wrappable tag list field with optional search, select-all, and create-new.', section: 'css', item: 'combobox-multi' },
  datepicker: { title: 'Datepicker', desc: 'Datepicker layout — typeable input with a popover hosting day, month, and year overview grids.', section: 'css', item: 'datepicker' },
  'datepicker-range': { title: 'Datepicker — Range', desc: 'Range-selection datepicker variant — single overlay, two endpoints, with a tentative hover-driven preview band before the second pick is committed.', section: 'css', item: 'datepicker-range' },
  timepicker: { title: 'Timepicker', desc: 'Timepicker layout — typeable input with a popover list of time points at a configurable step, optional seconds, optional IANA timezone, and a combined date+time variant.', section: 'css', item: 'timepicker' },
  tooltip:    { title: 'Tooltip',    desc: 'Tooltip component — popover-based contextual help with anchor-positioned placements, hover/focus triggers, and rich content.', section: 'css', item: 'tooltip' },
  typography: { title: 'Typography', desc: 'Typography scale, headings, and body text styles in the Neon theme.', section: 'css', item: 'typography' },
  tables:     { title: 'Tables',     desc: 'Default browser table styles as inherited from the Neon reset — no component class applied yet, useful as a baseline before introducing a `.table` component.', section: 'css', item: 'tables' },
  colors:     { title: 'Colors',     desc: 'Color tokens — primary, surface, ink, and border roles across light and dark themes.', section: 'css', item: 'colors' },
  links:      { title: 'Links',      desc: 'Link styles and states in the Neon theme — default, hover, visited, and active.', section: 'css', item: 'links' },
  shadows:    { title: 'Shadows',    desc: 'Shadow and inset highlight utilities for elevation in the Neon theme.', section: 'css', item: 'shadows' },
  utilities:  { title: 'Utilities',  desc: 'Utility classes that complement the Neon theme tokens.', section: 'css', item: 'utilities' },
  'wc-tooltip': { title: 'Tooltip (WC)', desc: 'Customized built-in <button is="neon-tooltip"> — a Light-DOM web component wrapping the Neon tooltip styles.', section: 'wc', item: 'tooltip' },
  'wc-menu':    { title: 'Menu (WC)',    desc: '<neon-menu> — Light-DOM web component adding roving tabindex, type-ahead, and arrow-key navigation to the Neon menu styles.', section: 'wc', item: 'menus' },
  'wc-combobox': { title: 'Combobox (WC)', desc: '<neon-combobox> — Light-DOM, form-associated combobox web component with filtering, keyboard navigation, and ElementInternals form participation.', section: 'wc', item: 'combobox-single' },
  'wc-multicombobox': { title: 'Multicombobox (WC)', desc: '<neon-multicombobox> — Light-DOM, form-associated multi-select combobox web component with tag chips, filtering, keyboard navigation, and ElementInternals form participation.', section: 'wc', item: 'combobox-multi' },
  'wc-datepicker': { title: 'Datepicker (WC)', desc: '<neon-datepicker> - Light-DOM, form-associated datepicker web component with native date-input style APIs and ElementInternals form participation.', section: 'wc', item: 'datepicker' },
  'wc-timepicker': { title: 'Timepicker (WC)', desc: '<neon-timepicker> - Light-DOM, form-associated timepicker web component with native time-input style APIs, optional seconds, and ElementInternals form participation.', section: 'wc', item: 'timepicker' },
};

const DEFAULT_SLUG = 'about';
const DEFAULT_COMPONENT_SLUG = 'buttons';
const DOCS_SECTIONS = ['about', 'getting-started', 'components', 'icons'];
const COMPONENT_MODE_SECTIONS = ['css', 'wc'];

const SIDEBAR_ITEMS = [
  { item: 'buttons', css: 'buttons' },
  { item: 'panels', css: 'panels' },
  { item: 'details', css: 'details' },
  { item: 'dialogs', css: 'dialogs' },
  { item: 'menus', css: 'menus', wc: 'wc-menu' },
  { item: 'navigation', css: 'navigation' },
  { item: 'kbd', css: 'kbd' },
  { item: 'badges', css: 'badges' },
  { item: 'tags', css: 'tags' },
  { item: 'forms', css: 'forms' },
  { item: 'combobox-single', css: 'combobox-single', wc: 'wc-combobox' },
  { item: 'combobox-multi', css: 'combobox-multi', wc: 'wc-multicombobox' },
  { item: 'datepicker', css: 'datepicker', wc: 'wc-datepicker' },
  { item: 'datepicker-range', css: 'datepicker-range' },
  { item: 'timepicker', css: 'timepicker', wc: 'wc-timepicker' },
  { item: 'tooltip', css: 'tooltip', wc: 'wc-tooltip' },
  { item: 'typography', css: 'typography' },
  { item: 'tables', css: 'tables' },
  { item: 'colors', css: 'colors' },
  { item: 'links', css: 'links' },
  { item: 'shadows', css: 'shadows' },
  { item: 'utilities', css: 'utilities' },
];

const SIDEBAR_ITEMS_BY_ID = Object.fromEntries(
  SIDEBAR_ITEMS.map((item) => [item.item, item]),
);

const ACTIVE_CLASSES = 'nav__item -active';

const pathFor = (slug) => slug === DEFAULT_SLUG ? BASE : `${BASE}${slug}/`;

const isComponentRoute = (slug) => Boolean(ROUTES[slug]?.item);
const isIconRoute = (slug) => slug === 'icons' || slug === 'icon-web-component';

const sidebarSlugFor = (item, section) => {
  const sidebarItem = SIDEBAR_ITEMS_BY_ID[item];
  return section === 'wc' ? (sidebarItem?.wc ?? sidebarItem?.css) : sidebarItem?.css;
};

const topNavSlugFor = (item, section) => SIDEBAR_ITEMS_BY_ID[item]?.[section];

const docsNavSlugFor = (slug, section) => {
  if (section === 'components') return isComponentRoute(slug) ? slug : DEFAULT_COMPONENT_SLUG;
  if (section === 'about') return 'about';
  if (section === 'icons') return isIconRoute(slug) ? slug : 'icons';
  return 'getting-started';
};

const activeDocsSection = (slug) => {
  if (isComponentRoute(slug)) return 'components';
  if (slug === 'about') return 'about';
  if (isIconRoute(slug)) return 'icons';
  return 'getting-started';
};

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const escapeAttr = (s) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const writeFileEnsured = async (path, content) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
};

const renderPage = (shell, slug, fragment) => {
  const route = ROUTES[slug];
  const canonical = `${SITE_ORIGIN}${pathFor(slug)}`;
  const title = `Project Neon — ${route.title}`;

  let html = shell;

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);

  const headInjection = `
    <meta name="description" content="${escapeAttr(route.desc)}">
    <link rel="canonical" href="${canonical}">
    <meta property="og:title" content="${escapeAttr(title)}">
    <meta property="og:description" content="${escapeAttr(route.desc)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${canonical}">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${escapeAttr(title)}">
    <meta name="twitter:description" content="${escapeAttr(route.desc)}">`;
  html = html.replace('<!-- prerender:head -->', headInjection);

  html = html.replace(
    /(<div id="content-inner"[^>]*>)[\s\S]*?(<\/div>\s*<\/main>)/,
    `$1${fragment}$2`,
  );

  const componentRoute = isComponentRoute(slug);
  const section = componentRoute ? route.section : 'css';

  for (const item of SIDEBAR_ITEMS) {
    const targetSlug = sidebarSlugFor(item.item, section);
    const itemRegex = new RegExp(
      `(<li data-item="${escapeRegExp(item.item)}")( hidden)?(>)`,
    );
    html = html.replace(itemRegex, '$1$3');

    const linkRegex = new RegExp(
      `(<a[^>]*data-item="${escapeRegExp(item.item)}"[^>]*data-slug=")[^"]*("[^>]*href=")[^"]*("[^>]*class=")[^"]*(")`,
    );
    const className = componentRoute && item.item === route.item ? ACTIVE_CLASSES : 'nav__item';
    html = html.replace(linkRegex, `$1${targetSlug}$2${pathFor(targetSlug)}$3${className}$4`);
  }

  html = html.replace(
    /(<a[^>]*data-docs-home[^>]*href=")[^"]*(")/,
    `$1${BASE}$2`,
  );

  for (const docsSection of DOCS_SECTIONS) {
    const targetSlug = docsNavSlugFor(slug, docsSection);
    const docsNavRegex = new RegExp(
      `(<a[^>]*data-docs-section="${docsSection}"[^>]*href=")[^"]*("[^>]*class=")[^"]*(")`,
    );
    const className = docsSection === activeDocsSection(slug) ? ACTIVE_CLASSES : 'nav__item';
    html = html.replace(docsNavRegex, `$1${pathFor(targetSlug)}$2${className}$3`);
  }

  html = html.replace(
    /<nav data-component-mode-nav([^>]*)>/,
    (_match, attrs) => {
      const attrsWithoutHidden = attrs.replace(/\s+hidden(?=\s|$)/, '');
      return `<nav data-component-mode-nav${attrsWithoutHidden}${componentRoute ? '' : ' hidden'}>`;
    },
  );

  for (const targetSection of COMPONENT_MODE_SECTIONS) {
    const targetSlug = componentRoute ? topNavSlugFor(route.item, targetSection) : undefined;
    const hidden = !targetSlug;
    const topNavItemRegex = new RegExp(
      `(<li)( hidden)?(><a[^>]*data-section="${targetSection}")`,
    );
    html = html.replace(topNavItemRegex, hidden ? '$1 hidden$3' : '$1$3');

    const topNavRegex = new RegExp(
      `(<a[^>]*data-section="${targetSection}"[^>]*href=")[^"]*("[^>]*class=")[^"]*(")`,
    );
    const className = !hidden && targetSection === section ? ACTIVE_CLASSES : 'nav__item';
    html = html.replace(topNavRegex, `$1${targetSlug ? pathFor(targetSlug) : ''}$2${className}$3`);
  }

  return html;
};

const prerenderPlugin = () => ({
  name: 'neon-docs-prerender',
  apply: 'build',
  async closeBundle() {
    const shellPath = resolve(OUT, 'index.html');
    const shell = await readFile(shellPath, 'utf8');

    const slugs = Object.keys(ROUTES);

    const fragments = Object.fromEntries(
      await Promise.all(
        slugs.map(async (slug) => [
          slug,
          await readFile(resolve(ROOT, 'sections', `${slug}.html`), 'utf8'),
        ]),
      ),
    );

    for (const slug of slugs) {
      const html = renderPage(shell, slug, fragments[slug]);
      await writeFileEnsured(resolve(OUT, slug, 'index.html'), html);
    }

    const rootHtml = renderPage(shell, DEFAULT_SLUG, fragments[DEFAULT_SLUG]);
    await writeFile(shellPath, rootHtml, 'utf8');

    // 404.html — copy of root, also enables History-API deep-link fallback on GH Pages
    await writeFile(resolve(OUT, '404.html'), rootHtml, 'utf8');

    const now = new Date().toISOString().slice(0, 10);
    const urls = [
      `${SITE_ORIGIN}${BASE}`,
      ...slugs.filter((s) => s !== DEFAULT_SLUG).map((s) => `${SITE_ORIGIN}${pathFor(s)}`),
    ];
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${now}</lastmod></url>`).join('\n')}
</urlset>
`;
    await writeFile(resolve(OUT, 'sitemap.xml'), sitemap, 'utf8');

    const robots = `User-agent: *
Allow: /

Sitemap: ${SITE_ORIGIN}${BASE}sitemap.xml
`;
    await writeFile(resolve(OUT, 'robots.txt'), robots, 'utf8');
  },
});

export default defineConfig({
  root: ROOT,
  base: BASE,
  plugins: [tailwindcss(), prerenderPlugin()],
  resolve: {
    alias: WEB_COMPONENT_ALIASES,
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: '@slimlib/jsx',
  },
  optimizeDeps: {
    exclude: WEB_COMPONENT_MODULES,
  },
  server: {
    fs: {
      allow: [import.meta.dirname],
    },
  },
  build: {
    outDir: OUT,
    emptyOutDir: true,
  },
});
