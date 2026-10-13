import { relative, isAbsolute } from 'node:path';
import { buildVanilla } from '../theme-vanilla/scripts/build.mjs';

/** Rebuild the documentation's classical stylesheet when theme sources change. */
export function vanillaStyles(themeDirectory, outputDirectory) {
    return {
        name: 'neon-docs-vanilla-styles',
        apply: 'serve',
        async configureServer(server) {
            await buildVanilla(themeDirectory, outputDirectory);
            let pending = Promise.resolve();
            server.watcher.add(themeDirectory);
            const rebuild = (event, path) => {
                const source = relative(themeDirectory, path);
                if (
                    ['add', 'change', 'unlink'].includes(event) &&
                    !source.startsWith('..') &&
                    !isAbsolute(source)
                ) {
                    pending = pending
                        .then(() =>
                            buildVanilla(themeDirectory, outputDirectory)
                        )
                        .catch((error) =>
                            server.config.logger.error(error.stack)
                        );
                }
            };
            server.watcher.on('all', rebuild);
            server.httpServer?.once('close', () => {
                server.watcher.off('all', rebuild);
            });
        },
    };
}
