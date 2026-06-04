#!/usr/bin/env node
// Audit the full heroicons library installed under
// `icons/node_modules/heroicons` and report:
//   1. The maximum <path> count per icon (per variant + overall).
//   2. The distinct attribute names seen on <svg> and <path> elements
//      (per variant), with the set of distinct values.
//   3. Whether every viewBox starts with "0 0", listing any outliers.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const heroiconsRoot = join(scriptDir, '..', 'node_modules', 'heroicons');

const VARIANTS = [
    { name: 'outline', dir: join(heroiconsRoot, '24', 'outline') },
    { name: 'solid', dir: join(heroiconsRoot, '24', 'solid') },
    { name: 'mini', dir: join(heroiconsRoot, '20', 'solid') },
    { name: 'micro', dir: join(heroiconsRoot, '16', 'solid') },
];

// Naive regex parsing is fine for heroicons — they're hand-written SVGs
// with a stable structure (one outer <svg>, flat <path> children, no
// nesting, no <g>).
const svgOpenRe = /<svg\b([^>]*)>/i;
const pathRe = /<path\b([^/>]*)\/?>/gi;
const attrRe = /([:\w-]+)\s*=\s*"([^"]*)"/g;

function parseAttrs(chunk) {
    const attrs = {};
    let attrMatch;
    attrRe.lastIndex = 0;
    while ((attrMatch = attrRe.exec(chunk)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2];
    }
    return attrs;
}

function listSvgFiles(dir) {
    return readdirSync(dir).filter((fileName) => fileName.endsWith('.svg')).sort();
}

const report = {
    overall: {
        maxPaths: { count: 0, where: [] },
        viewBoxOddities: [],
        totalIcons: 0,
    },
    perVariant: {},
};

for (const variant of VARIANTS) {
    const files = listSvgFiles(variant.dir);
    const variantReport = {
        iconCount: files.length,
        maxPaths: { count: 0, where: [] },
        pathCountHistogram: new Map(),
        svgAttrs: new Map(), // attr -> Set of distinct values
        pathAttrs: new Map(),
        viewBoxOddities: [],
    };

    for (const file of files) {
        const svgText = readFileSync(join(variant.dir, file), 'utf8');
        const svgMatch = svgText.match(svgOpenRe);
        if (!svgMatch) {
            console.warn(`!! ${variant.name}/${file}: no <svg> tag matched`);
            continue;
        }
        const svgAttrs = parseAttrs(svgMatch[1]);
        for (const [attrName, attrValue] of Object.entries(svgAttrs)) {
            if (!variantReport.svgAttrs.has(attrName)) {
                variantReport.svgAttrs.set(attrName, new Set());
            }
            variantReport.svgAttrs.get(attrName).add(attrValue);
        }

        const viewBox = svgAttrs.viewBox ?? '';
        if (!viewBox.startsWith('0 0 ')) {
            const entry = `${variant.name}/${file}: ${viewBox}`;
            variantReport.viewBoxOddities.push(entry);
            report.overall.viewBoxOddities.push(entry);
        }

        let pathCount = 0;
        let pathMatch;
        pathRe.lastIndex = 0;
        while ((pathMatch = pathRe.exec(svgText)) !== null) {
            pathCount += 1;
            const pathAttrs = parseAttrs(pathMatch[1]);
            for (const [attrName, attrValue] of Object.entries(pathAttrs)) {
                if (!variantReport.pathAttrs.has(attrName)) {
                    variantReport.pathAttrs.set(attrName, new Set());
                }
                variantReport.pathAttrs.get(attrName).add(attrValue);
            }
        }

        variantReport.pathCountHistogram.set(
            pathCount,
            (variantReport.pathCountHistogram.get(pathCount) ?? 0) + 1,
        );

        if (pathCount > variantReport.maxPaths.count) {
            variantReport.maxPaths = { count: pathCount, where: [`${variant.name}/${file}`] };
        } else if (pathCount === variantReport.maxPaths.count) {
            variantReport.maxPaths.where.push(`${variant.name}/${file}`);
        }
        if (pathCount > report.overall.maxPaths.count) {
            report.overall.maxPaths = { count: pathCount, where: [`${variant.name}/${file}`] };
        } else if (pathCount === report.overall.maxPaths.count) {
            report.overall.maxPaths.where.push(`${variant.name}/${file}`);
        }
    }

    report.perVariant[variant.name] = variantReport;
    report.overall.totalIcons += variantReport.iconCount;
}

// ----- pretty-print ----------------------------------------------------------

function formatSet(set, max = 8) {
    const values = [...set];
    let formattedSet;

    if (values.length <= max) {
        formattedSet = values.map((value) => JSON.stringify(value)).join(', ');
    } else {
        formattedSet = values.slice(0, max).map((value) => JSON.stringify(value)).join(', ') + ` … (+${values.length - max} more)`;
    }

    return formattedSet;
}

console.log('=== heroicons audit ===');
console.log(`total icons across variants: ${report.overall.totalIcons}`);
console.log();

console.log('--- 1. max <path> count per icon ---');
for (const variant of VARIANTS) {
    const variantReport = report.perVariant[variant.name];
    const pathCountHistogram = [...variantReport.pathCountHistogram.entries()].sort(([leftCount], [rightCount]) => leftCount - rightCount);
    console.log(
        `  ${variant.name.padEnd(8)} icons=${String(variantReport.iconCount).padEnd(3)} max=${variantReport.maxPaths.count} (${variantReport.maxPaths.where.length} icon${variantReport.maxPaths.where.length === 1 ? '' : 's'})`,
    );
    console.log(`    histogram (paths -> #icons): ${pathCountHistogram.map(([pathCount, iconCount]) => `${pathCount}:${iconCount}`).join('  ')}`);
    if (variantReport.maxPaths.where.length <= 5) {
        for (const iconPath of variantReport.maxPaths.where) {
            console.log(`    -> ${iconPath}`);
        }
    } else {
        for (const iconPath of variantReport.maxPaths.where.slice(0, 5)) {
            console.log(`    -> ${iconPath}`);
        }
        console.log(`    -> (+${variantReport.maxPaths.where.length - 5} more)`);
    }
}
console.log(`  OVERALL max=${report.overall.maxPaths.count} (${report.overall.maxPaths.where.length} files)`);
console.log();

console.log('--- 2. distinct attrs ---');
for (const variant of VARIANTS) {
    const variantReport = report.perVariant[variant.name];
    console.log(`  [${variant.name}] <svg> attrs:`);
    for (const [attrName, attrValues] of [...variantReport.svgAttrs.entries()].sort()) {
        console.log(`    ${attrName}: ${formatSet(attrValues)}`);
    }
    console.log(`  [${variant.name}] <path> attrs:`);
    for (const [attrName, attrValues] of [...variantReport.pathAttrs.entries()].sort()) {
        const sample = attrName === 'd' ? `<${attrValues.size} distinct path-data strings>` : formatSet(attrValues);
        console.log(`    ${attrName}: ${sample}`);
    }
}
console.log();

console.log('--- 3. viewBox starts with "0 0"? ---');
if (report.overall.viewBoxOddities.length === 0) {
    console.log('  YES — every icon\'s viewBox starts with "0 0".');
} else {
    console.log(`  NO — ${report.overall.viewBoxOddities.length} outlier(s):`);
    for (const oddity of report.overall.viewBoxOddities) {
        console.log(`    ${oddity}`);
    }
}
