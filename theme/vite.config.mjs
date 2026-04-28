import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(import.meta.dirname, 'docs');
const OUT = resolve(import.meta.dirname, 'dist-docs');
const BASE = '/neon-kit/';
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://kshutkin.github.io';

const ROUTES = {
  buttons:    { title: 'Buttons',    desc: 'Button variants and states in the Neon theme — default, primary CTA, ghost, and danger styles.' },
  panels:     { title: 'Panels',     desc: 'Panel and surface tokens — backgrounds, borders, and elevation in the Neon theme.' },
  dialogs:    { title: 'Dialogs',    desc: 'Modal dialog component built on the native <dialog> element with Neon theme styling.' },
  typography: { title: 'Typography', desc: 'Typography scale, headings, and body text styles in the Neon theme.' },
  colors:     { title: 'Colors',     desc: 'Color tokens — primary, surface, ink, and border roles across light and dark themes.' },
  links:      { title: 'Links',      desc: 'Link styles and states in the Neon theme — default, hover, visited, and active.' },
  shadows:    { title: 'Shadows',    desc: 'Shadow and inset highlight utilities for elevation in the Neon theme.' },
  utilities:  { title: 'Utilities',  desc: 'Utility classes that complement the Neon theme tokens.' },
};

const DEFAULT_SLUG = 'buttons';

const ACTIVE_CLASSES =
  'nav-link block rounded px-3 py-2 bg-primary dark:bg-primary-dark text-ink-inverse font-semibold inset-shadow-highlight dark:inset-shadow-highlight-dark shadow-drop-subtle dark:shadow-drop-subtle-dark';

const escapeAttr = (s) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const writeFileEnsured = async (path, content) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
};

const renderPage = (shell, slug, fragment) => {
  const route = ROUTES[slug];
  const canonical = `${SITE_ORIGIN}${BASE}${slug}/`;
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

  const activeLinkRegex = new RegExp(
    `(<a[^>]*data-slug="${slug}"[^>]*class=")[^"]*(")`,
  );
  html = html.replace(activeLinkRegex, `$1${ACTIVE_CLASSES}$2`);

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
      ...slugs.map((s) => `${SITE_ORIGIN}${BASE}${s}/`),
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
  build: {
    outDir: OUT,
    emptyOutDir: true,
  },
});
