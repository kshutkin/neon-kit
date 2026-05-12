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

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'node_modules', 'heroicons');

const VARIANTS = [
    { name: 'outline', dir: join(root, '24', 'outline') },
    { name: 'solid', dir: join(root, '24', 'solid') },
    { name: 'mini', dir: join(root, '20', 'solid') },
    { name: 'micro', dir: join(root, '16', 'solid') },
];

// Naive regex parsing is fine for heroicons — they're hand-written SVGs
// with a stable structure (one outer <svg>, flat <path> children, no
// nesting, no <g>).
const svgOpenRe = /<svg\b([^>]*)>/i;
const pathRe = /<path\b([^/>]*)\/?>/gi;
const attrRe = /([:\w-]+)\s*=\s*"([^"]*)"/g;

function parseAttrs(chunk) {
    const out = {};
    let m;
    attrRe.lastIndex = 0;
    while ((m = attrRe.exec(chunk)) !== null) {
        out[m[1]] = m[2];
    }
    return out;
}

function listSvgFiles(dir) {
    return readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
}

const report = {
    overall: {
        maxPaths: { count: 0, where: [] },
        viewBoxOddities: [],
        totalIcons: 0,
    },
    perVariant: {},
};

for (const v of VARIANTS) {
    const files = listSvgFiles(v.dir);
    const variantReport = {
        iconCount: files.length,
        maxPaths: { count: 0, where: [] },
        pathCountHistogram: new Map(),
        svgAttrs: new Map(), // attr -> Set of distinct values
        pathAttrs: new Map(),
        viewBoxOddities: [],
    };

    for (const file of files) {
        const raw = readFileSync(join(v.dir, file), 'utf8');
        const svgMatch = raw.match(svgOpenRe);
        if (!svgMatch) {
            console.warn(`!! ${v.name}/${file}: no <svg> tag matched`);
            continue;
        }
        const svgAttrs = parseAttrs(svgMatch[1]);
        for (const [k, val] of Object.entries(svgAttrs)) {
            if (!variantReport.svgAttrs.has(k)) variantReport.svgAttrs.set(k, new Set());
            variantReport.svgAttrs.get(k).add(val);
        }

        const vb = svgAttrs.viewBox ?? '';
        if (!vb.startsWith('0 0 ')) {
            const entry = `${v.name}/${file}: ${vb}`;
            variantReport.viewBoxOddities.push(entry);
            report.overall.viewBoxOddities.push(entry);
        }

        let pathCount = 0;
        let pm;
        pathRe.lastIndex = 0;
        while ((pm = pathRe.exec(raw)) !== null) {
            pathCount += 1;
            const pAttrs = parseAttrs(pm[1]);
            for (const [k, val] of Object.entries(pAttrs)) {
                if (!variantReport.pathAttrs.has(k)) variantReport.pathAttrs.set(k, new Set());
                variantReport.pathAttrs.get(k).add(val);
            }
        }

        variantReport.pathCountHistogram.set(
            pathCount,
            (variantReport.pathCountHistogram.get(pathCount) ?? 0) + 1,
        );

        if (pathCount > variantReport.maxPaths.count) {
            variantReport.maxPaths = { count: pathCount, where: [`${v.name}/${file}`] };
        } else if (pathCount === variantReport.maxPaths.count) {
            variantReport.maxPaths.where.push(`${v.name}/${file}`);
        }
        if (pathCount > report.overall.maxPaths.count) {
            report.overall.maxPaths = { count: pathCount, where: [`${v.name}/${file}`] };
        } else if (pathCount === report.overall.maxPaths.count) {
            report.overall.maxPaths.where.push(`${v.name}/${file}`);
        }
    }

    report.perVariant[v.name] = variantReport;
    report.overall.totalIcons += variantReport.iconCount;
}

// ----- pretty-print ----------------------------------------------------------

function fmtSet(set, max = 8) {
    const arr = [...set];
    if (arr.length <= max) return arr.map((v) => JSON.stringify(v)).join(', ');
    return arr.slice(0, max).map((v) => JSON.stringify(v)).join(', ') + ` … (+${arr.length - max} more)`;
}

console.log('=== heroicons audit ===');
console.log(`total icons across variants: ${report.overall.totalIcons}`);
console.log();

console.log('--- 1. max <path> count per icon ---');
for (const v of VARIANTS) {
    const r = report.perVariant[v.name];
    const hist = [...r.pathCountHistogram.entries()].sort(([a], [b]) => a - b);
    console.log(
        `  ${v.name.padEnd(8)} icons=${String(r.iconCount).padEnd(3)} max=${r.maxPaths.count} (${r.maxPaths.where.length} icon${r.maxPaths.where.length === 1 ? '' : 's'})`,
    );
    console.log(`    histogram (paths -> #icons): ${hist.map(([k, n]) => `${k}:${n}`).join('  ')}`);
    if (r.maxPaths.where.length <= 5) {
        for (const w of r.maxPaths.where) console.log(`    -> ${w}`);
    } else {
        for (const w of r.maxPaths.where.slice(0, 5)) console.log(`    -> ${w}`);
        console.log(`    -> (+${r.maxPaths.where.length - 5} more)`);
    }
}
console.log(`  OVERALL max=${report.overall.maxPaths.count} (${report.overall.maxPaths.where.length} files)`);
console.log();

console.log('--- 2. distinct attrs ---');
for (const v of VARIANTS) {
    const r = report.perVariant[v.name];
    console.log(`  [${v.name}] <svg> attrs:`);
    for (const [k, vs] of [...r.svgAttrs.entries()].sort()) {
        console.log(`    ${k}: ${fmtSet(vs)}`);
    }
    console.log(`  [${v.name}] <path> attrs:`);
    for (const [k, vs] of [...r.pathAttrs.entries()].sort()) {
        const sample = k === 'd' ? `<${vs.size} distinct path-data strings>` : fmtSet(vs);
        console.log(`    ${k}: ${sample}`);
    }
}
console.log();

console.log('--- 3. viewBox starts with "0 0"? ---');
if (report.overall.viewBoxOddities.length === 0) {
    console.log('  YES — every icon\'s viewBox starts with "0 0".');
} else {
    console.log(`  NO — ${report.overall.viewBoxOddities.length} outlier(s):`);
    for (const o of report.overall.viewBoxOddities) console.log(`    ${o}`);
}
