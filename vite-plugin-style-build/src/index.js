import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, posix } from 'node:path';
import { compileStyle } from '@neon-kit/style-build';

const assetPrefix = 'neon-style-facade:';

/** @param {string} value */
function identity(value) {
    return createHash('sha256').update(value).digest('hex').slice(0, 20);
}

/**
 * Compile opt-in CSS imports into native sheets, leaving ordinary CSS Modules
 * to Vite. Development uses raw module endpoints so Vite cannot turn native
 * sheet imports into document style injection.
 * @returns {import('vite').Plugin}
 */
export function styleBuild() {
    /** @type {import('vite').ResolvedConfig} */
    let configuration;
    /** @type {import('vite').ViteDevServer | undefined} */
    let developmentServer;
    /** @type {Map<string, string>} */
    const entries = new Map();
    /** @type {Map<string, string>} */
    const developmentSheets = new Map();
    /** @type {Map<string, string>} */
    const assets = new Map();
    /** @type {Set<string>} */
    const emittedSheets = new Set();
    /** @type {Set<string>} */
    const dependencies = new Set();
    /** @type {{ resolve: (source: string, importer: string | undefined, options: { skipSelf: boolean }) => Promise<{ id: string; external?: boolean | string } | null> } | undefined} */
    let resolver;

    /** @param {string} entry */
    async function compile(entry) {
        const modules = await compileStyle(entry, {
            read: (id) => readFile(id, 'utf8'),
            async resolve(specifier, importer) {
                const resolved = await resolver?.resolve(specifier, importer, { skipSelf: true });
                if (!resolved || resolved.external) {
                    throw new Error(`${importer}: cannot resolve local style ${specifier}`);
                }
                return resolved.id;
            },
        });
        for (const module of modules) {
            dependencies.add(module.id);
            if (module.assets.length > 0) {
                throw new Error(`${module.id}: url() asset emission is not supported by this initial adapter`);
            }
        }
        const exports = modules.at(-1)?.exports ?? {};
        if (Object.hasOwn(exports, 'sheets')) {
            throw new Error(`${entry}: the class name "sheets" is reserved by the native sheet facade`);
        }
        return { modules, exports };
    }

    /** @param {Record<string, string>} exports */
    function classExports(exports) {
        return Object.entries(exports).map(([name, value], index) =>
            `const class${index} = ${JSON.stringify(value)}; export { class${index} as ${JSON.stringify(name)} };`).join('\n');
    }

    return {
        name: 'neon-style-build',
        enforce: 'pre',
        configResolved(resolved) {
            configuration = resolved;
        },
        buildStart() {
            assets.clear();
            emittedSheets.clear();
            dependencies.clear();
        },
        async resolveId(source, importer, options) {
            let result;
            if (source.startsWith(assetPrefix)) {
                result = { id: source, external: true };
            } else if (source.endsWith('.css?neon')) {
                if (options?.ssr) {
                    throw new Error('Native CSS sheet imports require a browser build; SSR is not supported');
                }
                const resolved = await this.resolve(source.slice(0, -5), importer, { skipSelf: true });
                if (!resolved || resolved.external) {
                    throw new Error(`Cannot resolve native style import ${source}`);
                }
                resolver = this;
                const key = identity(resolved.id);
                entries.set(key, resolved.id);
                if (configuration.command === 'serve') {
                    const origin = configuration.server.origin ?? developmentServer?.resolvedUrls?.local[0] ?? developmentServer?.resolvedUrls?.network[0];
                    if (!origin) {
                        throw new Error('Native styles need a running Vite server or server.origin; exclude native component packages from optimizeDeps');
                    }
                    // An absolute URL prevents Vite's pre-transform pipeline
                    // from trying to load these raw native module endpoints.
                    result = { id: new URL(`${configuration.base}__neon_styles/${key}.js`, origin).href, external: true };
                } else {
                    const compiled = await compile(resolved.id);
                    const marker = `${assetPrefix}${identity(JSON.stringify(compiled))}.js`;
                    if (!assets.has(marker)) {
                        const imports = compiled.modules.map((module, index) => {
                            this.addWatchFile(module.id);
                            const name = `${basename(module.id, '.css')}.${identity(`${module.id}\0${module.css}`)}.css`;
                            if (!emittedSheets.has(name)) {
                                this.emitFile({ type: 'asset', fileName: `${configuration.build.assetsDir}/${name}`, source: module.css });
                                emittedSheets.add(name);
                            }
                            return `import sheet${index} from './${name}' with { type: 'css' };`;
                        });
                        const code = `${imports.join('\n')}\n${classExports(compiled.exports)}\nexport const sheets = [${compiled.modules.map((module, index) => `sheet${index}`).join(',')}];`;
                        const reference = this.emitFile({ type: 'asset', fileName: `${configuration.build.assetsDir}/${key}.styles.${identity(code)}.js`, source: code });
                        assets.set(marker, reference);
                    }
                    result = { id: marker, external: true };
                }
            }
            return result;
        },
        renderChunk(code, chunk) {
            let rendered = code;
            for (const [marker, reference] of assets) {
                const path = posix.relative(posix.dirname(chunk.fileName), this.getFileName(reference));
                rendered = rendered.replaceAll(marker, path.startsWith('.') ? path : `./${path}`);
            }
            return rendered === code ? undefined : { code: rendered, map: null };
        },
        configureServer(server) {
            developmentServer = server;
            const prefix = `${configuration.base}__neon_styles/`;
            server.middlewares.use(async (request, response, next) => {
                const path = request.url?.split('?')[0];
                if (!path?.startsWith(prefix)) {
                    next();
                } else {
                    try {
                        const name = path.slice(prefix.length);
                        let body = developmentSheets.get(name);
                        if (name.endsWith('.js')) {
                            const entry = entries.get(name.slice(0, -3));
                            if (!entry) {
                                throw new Error(`Unknown native style entry ${name}`);
                            }
                            const compiled = await compile(entry);
                            const imports = compiled.modules.map((module, index) => {
                                server.watcher.add(module.id);
                                const sheet = `${identity(`${module.id}\0${module.css}`)}.css`;
                                developmentSheets.set(sheet, module.css);
                                return `import sheet${index} from './${sheet}' with { type: 'css' };`;
                            });
                            body = `${imports.join('\n')}\n${classExports(compiled.exports)}\nexport const sheets = [${compiled.modules.map((module, index) => `sheet${index}`).join(',')}];`;
                        }
                        if (body === undefined) {
                            response.statusCode = 404;
                            response.end('Unknown native stylesheet');
                        } else {
                            response.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : 'text/javascript');
                            response.setHeader('Cache-Control', 'no-store');
                            response.end(body);
                        }
                    } catch (error) {
                        server.config.logger.error(String(error));
                        response.statusCode = 500;
                        response.end(String(error));
                    }
                }
            });
        },
        handleHotUpdate(context) {
            let result;
            if (dependencies.has(context.file)) {
                developmentSheets.clear();
                // The same source may also feed ordinary JSX CSS Modules.
                // Invalidate that graph before sending a reload, since an
                // empty hook result suppresses Vite's normal CSS update.
                const invalidated = new Set();
                for (const module of context.modules) {
                    context.server.moduleGraph.invalidateModule(module, invalidated, context.timestamp, true);
                }
                context.server.ws.send({ type: 'full-reload' });
                result = [];
            }
            return result;
        },
    };
}
