import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileStyle } from '@neon-kit/style-build';
import { transform } from 'lightningcss';

/**
 * First-slice emitter: map every member of an expanded class export to its
 * public role. :is() aliases preserve class specificity and state/descendant
 * selectors without duplicating visual declarations.
 */
export async function buildVanilla(themeDirectory, outputDirectory, registrations = [
        ['control.module.css', { control: 'field', input: 'input', action: 'btn' }],
        ['card.module.css', { card: 'panel' }],
    ]) {
    const aliases = new Map();
    const owners = new Map();
    const graphs = [];
    for (const [file, exports] of registrations) {
        const modules = await compileStyle(resolve(themeDirectory, file), {
            read: (id) => readFile(id, 'utf8'),
            resolve: async (specifier, importer) => resolve(dirname(importer), specifier),
        });
        graphs.push(modules);
        for (const [exportName, publicName] of Object.entries(exports)) {
            const classString = modules.at(-1).exports[exportName];
            const owner = `${file}:${exportName}`;
            if (!classString || (owners.has(publicName) && owners.get(publicName) !== owner)) {
                throw new Error(`Invalid or conflicting public role ${publicName}`);
            }
            owners.set(publicName, owner);
            for (const generatedName of classString.split(' ')) {
                const names = aliases.get(generatedName) ?? new Set();
                names.add(publicName);
                aliases.set(generatedName, names);
            }
        }
    }
    function emit(modules, publicRoles) {
        return modules.map((module) => transform({
            filename: module.id,
            code: Buffer.from(module.css),
            visitor: {
                Selector(selector) {
                    return selector.map((part) => {
                        let mapped = part;
                        if (part.type === 'class' && aliases.has(part.name)) {
                            const names = [...aliases.get(part.name)].filter((name) => publicRoles.has(name));
                            mapped = names.length === 1 ? { type: 'class', name: names[0] } : {
                                type: 'pseudo-class', kind: 'is',
                                selectors: names.map((name) => [{ type: 'class', name }]),
                            };
                        }
                        return mapped;
                    });
                },
            },
        }).code.toString()).join('\n');
    }
    await mkdir(outputDirectory, { recursive: true });
    const all = [...new Map(graphs.flat().map((module) => [module.id, module])).values()];
    await writeFile(resolve(outputDirectory, 'index.css'), emit(all, new Set(owners.keys())));
    for (let index = 0; index < registrations.length; index++) {
        await writeFile(resolve(outputDirectory, registrations[index][0].replace('.module', '')), emit(graphs[index], new Set(Object.values(registrations[index][1]))));
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await buildVanilla(resolve(import.meta.dirname, '../theme'), resolve(import.meta.dirname, 'dist'));
}
