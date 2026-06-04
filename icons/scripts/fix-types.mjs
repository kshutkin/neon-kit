#!/usr/bin/env node
/**
 * Post-process `types/index.d.ts` to repair dts-buddy's emission of
 * default exports for the icon modules.
 *
 * dts-buddy emits invalid output for an unannotated default-exported
 * const that happens to be typed against an imported type:
 *
 *     export default IconDef;        // wrong: IconDef is a type alias
 *
 * We rewrite each such occurrence into a value binding:
 *
 *     const _default: IconDef;
 *     export default _default;
 *
 * This is a workaround for an upstream limitation, not a feature.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const typesPath = resolve(scriptDir, '..', 'types', 'index.d.ts');

const typeDeclarations = await readFile(typesPath, 'utf8');

let fixed = 0;
let rewrittenDeclarations = typeDeclarations.replace(/^(\s*)export default IconDef;/gm, (_match, indent) => {
    fixed += 1;
    return `${indent}const _default: IconDef;\n${indent}export default _default;`;
});

// Variant aggregate modules (`@neon-kit/icons/<variant>`) emit
//     export default { "name": IconDef; … };
// which is invalid: an object-literal type is not a value. Rewrite as
//     const _default: { "name": IconDef; … };
//     export default _default;
let aggregated = 0;
rewrittenDeclarations = rewrittenDeclarations.replace(/^(\s*)export default (\{[\s\S]*?^\1\});/gm, (_match, indent, block) => {
    aggregated += 1;
    return `${indent}const _default: ${block};\n${indent}export default _default;`;
});

if (fixed === 0 && aggregated === 0) {
    console.log('fix-types: nothing to fix');
} else {
    await writeFile(typesPath, rewrittenDeclarations);
    console.log(`fix-types: rewrote ${fixed} default export(s) and ${aggregated} aggregate(s)`);
}
