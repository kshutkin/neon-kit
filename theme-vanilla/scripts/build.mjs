import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { compileStyle, rewriteStyleUrls } from '@neon-kit/style-build';
import { transform } from 'lightningcss';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { catalogue } from './catalogue.mjs';

export const groups = {
    button: ['button'],
    forms: ['forms'],
    overlays: ['dialog', 'details', 'menu', 'tooltip'],
    navigation: ['nav'],
    labels: ['kbd', 'badge', 'tag'],
    pickers: ['combobox', 'datepicker', 'timepicker'],
    table: ['table'],
    links: ['links'],
};

const layers = '@layer neon.theme, neon.reset, neon.components;\n';
const absent = '__neon_unselected_role';

/** Build the public HTML selectors from the shared modules and their composition graph. */
export async function buildVanilla(
    themeDirectory,
    outputDirectory,
    registrations = catalogue,
    entryGroups = groups
) {
    const host = {
        read: (id) => readFile(id, 'utf8'),
        resolve: async (specifier, importer) =>
            resolve(dirname(importer), specifier),
    };
    const tokenModules = await compileStyle(
        resolve(themeDirectory, 'tokens.css'),
        host
    );
    const tokenDependencies = new Set(tokenModules.map((module) => module.id));
    const tokens = tokenModules.map((module) => module.css).join('\n');
    const aliases = new Map();
    const owners = new Map();
    const graphs = new Map();
    for (const [file, roles] of registrations) {
        const graph = await compileStyle(resolve(themeDirectory, file), host);
        graphs.set(file, graph);
        for (const [exportName, publicName] of Object.entries(roles)) {
            const classString = graph.at(-1).exports[exportName];
            if (!classString || !/^[a-zA-Z_-][\w-]*$/.test(publicName)) {
                throw new Error(
                    `Invalid public role ${file}:${exportName} -> ${publicName}`
                );
            }
            // A public role may be re-exported through composition by another
            // family. Independent owners of a non-modifier role are a conflict.
            const ownClass = classString.split(' ')[0];
            const previous = owners.get(publicName);
            if (
                previous &&
                !publicName.startsWith('-') &&
                !classString.split(' ').includes(previous) &&
                ![...(aliases.get(ownClass) ?? [])].includes(publicName)
            ) {
                throw new Error(`Conflicting public role ${publicName}`);
            }
            if (!previous) {
                owners.set(publicName, ownClass);
            }
            for (const generatedName of classString.split(' ')) {
                const names = aliases.get(generatedName) ?? new Set();
                names.add(publicName);
                aliases.set(generatedName, names);
            }
        }
    }
    const assets = new Map();
    for (const graph of graphs.values()) {
        for (const module of graph) {
            for (const url of module.assets) {
                if (!/^(?:[a-z]+:|\/|#)/i.test(url)) {
                    const [path] = url.split(/[?#]/);
                    const source = resolve(
                        dirname(module.id),
                        decodeURIComponent(path)
                    );
                    if (!assets.has(source)) {
                        const content = await readFile(source);
                        const hash = createHash('sha256')
                            .update(content)
                            .digest('hex')
                            .slice(0, 12);
                        assets.set(source, {
                            content,
                            name: `${hash}-${basename(source)}`,
                        });
                    }
                }
            }
        }
    }
    function emit(modules, roles, prefix = './') {
        const css = modules
            .map((module) => {
                const replacements = {};
                for (const url of module.assets) {
                    if (!/^(?:[a-z]+:|\/|#)/i.test(url)) {
                        const [path] = url.split(/[?#]/);
                        const asset = assets.get(
                            resolve(
                                dirname(module.id),
                                decodeURIComponent(path)
                            )
                        );
                        if (asset) {
                            replacements[url] = `${prefix}assets/${
                                asset.name
                            }${url.slice(path.length)}`;
                        }
                    }
                }
                return rewriteStyleUrls(module, replacements).css;
            })
            .join('\n');
        // Shared effects have local keyframes. Selective entries retain only
        // the animations referenced by the selected rules.
        const selectedRoot = postcss.parse(css);
        selectedRoot.walkRules((rule) => {
            const selectors = selectorParser().astSync(rule.selector);
            // Collect before replacing: aliases inserted into :is() are already
            // public. Walking the selector AST includes :has(), :not(), :is(),
            // and the selector list in :nth-child(... of ...).
            const classes = [];
            selectors.walkClasses((node) => classes.push(node));
            for (const node of classes) {
                if (!aliases.has(node.value)) {
                    throw new Error(`Unmapped class ${node.value}`);
                }
                const names = [...aliases.get(node.value)].filter((name) =>
                    roles.has(name)
                );
                if (names.length < 2) {
                    node.value = names[0] ?? absent;
                } else {
                    const alias = selectorParser.pseudo({ value: ':is' });
                    for (const name of names) {
                        const selector = selectorParser.selector();
                        selector.append(
                            selectorParser.className({ value: name })
                        );
                        alias.append(selector);
                    }
                    node.replaceWith(alias);
                }
            }
            selectors.each((selector) => {
                let unselected = false;
                selector.walkClasses((node) => {
                    unselected ||= node.value === absent;
                });
                if (unselected) {
                    selector.remove();
                }
            });
            if (selectors.nodes.length) {
                rule.selector = selectors.toString();
            } else {
                rule.remove();
            }
        });
        const selected = Buffer.from(selectedRoot.toString());
        const animations = new Set();
        transform({
            filename: 'selected.css',
            code: selected,
            visitor: {
                Declaration(declaration) {
                    if (
                        declaration.property === 'animation' ||
                        declaration.property === 'animation-name'
                    ) {
                        for (const animation of declaration.value) {
                            const name =
                                declaration.property === 'animation'
                                    ? animation.name
                                    : animation;
                            if (name.type !== 'none') {
                                animations.add(name.value);
                            }
                        }
                    }
                },
            },
        });
        return transform({
            filename: 'selected.css',
            code: selected,
            visitor: {
                Rule: {
                    keyframes(rule) {
                        return animations.has(rule.value.name.value)
                            ? undefined
                            : [];
                    },
                },
            },
        }).code.toString();
    }
    const modulesFor = (files) => [
        ...new Map(
            files
                .flatMap((file) => graphs.get(file))
                .filter((module) => !tokenDependencies.has(module.id))
                .map((module) => [module.id, module])
        ).values(),
    ];
    const rolesFor = (files) =>
        new Set(
            registrations
                .filter(([file]) => files.includes(file))
                .flatMap(([, roles]) => Object.values(roles))
        );
    const files = registrations.map(([file]) => file);
    const all = modulesFor(files);
    const components = emit(all, rolesFor(files));
    const theme = (
        await compileStyle(resolve(themeDirectory, 'theme.css'), host)
    )
        .filter((module) => !tokenDependencies.has(module.id))
        .map((module) => module.css)
        .join('\n');
    const reset = await readFile(
        resolve(themeDirectory, 'reset-normalize.css'),
        'utf8'
    );
    await rm(outputDirectory, { recursive: true, force: true });
    await mkdir(resolve(outputDirectory, 'components'), { recursive: true });
    if (assets.size) {
        await mkdir(resolve(outputDirectory, 'assets'));
        for (const asset of assets.values()) {
            await writeFile(
                resolve(outputDirectory, 'assets', asset.name),
                asset.content
            );
        }
    }
    await writeFile(
        resolve(outputDirectory, 'tokens.css'),
        `${layers}@layer neon.theme {\n${tokens}\n}\n`
    );
    await writeFile(
        resolve(outputDirectory, 'theme.css'),
        `${layers}@layer neon.theme {\n${theme}\n}\n`
    );
    await writeFile(
        resolve(outputDirectory, 'reset-normalize.css'),
        `${layers}@layer neon.reset {\n${reset}\n}\n`
    );
    await writeFile(
        resolve(outputDirectory, 'components.css'),
        `${layers}@layer neon.components {\n${components}\n}\n`
    );
    await writeFile(
        resolve(outputDirectory, 'index.css'),
        `${layers}@layer neon.theme {\n${tokens}\n${theme}\n}\n@layer neon.reset {\n${reset}\n}\n@layer neon.components {\n${components}\n}\n`
    );
    if (graphs.has('shared.module.css')) {
        await writeFile(
            resolve(outputDirectory, 'effects.css'),
            `${layers}@layer neon.components {\n${emit(
                modulesFor(['shared.module.css']),
                rolesFor(['shared.module.css'])
            )}\n}\n`
        );
    }
    for (const [name, families] of Object.entries(entryGroups)) {
        const entries = families.map(
            (family) => `components/${family}.module.css`
        );
        await writeFile(
            resolve(outputDirectory, 'components', `${name}.css`),
            `${layers}@layer neon.components {\n${emit(
                modulesFor(entries),
                rolesFor(entries),
                '../'
            )}\n}\n`
        );
    }
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    const themeDirectory = dirname(
        fileURLToPath(import.meta.resolve('@neon-kit/theme/package.json'))
    );
    await buildVanilla(themeDirectory, resolve(import.meta.dirname, '../dist'));
}
