import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { basename, dirname, extname, posix, relative, resolve } from 'node:path';
import { compileStyle, createStyleDeclaration, rewriteStyleUrls } from '@neon-kit/style-build';
import { createIdResolver, isFileServingAllowed, normalizePath } from 'vite';
import MagicString from 'magic-string';

const assetPrefix = 'neon-style-facade:';

/** @param {string | Uint8Array} value */
function identity(value) {
    return createHash('sha256').update(value).digest('hex').slice(0, 20);
}

/** @param {string} path */
function assetUrl(path) {
    return path.split('/').map((part) => encodeURIComponent(part)).join('/');
}

/** @param {Record<string, string>} exports @param {string[]} imports */
function facade(exports, imports) {
    const classes = Object.entries(exports).map(([name, value], index) =>
        `const class${index} = ${JSON.stringify(value)}; export { class${index} as ${JSON.stringify(name)} };`).join('\n');
    return `${imports.map((url, index) => `import sheet${index} from ${JSON.stringify(url)} with { type: 'css' };`).join('\n')}\n${classes}\nexport const sheets = [${imports.map((url, index) => `sheet${index}`).join(',')}];`;
}

/** @typedef {{ declarations?: string }} StyleBuildOptions */

/**
 * Compile opt-in imports into native shadow sheets. Normal CSS Modules remain
 * Vite-owned. Optional declarations are written only to the configured file.
 * @param {StyleBuildOptions} [options]
 * @returns {import('vite').Plugin}
 */
export function styleBuild(options = {}) {
    /** @type {import('vite').ResolvedConfig} */
    let configuration;
    /** @type {import('vite').ViteDevServer | undefined} */
    let developmentServer;
    /** @type {import('vite').ResolveFn} */
    let resolveSource;
    /** @type {import('vite').Environment | undefined} */
    let buildEnvironment;
    let projectRoot = '';
    /** @type {Map<string, Promise<import('@neon-kit/style-build').CompiledStyleModule[]>>} */
    const compiledEntries = new Map();
    /** @type {Map<string, Set<string>>} */
    const entryDependencies = new Map();
    /** @type {Map<string, { body: string | Uint8Array, mime: string }>} */
    const developmentAssets = new Map();
    /** @type {Map<string, string>} */
    const emittedFacades = new Map();
    /** @type {Set<string>} */
    const emittedFiles = new Set();
    /** @type {Map<string, { id: string, text: string }>} */
    const declarations = new Map();
    let declarationWrite = Promise.resolve();

    /** @param {string} id */
    function sourceIdentity(id) {
        return normalizePath(relative(projectRoot, id));
    }

    function basePath() {
        return new URL(configuration.base, 'http://neon.invalid').pathname;
    }

    /** @param {string} id @param {string} specifier */
    function developmentEntry(id, specifier) {
        // The payload survives Vite optimizer caches and server restarts.
        // Cached requests are checked against Vite's filesystem permissions.
        const key = Buffer.from(JSON.stringify({ id, specifier })).toString('base64url');
        return `${basePath()}__neon_styles/${key}.js`;
    }

    /** @param {string} path */
    function absoluteEndpoint(path) {
        const origin = configuration.server.origin ?? developmentServer?.resolvedUrls?.local[0] ?? developmentServer?.resolvedUrls?.network[0];
        if (!origin) {
            throw new Error('Native style endpoints require a running Vite server or server.origin');
        }
        return new URL(path, origin).href;
    }

    /** @param {string} id */
    async function compile(id) {
        let pending = compiledEntries.get(id);
        if (!pending) {
            pending = compileStyle(id, {
                read: (file) => readFile(file, 'utf8'),
                async resolve(specifier, importer) {
                    const resolved = await resolveSource(specifier, importer);
                    if (!resolved) {
                        throw new Error(`${importer}: cannot resolve style ${specifier}`);
                    }
                    return resolved;
                },
            }, { sourceMap: configuration.command === 'serve' ? configuration.css.devSourcemap : Boolean(configuration.build.sourcemap), projectRoot });
            compiledEntries.set(id, pending);
        }
        try {
            const modules = await pending;
            const exports = modules.at(-1)?.exports ?? {};
            if (Object.hasOwn(exports, 'sheets')) {
                throw new Error(`${id}: the class name "sheets" is reserved by the native sheet facade`);
            }
            entryDependencies.set(id, new Set(modules.map((module) => module.id)));
            return modules;
        } catch (error) {
            compiledEntries.delete(id);
            throw error;
        }
    }

    /** @param {string} specifier @param {import('@neon-kit/style-build').CompiledStyleModule} module */
    async function declare(specifier, module) {
        if (options.declarations) {
            const text = createStyleDeclaration(specifier, module);
            const pattern = text.slice(0, text.indexOf(' {'));
            const previous = declarations.get(pattern);
            if (previous && previous.id !== module.id) {
                throw new Error(`Ambiguous native style declaration ${specifier}; use package-qualified CSS imports`);
            }
            declarations.set(pattern, { id: module.id, text });
            const file = resolve(configuration.root, options.declarations);
            declarationWrite = declarationWrite.then(async () => {
                const output = `// Generated by @neon-kit/vite-plugin-style-build.\n${[...declarations.values()].map((declaration) => declaration.text).sort().join('\n')}`;
                await mkdir(dirname(file), { recursive: true });
                let previousOutput;
                try {
                    previousOutput = await readFile(file, 'utf8');
                } catch (error) {
                    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') {
                        throw error;
                    }
                }
                if (previousOutput !== output) {
                    await writeFile(file, output);
                }
            });
            await declarationWrite;
        }
    }

    /**
     * @param {import('@neon-kit/style-build').CompiledStyleModule} module
     * @param {boolean} development
     * @param {(name: string, body: string | Uint8Array) => void} emit
     */
    async function stylesheet(module, development, emit) {
        /** @type {Record<string, string>} */
        const replacements = {};
        for (const url of module.assets) {
            if (!/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) {
                const suffixIndex = url.search(/[?#]/);
                const path = decodeURIComponent(suffixIndex < 0 ? url : url.slice(0, suffixIndex));
                const suffix = suffixIndex < 0 ? '' : url.slice(suffixIndex);
                const publicFile = path.startsWith('/') && configuration.publicDir ? resolve(configuration.publicDir, `.${path}`) : undefined;
                let publicAsset = false;
                if (publicFile) {
                    try {
                        await readFile(publicFile);
                        publicAsset = true;
                    } catch (error) {
                        if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') {
                            throw error;
                        }
                    }
                }
                if (publicAsset) {
                    const root = development ? basePath() : posix.relative(configuration.build.assetsDir, '.') + '/';
                    replacements[url] = `${root}${assetUrl(path.slice(1))}${suffix}`;
                    for (const dependencies of entryDependencies.values()) {
                        if (dependencies.has(module.id)) {
                            dependencies.add(await realpath(/** @type {string} */ (publicFile)));
                        }
                    }
                } else {
                    const asset = await resolveSource(path.startsWith('.') || path.startsWith('/') ? path : `./${path}`, module.id);
                    if (!asset) {
                        throw new Error(`${module.id}: cannot resolve URL asset ${url}`);
                    }
                    const bytes = await readFile(asset);
                    const name = `${basename(asset, extname(asset))}.${identity(bytes)}${extname(asset)}`;
                    emit(name, bytes);
                    replacements[url] = `./${assetUrl(name)}${suffix}`;
                    for (const dependencies of entryDependencies.values()) {
                        if (dependencies.has(module.id)) {
                            dependencies.add(asset);
                        }
                    }
                }
            }
        }
        const rewritten = module.assets.length > 0 ? rewriteStyleUrls(module, replacements) : module;
        const mapMode = development ? Boolean(configuration.css.devSourcemap) : configuration.build.sourcemap;
        const map = rewritten.map ? JSON.parse(rewritten.map) : undefined;
        if (map) {
            map.sources = [sourceIdentity(module.id)];
        }
        const name = `${basename(module.id, '.css')}.${identity(`${sourceIdentity(module.id)}\0${rewritten.css}\0${map ? JSON.stringify(map) : ''}\0${mapMode}`)}.css`;
        let css = rewritten.css;
        if (map) {
            map.file = name;
            const serialized = JSON.stringify(map);
            if (mapMode === 'inline') {
                css += `\n/*# sourceMappingURL=data:application/json;base64,${Buffer.from(serialized).toString('base64')} */`;
            } else {
                emit(`${name}.map`, serialized);
                if (mapMode !== 'hidden') {
                    css += `\n/*# sourceMappingURL=${assetUrl(name)}.map */`;
                }
            }
        }
        emit(name, css);
        return name;
    }

    return {
        name: 'neon-style-build',
        enforce: 'pre',
        config() {
            return { optimizeDeps: { rolldownOptions: { plugins: [{
                name: 'neon-native-style-external',
                async resolveId(source, importer) {
                    let result;
                    if (source.endsWith('.css?neon')) {
                        const id = await resolveSource(source.slice(0, -5), importer);
                        if (!id) {
                            throw new Error(`Cannot resolve native style import ${source}`);
                        }
                        result = { id: developmentEntry(id, source), external: true };
                    }
                    return result;
                },
            }] } } };
        },
        async configResolved(resolved) {
            configuration = resolved;
            projectRoot = await realpath(resolved.root);
            const resolver = createIdResolver(resolved);
            resolveSource = async (source, importer) => {
                const environment = developmentServer?.environments.client ?? buildEnvironment;
                if (!environment) {
                    throw new Error('Native style resolution requires a Vite client environment');
                }
                return resolver(environment, source, importer);
            };
        },
        buildStart() {
            buildEnvironment = this.environment;
            emittedFacades.clear();
            emittedFiles.clear();
            compiledEntries.clear();
            entryDependencies.clear();
            declarations.clear();
            declarationWrite = Promise.resolve();
        },
        async resolveId(source, importer, context) {
            let result;
            if (source.startsWith(assetPrefix)) {
                result = { id: source, external: true };
            } else if (configuration.command === 'serve' && source.startsWith(`${basePath()}__neon_styles/`)) {
                result = { id: absoluteEndpoint(source), external: true };
            } else if (source.endsWith('.css?neon')) {
                if (context?.ssr || this.environment.config.consumer === 'server') {
                    throw new Error('Native CSS sheet imports require a browser build; SSR is not supported');
                }
                const resolved = await this.resolve(source.slice(0, -5), importer, { skipSelf: true });
                if (!resolved || resolved.external) {
                    throw new Error(`Cannot resolve native style import ${source}`);
                }
                if (configuration.command === 'serve') {
                    result = { id: absoluteEndpoint(developmentEntry(resolved.id, source)), external: true };
                } else {
                    const modules = await compile(resolved.id);
                    await declare(source, modules[modules.length - 1]);
                    const imports = [];
                    for (const module of modules) {
                        this.addWatchFile(module.id);
                        const name = await stylesheet(module, false, (name, body) => {
                            if (!emittedFiles.has(name)) {
                                this.emitFile({ type: 'asset', fileName: `${configuration.build.assetsDir}/${name}`, source: body });
                                emittedFiles.add(name);
                            }
                        });
                        imports.push(`./${assetUrl(name)}`);
                    }
                    for (const dependency of entryDependencies.get(resolved.id) ?? []) {
                        this.addWatchFile(dependency);
                    }
                    const code = facade(modules[modules.length - 1].exports, imports);
                    const key = identity(`${sourceIdentity(resolved.id)}\0${code}`);
                    const marker = `${assetPrefix}${key}.js`;
                    if (!emittedFacades.has(marker)) {
                        const reference = this.emitFile({ type: 'asset', fileName: `${configuration.build.assetsDir}/${key}.styles.js`, source: code });
                        emittedFacades.set(marker, reference);
                    }
                    result = { id: marker, external: true };
                }
            }
            return result;
        },
        renderChunk(code, chunk) {
            const rendered = new MagicString(code);
            for (const [marker, reference] of emittedFacades) {
                const path = posix.relative(posix.dirname(chunk.fileName), this.getFileName(reference));
                let position = code.indexOf(marker);
                while (position >= 0) {
                    rendered.overwrite(position, position + marker.length, path.startsWith('.') ? path : `./${path}`);
                    position = code.indexOf(marker, position + marker.length);
                }
            }
            return rendered.hasChanged() ? { code: rendered.toString(), map: rendered.generateMap({ hires: true }) } : undefined;
        },
        configureServer(server) {
            developmentServer = server;
            const prefix = `${basePath()}__neon_styles/`;
            server.middlewares.use(async (request, response, next) => {
                const path = request.url?.split('?')[0];
                if (!path?.startsWith(prefix)) {
                    next();
                } else {
                    try {
                        const name = decodeURIComponent(path.slice(prefix.length));
                        let asset = developmentAssets.get(name);
                        if (name.endsWith('.js')) {
                            const entry = JSON.parse(Buffer.from(name.slice(0, -3), 'base64url').toString());
                            if (typeof entry.id !== 'string' || !entry.id.endsWith('.css') || typeof entry.specifier !== 'string' || !isFileServingAllowed(entry.id, server)) {
                                throw new Error('Native style source is outside Vite filesystem permissions');
                            }
                            const modules = await compile(entry.id);
                            await declare(entry.specifier, modules[modules.length - 1]);
                            const imports = [];
                            for (const module of modules) {
                                const sheet = await stylesheet(module, true, (name, body) => {
                                    const mime = name.endsWith('.css') ? 'text/css' : name.endsWith('.map') ? 'application/json' : name.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
                                    developmentAssets.set(name, { body, mime });
                                });
                                imports.push(`./${assetUrl(sheet)}`);
                            }
                            for (const dependency of entryDependencies.get(entry.id) ?? []) {
                                server.watcher.add(dependency);
                            }
                            asset = { body: facade(modules[modules.length - 1].exports, imports), mime: 'text/javascript' };
                        }
                        if (!asset) {
                            response.statusCode = 404;
                            response.end('Unknown native style asset');
                        } else {
                            response.setHeader('Content-Type', asset.mime);
                            response.setHeader('Cache-Control', 'no-store');
                            response.end(asset.body);
                        }
                    } catch (error) {
                        server.config.logger.error(String(error));
                        response.statusCode = 500;
                        response.end(String(error));
                    }
                }
            });
        },
        hotUpdate(context) {
            let result;
            if (this.environment.name === 'client') {
                let affected = false;
                for (const [id, dependencies] of entryDependencies) {
                    if (dependencies.has(context.file)) {
                        compiledEntries.delete(id);
                        affected = true;
                    }
                }
                if (affected) {
                    const invalidated = new Set();
                    for (const module of context.modules) {
                        this.environment.moduleGraph.invalidateModule(module, invalidated, context.timestamp, true);
                    }
                    this.environment.hot.send({ type: 'full-reload' });
                    result = [];
                }
            }
            return result;
        },
    };
}
