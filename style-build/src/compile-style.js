import { transform } from 'lightningcss';

/**
 * @typedef {{ id: string, kind: 'import' | 'compose' }} StyleDependency
 * @typedef {{ id: string, css: string, exports: Record<string, string>, dependencies: StyleDependency[], assets: string[] }} CompiledStyleModule
 * @typedef {{ read(id: string): Promise<string>, resolve(specifier: string, importer: string): Promise<string> }} StyleHost
 * @typedef {{ id: string, css: string, sourceExports: import('lightningcss').CSSModuleExports, classNames: Set<string>, dependencies: StyleDependency[], compositionTargets: Map<string, string>, assets: string[] }} SourceModule
 */

/** @param {unknown} selectorPart @param {Set<string>} classNames */
function collectClassNames(selectorPart, classNames) {
    if (Array.isArray(selectorPart)) {
        for (const part of selectorPart) {
            collectClassNames(part, classNames);
        }
    } else if (selectorPart !== null && typeof selectorPart === 'object') {
        if ('type' in selectorPart && selectorPart.type === 'class' &&
            'name' in selectorPart && typeof selectorPart.name === 'string') {
            classNames.add(selectorPart.name);
        } else {
            for (const value of Object.values(selectorPart)) {
                collectClassNames(value, classNames);
            }
        }
    }
}

/**
 * Compile every sheet reachable from an entry, with dependencies before their
 * importers. The host owns source identity and resolution; this function never
 * reads the filesystem or emits assets.
 *
 * @param {string} entryId
 * @param {StyleHost} host
 * @returns {Promise<CompiledStyleModule[]>}
 */
export async function compileStyle(entryId, host) {
    /** @type {Map<string, SourceModule>} */
    const modules = new Map();
    /** @type {Set<string>} */
    const visiting = new Set();
    /** @type {string[]} */
    const orderedIds = [];

    /** @param {string} id */
    async function visit(id) {
        if (visiting.has(id)) {
            throw new Error(`CSS dependency cycle: ${[...visiting, id].join(' -> ')}`);
        }
        if (modules.has(id)) {
            return;
        }

        visiting.add(id);
        const source = await host.read(id);
        /** @type {string[]} */
        const sourceImports = [];
        /** @type {Set<string>} */
        const classNames = new Set();
        const result = transform({
            filename: id,
            code: Buffer.from(source),
            cssModules: id.endsWith('.module.css') ? { dashedIdents: false } : false,
            analyzeDependencies: true,
            visitor: {
                Rule: {
                    import(rule) {
                        const { url, layer, supports, media } = rule.value;
                        if (!/^\.\.?\//.test(url) || layer !== null || supports !== null || media.mediaQueries.length > 0) {
                            throw new Error(`${id}: unsupported @import ${url}; only local, unconditional imports are supported`);
                        }
                        sourceImports.push(url);
                    },
                    style(rule) {
                        collectClassNames(rule.value.selectors, classNames);
                    },
                },
            },
        });

        /** @type {StyleDependency[]} */
        const dependencies = [];
        /** @type {Map<string, string>} */
        const compositionTargets = new Map();
        /** @type {string[]} */
        const assets = [];
        let css = result.code.toString();
        const importDependencies = (result.dependencies ?? []).filter((dependency) => dependency.type === 'import');
        if (sourceImports.length !== importDependencies.length) {
            throw new Error(`${id}: could not account for every @import`);
        }
        for (const dependency of result.dependencies ?? []) {
            if (dependency.type === 'import') {
                const resolvedId = await host.resolve(dependency.url, id);
                dependencies.push({ id: resolvedId, kind: 'import' });
            } else if (dependency.type === 'url') {
                assets.push(dependency.url);
                css = css.replace(dependency.placeholder, dependency.url);
            }
        }
        for (const styleExport of Object.values(result.exports ?? {})) {
            for (const reference of styleExport.composes) {
                if (reference.type === 'dependency') {
                    const resolvedId = await host.resolve(reference.specifier, id);
                    dependencies.push({ id: resolvedId, kind: 'compose' });
                    compositionTargets.set(reference.specifier, resolvedId);
                }
            }
        }

        dependencies.sort((first, second) => first.id.localeCompare(second.id) || first.kind.localeCompare(second.kind));
        const uniqueDependencies = dependencies.filter((dependency, index) =>
            index === 0 || dependency.id !== dependencies[index - 1].id || dependency.kind !== dependencies[index - 1].kind);
        const module = { id, css, sourceExports: result.exports ?? {}, classNames, dependencies: uniqueDependencies, compositionTargets, assets };
        modules.set(id, module);
        for (const dependency of uniqueDependencies) {
            await visit(dependency.id);
        }
        visiting.delete(id);
        orderedIds.push(id);
    }

    await visit(entryId);

    /** @type {Set<string>} */
    const expanding = new Set();
    /** @type {Map<string, string>} */
    const expanded = new Map();
    /** @param {string} id @param {string} name */
    function expand(id, name) {
        const key = `${id}\0${name}`;
        if (expanding.has(key)) {
            throw new Error(`CSS composition cycle at ${id}: ${name}`);
        }
        const cached = expanded.get(key);
        if (cached !== undefined) {
            return cached;
        }
        const module = modules.get(id);
        if (module === undefined) {
            throw new Error(`Missing compiled CSS module ${id}`);
        }
        const styleExport = module.sourceExports[name];
        if (styleExport === undefined) {
            throw new Error(`${id}: missing composed export ${name}`);
        }
        expanding.add(key);
        const classNames = [styleExport.name];
        for (const reference of styleExport.composes) {
            if (reference.type === 'local') {
                const localName = Object.keys(module.sourceExports).find((candidate) => module.sourceExports[candidate].name === reference.name);
                if (localName === undefined) {
                    throw new Error(`${id}: missing local composed class ${reference.name}`);
                }
                classNames.push(...expand(id, localName).split(' '));
            } else if (reference.type === 'global') {
                classNames.push(reference.name);
            } else {
                const dependencyId = module.compositionTargets.get(reference.specifier);
                if (dependencyId === undefined) {
                    throw new Error(`${id}: unresolved composition source ${reference.specifier}`);
                }
                classNames.push(...expand(dependencyId, reference.name).split(' '));
            }
        }
        expanding.delete(key);
        const classString = [...new Set(classNames)].join(' ');
        expanded.set(key, classString);
        return classString;
    }

    return orderedIds.map((id) => {
        const module = /** @type {SourceModule} */ (modules.get(id));
        /** @type {Record<string, string>} */
        const exports = {};
        for (const name of module.classNames) {
            if (module.sourceExports[name] !== undefined) {
                exports[name] = expand(id, name);
            }
        }
        return { id, css: module.css, exports, dependencies: module.dependencies, assets: module.assets };
    });
}
