#!/usr/bin/env node
/**
 * Build icon modules for `@neon-kit/icons` from heroicons sources.
 *
 * For every heroicon present in all published variants, emits one
 * module per variant:
 *
 *     src/<variant>/<name>.js         — two-line module: import + factory call
 *     src/<variant>/index.js          — named re-exports for the variant
 *     src/index.js                    — root aggregate (4 namespaces + serialize)
 *
 * Variants: `outline`, `solid`, `mini`, `micro`. Each variant's
 * defaults live in the hand-tracked `src/<variant>/_variant.js`
 * factory, and the generator samples the exported helper so emitted
 * modules stay in sync with whatever the factory currently declares.
 *
 * Re-runnable: deletes prior outputs deterministically before
 * re-emitting, so running twice produces a clean diff.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(scriptDir, '..');
const SOURCE_DIR = resolve(PACKAGE_ROOT, 'src');
const require_ = createRequire(import.meta.url);

const VARIANTS = /** @type {const} */ (['outline', 'solid', 'mini', 'micro']);

/**
 * Heroicons source directory per published variant.
 */
const VARIANT_SOURCES = {
    outline: '24/outline',
    solid: '24/solid',
    mini: '20/solid',
    micro: '16/solid',
};

/**
 * Per-variant constants — derived at run time from the hand-tracked
 * factory helpers so the generator never drifts from the published
 * defaults.
 *
 * @typedef {{ viewBox: string, shellAttrs: Record<string,string>, pathAttrs: Record<string,string> }} VariantSpec
 * @type {Record<typeof VARIANTS[number], VariantSpec>}
 */
const VARIANT_SPEC = /** @type {any} */ ({});
for (const variant of VARIANTS) {
    const factoryUrl = new URL(`../src/${variant}/_variant.js`, import.meta.url).href;
    const variantModule = await import(factoryUrl);
    if (typeof variantModule.icon !== 'function') {
        throw new Error(`src/${variant}/_variant.js must export icon`);
    }
    const [width, height, shellAttrs, pathAttrs] = variantModule.icon('');
    VARIANT_SPEC[variant] = {
        viewBox: `0 0 ${width} ${height}`,
        shellAttrs,
        pathAttrs,
    };
}

/** @returns {string} */
function heroiconsDir() {
    const manifestPath = require_.resolve('heroicons/package.json');
    return dirname(manifestPath);
}

/**
 * @param {string} heroDir
 * @param {typeof VARIANTS[number]} variant
 * @returns {Promise<string[]>}
 */
async function listVariantNames(heroDir, variant) {
    const variantDir = resolve(heroDir, VARIANT_SOURCES[variant]);
    const entries = await readdir(variantDir);
    return entries
        .filter((entry) => entry.endsWith('.svg'))
        .map((entry) => entry.slice(0, -'.svg'.length))
        .sort();
}

/**
 * @param {string} heroDir
 * @returns {Promise<{
 *   namesByVariant: Record<typeof VARIANTS[number], string[]>,
 *   manifest: Record<typeof VARIANTS[number], Record<string, string>>,
 * }>}
 */
async function buildManifest(heroDir) {
    /** @type {Record<typeof VARIANTS[number], string[]>} */
    const namesByVariant = /** @type {any} */ ({});
    /** @type {Record<typeof VARIANTS[number], Record<string, string>>} */
    const manifest = /** @type {any} */ ({});
    for (const variant of VARIANTS) {
        namesByVariant[variant] = await listVariantNames(heroDir, variant);
        manifest[variant] = {};
        for (const name of namesByVariant[variant]) {
            manifest[variant][name] = `${VARIANT_SOURCES[variant]}/${name}.svg`;
        }
    }

    return { namesByVariant, manifest };
}

/**
 * @param {string} svgText
 * @returns {{ viewBox: string, paths: { d: string, sourceAttrs: Record<string, string> }[] }}
 */
function parseSvg(svgText) {
    const viewBoxMatch = svgText.match(/viewBox="([^"]+)"/);
    if (!viewBoxMatch) {
        throw new Error('missing viewBox');
    }
    const paths = [];
    const pathRe = /<path\s+([^>]*?)\/?>(?:<\/path>)?/g;
    const rectRe = /<rect\s+([^>]*?)\/?>(?:<\/rect>)?/g;
    let match;
    while ((match = pathRe.exec(svgText)) !== null) {
        const attrs = parseAttrs(match[1]);
        const pathData = attrs.d;
        if (!pathData) {
            continue;
        }
        paths.push({ d: pathData, sourceAttrs: attrs });
    }
    while ((match = rectRe.exec(svgText)) !== null) {
        const attrs = parseAttrs(match[1]);
        paths.push({ d: rectToPath(attrs), sourceAttrs: attrs });
    }
    if (paths.length === 0) {
        throw new Error('no <path> elements found');
    }
    return { viewBox: viewBoxMatch[1], paths };
}

/**
 * @param {string} chunk
 * @returns {Record<string, string>}
 */
function parseAttrs(chunk) {
    /** @type {Record<string, string>} */
    const attrs = {};
    const attrRe = /([\w:-]+)="([^"]*)"/g;
    let match;
    while ((match = attrRe.exec(chunk)) !== null) {
        attrs[match[1]] = match[2];
    }
    return attrs;
}

/**
 * Convert simple heroicons `<rect>` elements to path data so runtime
 * serialization can keep emitting a compact path-only `IconDef`.
 *
 * @param {Record<string, string>} attrs
 * @returns {string}
 */
function rectToPath(attrs) {
    const x = Number(attrs.x ?? 0);
    const y = Number(attrs.y ?? 0);
    const width = Number(attrs.width);
    const height = Number(attrs.height);
    const rx = Number(attrs.rx ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(rx)) {
        throw new Error('unsupported <rect> attributes');
    }

    let pathData;
    if (rx === 0) {
        pathData = `M${x} ${y}h${width}v${height}H${x}V${y}Z`;
    } else {
        const right = x + width;
        const bottom = y + height;
        pathData = `M${x + rx} ${y}H${right - rx}A${rx} ${rx} 0 0 1 ${right} ${y + rx}V${bottom - rx}A${rx} ${rx} 0 0 1 ${right - rx} ${bottom}H${x + rx}A${rx} ${rx} 0 0 1 ${x} ${bottom - rx}V${y + rx}A${rx} ${rx} 0 0 1 ${x + rx} ${y}Z`;
    }

    return pathData;
}

/**
 * Emit a per-icon module. Variant factories own all shell and path
 * attrs, so generated modules only carry path data.
 *
 * @param {string} name
 * @param {typeof VARIANTS[number]} variant
 * @param {string[]} pathData
 * @returns {string}
 */
function renderIconModule(name, variant, pathData) {
    const body = renderPathArguments(pathData);
    return `// \`${name}\` (${variant}) — generated from heroicons. Do not edit by hand.
import { icon } from './_variant.js';
export default icon(${body});
`;
}

/**
 * @param {string[]} pathData
 * @returns {string}
 */
function renderPathArguments(pathData) {
    const body = pathData.length === 1
        ? JSON.stringify(pathData[0])
        : `\n    ${pathData.map((pathDataValue) => JSON.stringify(pathDataValue)).join(',\n    ')},\n`;
    return body;
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
    const importLines = names.map((iconName) => `import ${toIdentifier(iconName)} from './${iconName}.js';`);
    const identifiers = names.map(toIdentifier);
    const mapEntries = names.map((iconName) => `    ${JSON.stringify(iconName)}: ${toIdentifier(iconName)},`);
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

export { ${identifiers.join(', ')} };

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
    return name.replace(/-([a-z0-9])/g, (_match, character) => character.toUpperCase());
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
 * and the shared \`IconDef\` typedef.
 *
 * Subpath imports remain the recommended path for tree-shaking.
 *
 * Generated from \`scripts/build-icons.mjs\`. Do not edit by hand.
 */

/**
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
 * @param {Record<string, unknown>} packageJson
 * @param {Record<typeof VARIANTS[number], string[]>} namesByVariant
 */
function updatePackageExports(packageJson, namesByVariant) {
    /** @type {Record<string, unknown>} */
    const packageExports = {};
    packageExports['.'] = { types: './types/index.d.ts', default: './src/index.js' };
    for (const variant of VARIANTS) {
        packageExports[`./${variant}`] = {
            types: './types/index.d.ts',
            default: `./src/${variant}/index.js`,
        };
        for (const name of namesByVariant[variant]) {
            packageExports[`./${variant}/${name}`] = {
                types: './types/index.d.ts',
                default: `./src/${variant}/${name}.js`,
            };
        }
    }
    packageExports['./package.json'] = './package.json';
    packageJson.exports = packageExports;
}

/**
 * Remove prior generated icon files so a rerun is idempotent. Keeps
 * `serialize.js`, `types.js`, `index.js` (regenerated), and every
 * variant's hand-tracked `_variant.js` factory.
 */
async function cleanSrc() {
    for (const variant of VARIANTS) {
        const dir = resolve(SOURCE_DIR, variant);
        let entries;
        try {
            entries = await readdir(dir);
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (entry === '_variant.js') {
                continue;
            }
            await rm(resolve(dir, entry), { force: true });
        }
    }
    const keptFiles = new Set(['serialize.js', 'types.js', 'index.js']);
    let entries;
    try {
        entries = await readdir(SOURCE_DIR);
    } catch {
        return;
    }
    for (const entry of entries) {
        if (!entry.endsWith('.js')) {
            continue;
        }
        if (keptFiles.has(entry)) {
            continue;
        }
        await rm(resolve(SOURCE_DIR, entry), { force: true });
    }
}

async function main() {
    const heroDir = heroiconsDir();
    const { namesByVariant, manifest } = await buildManifest(heroDir);

    await cleanSrc();
    for (const variant of VARIANTS) {
        await mkdir(resolve(SOURCE_DIR, variant), { recursive: true });
    }

    for (const variant of VARIANTS) {
        const spec = VARIANT_SPEC[variant];
        const names = namesByVariant[variant];

        for (const name of names) {
            const relativeHeroiconsPath = manifest[variant][name];
            const svgPath = resolve(heroDir, relativeHeroiconsPath);
            const svgText = await readFile(svgPath, 'utf8');
            const parsed = parseSvg(svgText);
            if (parsed.viewBox !== spec.viewBox) {
                throw new Error(`${variant}/${name}: expected viewBox "${spec.viewBox}", got "${parsed.viewBox}"`);
            }
            for (const parsedPath of parsed.paths) {
                for (const [attrName, attrValue] of Object.entries(spec.pathAttrs)) {
                    const sourceAttrValue = parsedPath.sourceAttrs[attrName];
                    if (sourceAttrValue != null && sourceAttrValue !== attrValue) {
                        throw new Error(`${variant}/${name}: expected ${attrName}="${attrValue}", got "${sourceAttrValue}"`);
                    }
                }
            }
            const pathData = parsed.paths.map((parsedPath) => parsedPath.d);
            const module_ = renderIconModule(name, variant, pathData);
            await writeFile(resolve(SOURCE_DIR, variant, `${name}.js`), module_);
        }
        await writeFile(resolve(SOURCE_DIR, variant, 'index.js'), renderVariantIndex(variant, names));
    }

    await writeFile(resolve(SOURCE_DIR, 'index.js'), renderRootIndex());

    const packageJsonPath = resolve(PACKAGE_ROOT, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    updatePackageExports(packageJson, namesByVariant);
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 4) + '\n');

    const moduleCount = VARIANTS.reduce((total, variant) => total + namesByVariant[variant].length, 0);
    const variantSummary = VARIANTS
        .map((variant) => `${variant}=${namesByVariant[variant].length}`)
        .join(', ');
    console.log(`generated ${moduleCount} icon modules (${variantSummary})`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
