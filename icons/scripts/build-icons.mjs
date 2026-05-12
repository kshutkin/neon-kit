#!/usr/bin/env node
/**
 * Build icon modules for `@neon-kit/icons` from heroicons sources.
 *
 * For each entry in `MANIFEST`, emits one module per variant:
 *
 *     src/<variant>/<name>.js         — two-line module: import + factory call
 *     src/<variant>/index.js          — named re-exports for the variant
 *     src/index.js                    — root aggregate (4 namespaces + serialize)
 *
 * Variants: `outline`, `solid`, `mini`, `micro`. Each variant's defaults
 * (viewBox, shell attrs, path attrs) live in the hand-tracked
 * `src/<variant>/_variant.js` factory — the generator imports those
 * named exports at run time so the emitted icon modules stay in sync
 * with whatever the factory currently declares.
 *
 * Re-runnable: deletes prior outputs deterministically before
 * re-emitting, so running twice produces a clean diff.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const SRC = resolve(PKG_ROOT, 'src');
const require_ = createRequire(import.meta.url);

const VARIANTS = /** @type {const} */ (['outline', 'solid', 'mini', 'micro']);

/**
 * Output icon name (kebab) -> heroicons-relative path per variant.
 *
 * Keep alphabetically sorted by output name for diff stability.
 *
 * @type {Record<string, Record<typeof VARIANTS[number], string>>}
 */
const MANIFEST = {
    'arrow-path': {
        outline: '24/outline/arrow-path.svg',
        solid: '24/solid/arrow-path.svg',
        mini: '20/solid/arrow-path.svg',
        micro: '16/solid/arrow-path.svg',
    },
    'bars-3': {
        outline: '24/outline/bars-3.svg',
        solid: '24/solid/bars-3.svg',
        mini: '20/solid/bars-3.svg',
        micro: '16/solid/bars-3.svg',
    },
    'calendar': {
        outline: '24/outline/calendar.svg',
        solid: '24/solid/calendar.svg',
        mini: '20/solid/calendar.svg',
        micro: '16/solid/calendar.svg',
    },
    'check': {
        outline: '24/outline/check.svg',
        solid: '24/solid/check.svg',
        mini: '20/solid/check.svg',
        micro: '16/solid/check.svg',
    },
    'chevron-down': {
        outline: '24/outline/chevron-down.svg',
        solid: '24/solid/chevron-down.svg',
        mini: '20/solid/chevron-down.svg',
        micro: '16/solid/chevron-down.svg',
    },
    'chevron-left': {
        outline: '24/outline/chevron-left.svg',
        solid: '24/solid/chevron-left.svg',
        mini: '20/solid/chevron-left.svg',
        micro: '16/solid/chevron-left.svg',
    },
    'chevron-right': {
        outline: '24/outline/chevron-right.svg',
        solid: '24/solid/chevron-right.svg',
        mini: '20/solid/chevron-right.svg',
        micro: '16/solid/chevron-right.svg',
    },
    'chevron-up': {
        outline: '24/outline/chevron-up.svg',
        solid: '24/solid/chevron-up.svg',
        mini: '20/solid/chevron-up.svg',
        micro: '16/solid/chevron-up.svg',
    },
    'clock': {
        outline: '24/outline/clock.svg',
        solid: '24/solid/clock.svg',
        mini: '20/solid/clock.svg',
        micro: '16/solid/clock.svg',
    },
    'cog-6-tooth': {
        outline: '24/outline/cog-6-tooth.svg',
        solid: '24/solid/cog-6-tooth.svg',
        mini: '20/solid/cog-6-tooth.svg',
        micro: '16/solid/cog-6-tooth.svg',
    },
    'exclamation-triangle': {
        outline: '24/outline/exclamation-triangle.svg',
        solid: '24/solid/exclamation-triangle.svg',
        mini: '20/solid/exclamation-triangle.svg',
        micro: '16/solid/exclamation-triangle.svg',
    },
    'information-circle': {
        outline: '24/outline/information-circle.svg',
        solid: '24/solid/information-circle.svg',
        mini: '20/solid/information-circle.svg',
        micro: '16/solid/information-circle.svg',
    },
    'magnifying-glass': {
        outline: '24/outline/magnifying-glass.svg',
        solid: '24/solid/magnifying-glass.svg',
        mini: '20/solid/magnifying-glass.svg',
        micro: '16/solid/magnifying-glass.svg',
    },
    'minus': {
        outline: '24/outline/minus.svg',
        solid: '24/solid/minus.svg',
        mini: '20/solid/minus.svg',
        micro: '16/solid/minus.svg',
    },
    'pencil': {
        outline: '24/outline/pencil.svg',
        solid: '24/solid/pencil.svg',
        mini: '20/solid/pencil.svg',
        micro: '16/solid/pencil.svg',
    },
    'plus': {
        outline: '24/outline/plus.svg',
        solid: '24/solid/plus.svg',
        mini: '20/solid/plus.svg',
        micro: '16/solid/plus.svg',
    },
    'trash': {
        outline: '24/outline/trash.svg',
        solid: '24/solid/trash.svg',
        mini: '20/solid/trash.svg',
        micro: '16/solid/trash.svg',
    },
    'x-mark': {
        outline: '24/outline/x-mark.svg',
        solid: '24/solid/x-mark.svg',
        mini: '20/solid/x-mark.svg',
        micro: '16/solid/x-mark.svg',
    },
};

/**
 * Per-variant constants — loaded at run time from the hand-tracked
 * factory modules so the generator never drifts from the published
 * defaults.
 *
 * @typedef {{ viewBox: string, shellAttrs: Record<string,string>, pathAttrs: Record<string,string> }} VariantSpec
 * @type {Record<typeof VARIANTS[number], VariantSpec>}
 */
const VARIANT_SPEC = /** @type {any} */ ({});
for (const variant of VARIANTS) {
    const factoryUrl = new URL(`../src/${variant}/_variant.js`, import.meta.url).href;
    const mod = await import(factoryUrl);
    if (typeof mod.VIEWBOX !== 'string' || !mod.SVG_ATTRS || !mod.PATH_ATTRS) {
        throw new Error(`src/${variant}/_variant.js must export VIEWBOX, SVG_ATTRS, PATH_ATTRS`);
    }
    VARIANT_SPEC[variant] = {
        viewBox: mod.VIEWBOX,
        shellAttrs: mod.SVG_ATTRS,
        pathAttrs: mod.PATH_ATTRS,
    };
}

/** @returns {string} */
function heroiconsDir() {
    const manifestPath = require_.resolve('heroicons/package.json');
    return dirname(manifestPath);
}

/**
 * @param {string} svg
 * @returns {{ viewBox: string, paths: { d: string, raw: Record<string, string> }[] }}
 */
function parseSvg(svg) {
    const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
    if (!viewBoxMatch) throw new Error('missing viewBox');
    const paths = [];
    const pathRe = /<path\s+([^>]*?)\/?>(?:<\/path>)?/g;
    let match;
    while ((match = pathRe.exec(svg)) !== null) {
        const attrs = parseAttrs(match[1]);
        const d = attrs.d;
        if (!d) continue;
        paths.push({ d, raw: attrs });
    }
    if (paths.length === 0) throw new Error('no <path> elements found');
    return { viewBox: viewBoxMatch[1], paths };
}

/**
 * @param {string} chunk
 * @returns {Record<string, string>}
 */
function parseAttrs(chunk) {
    /** @type {Record<string, string>} */
    const out = {};
    const re = /([\w:-]+)="([^"]*)"/g;
    let match;
    while ((match = re.exec(chunk)) !== null) out[match[1]] = match[2];
    return out;
}

/**
 * Two-key shallow equality.
 *
 * @param {Record<string,string>} a
 * @param {Record<string,string>} b
 */
function attrsEqual(a, b) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) if (a[k] !== b[k]) return false;
    return true;
}

/**
 * Emit a per-icon module. Paths whose attrs match the variant default
 * collapse to bare strings; otherwise they're expressed as objects
 * (the factory still merges variant defaults underneath).
 *
 * @param {string} name
 * @param {typeof VARIANTS[number]} variant
 * @param {{ d: string, attrs: Record<string, string> }[]} paths
 * @returns {string}
 */
function renderIconModule(name, variant, paths) {
    const defaults = VARIANT_SPEC[variant].pathAttrs;
    /** @param {{ d: string, attrs: Record<string,string> }} p */
    const renderPath = (p) => {
        if (attrsEqual(p.attrs, defaults)) {
            return JSON.stringify(p.d);
        }
        const entries = Object.entries(p.attrs)
            .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
            .join(', ');
        return `{ d: ${JSON.stringify(p.d)}, attrs: { ${entries} } }`;
    };
    const body = paths.length === 1
        ? `[${renderPath(paths[0])}]`
        : `[\n    ${paths.map(renderPath).join(',\n    ')},\n]`;
    return `// \`${name}\` (${variant}) — generated from heroicons. Do not edit by hand.
import { icon } from './_variant.js';
export default icon(${body});
`;
}

/**
 * Variant aggregate: re-export each icon under a camelCase named
 * export and also expose a `default` object map keyed by the original
 * kebab name.
 *
 * @param {string} variant
 * @param {string[]} names
 * @returns {string}
 */
function renderVariantIndex(variant, names) {
    const importLines = names.map((n) => `import ${toIdentifier(n)} from './${n}.js';`);
    const idents = names.map(toIdentifier);
    const mapEntries = names.map((n) => `    ${JSON.stringify(n)}: ${toIdentifier(n)},`);
    return `/**
 * \`@neon-kit/icons/${variant}\` — aggregate of all ${variant} icons.
 *
 * Each icon is exported under a camelCase named export, and the
 * \`default\` export is an object map keyed by the kebab-case icon
 * name (so consumers can do \`${variant}['bars-3']\`).
 *
 * Generated from \`scripts/build-icons.mjs\`. Do not edit by hand.
 */

${importLines.join('\n')}

export { ${idents.join(', ')} };

export default {
${mapEntries.join('\n')}
};
`;
}

/**
 * Turn a kebab-case icon name into a valid JS identifier.
 *
 * @param {string} name
 */
function toIdentifier(name) {
    return name.replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

/** @returns {string} */
function renderRootIndex() {
    return `/**
 * \`@neon-kit/icons\` — root aggregate. Re-exports each variant's
 * default object map under a named binding:
 *
 *     import { outline, solid, mini, micro } from '@neon-kit/icons';
 *     outline['bars-3'];   // IconDef
 *
 * Also re-exports the shared \`serialize\` helper from \`./serialize.js\`
 * and the shared \`IconPath\` / \`IconDef\` typedefs.
 *
 * Subpath imports remain the recommended path for tree-shaking.
 *
 * Generated from \`scripts/build-icons.mjs\`. Do not edit by hand.
 */

/**
 * @typedef {import('./types.js').IconPath} IconPath
 * @typedef {import('./types.js').IconDef} IconDef
 */

export { default as outline } from './outline/index.js';
export { default as solid } from './solid/index.js';
export { default as mini } from './mini/index.js';
export { default as micro } from './micro/index.js';
export { serialize } from './serialize.js';
`;
}

/**
 * @param {Record<string, unknown>} pkg
 * @param {string[]} names
 */
function updatePackageExports(pkg, names) {
    /** @type {Record<string, unknown>} */
    const exports_ = {};
    exports_['.'] = { types: './types/index.d.ts', default: './src/index.js' };
    for (const variant of VARIANTS) {
        exports_[`./${variant}`] = {
            types: './types/index.d.ts',
            default: `./src/${variant}/index.js`,
        };
        for (const name of [...names].sort()) {
            exports_[`./${variant}/${name}`] = {
                types: './types/index.d.ts',
                default: `./src/${variant}/${name}.js`,
            };
        }
    }
    exports_['./package.json'] = './package.json';
    pkg.exports = exports_;
}

/**
 * Remove prior generated icon files so a rerun is idempotent. Keeps
 * `serialize.js`, `types.js`, `index.js` (regenerated), and every
 * variant's hand-tracked `_variant.js` factory.
 */
async function cleanSrc() {
    for (const variant of VARIANTS) {
        const dir = resolve(SRC, variant);
        let entries;
        try {
            entries = await readdir(dir);
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (entry === '_variant.js') continue;
            await rm(resolve(dir, entry), { force: true });
        }
    }
    const keep = new Set(['serialize.js', 'types.js', 'index.js']);
    let entries;
    try {
        entries = await readdir(SRC);
    } catch {
        return;
    }
    for (const entry of entries) {
        if (!entry.endsWith('.js')) continue;
        if (keep.has(entry)) continue;
        await rm(resolve(SRC, entry), { force: true });
    }
}

async function main() {
    const heroDir = heroiconsDir();
    const names = Object.keys(MANIFEST).sort();

    await cleanSrc();
    for (const variant of VARIANTS) {
        await mkdir(resolve(SRC, variant), { recursive: true });
    }

    for (const variant of VARIANTS) {
        const spec = VARIANT_SPEC[variant];

        for (const name of names) {
            const rel = MANIFEST[name][variant];
            const src = resolve(heroDir, rel);
            const raw = await readFile(src, 'utf8');
            const parsed = parseSvg(raw);
            if (parsed.viewBox !== spec.viewBox) {
                throw new Error(`${variant}/${name}: expected viewBox "${spec.viewBox}", got "${parsed.viewBox}"`);
            }
            const keep = Object.keys(spec.pathAttrs);
            const slimPaths = parsed.paths.map((p) => {
                /** @type {Record<string, string>} */
                const attrs = {};
                for (const k of keep) if (p.raw[k] != null) attrs[k] = p.raw[k];
                return { d: p.d, attrs };
            });
            const module_ = renderIconModule(name, variant, slimPaths);
            await writeFile(resolve(SRC, variant, `${name}.js`), module_);
        }
        await writeFile(resolve(SRC, variant, 'index.js'), renderVariantIndex(variant, names));
    }

    await writeFile(resolve(SRC, 'index.js'), renderRootIndex());

    const pkgPath = resolve(PKG_ROOT, 'package.json');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    updatePackageExports(pkg, names);
    await writeFile(pkgPath, JSON.stringify(pkg, null, 4) + '\n');

    console.log(`generated ${names.length} icons × ${VARIANTS.length} variants = ${names.length * VARIANTS.length} icon modules`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
