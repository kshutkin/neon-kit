import { transform } from 'lightningcss';

/**
 * Rewrite URL values through the CSS AST, composing the input source map.
 * Resolution and asset emission remain the caller's responsibility.
 * @param {{ id: string, css: string, map?: string }} module
 * @param {Record<string, string>} replacements
 * @returns {{ css: string, map?: string }}
 */
export function rewriteStyleUrls(module, replacements) {
    const input = module.map ? JSON.parse(module.map) : undefined;
    const result = transform({
        // Use the map's logical source name so composition does not introduce
        // a second, generated source when projectRoot made it relative.
        filename: input?.sources[0] ?? module.id,
        code: Buffer.from(module.css),
        sourceMap: module.map !== undefined,
        inputSourceMap: module.map,
        visitor: {
            Url(url) {
                return { ...url, url: replacements[url.url] ?? url.url };
            },
        },
    });
    let map = result.map?.toString();
    if (map && module.map) {
        const output = JSON.parse(map);
        // Lightning CSS currently escapes sourcesContent again when composing
        // input maps. Keep the original source text for each matching source.
        output.sourcesContent = output.sources.map((/** @type {string} */ source, /** @type {number} */ index) => {
            const original = input.sources.indexOf(source);
            return original >= 0 ? input.sourcesContent?.[original] : output.sourcesContent?.[index];
        });
        map = JSON.stringify(output);
    }
    return { css: result.code.toString(), map };
}

/**
 * Generate an ambient authoring declaration for one native style import.
 * Relative specifiers become suffix patterns, since TypeScript disallows
 * relative ambient module names. Hosts must reject ambiguous patterns.
 * @param {string} specifier
 * @param {{ exports: Record<string, string> }} module
 * @returns {string}
 */
export function createStyleDeclaration(specifier, module) {
    if (Object.hasOwn(module.exports, 'sheets')) {
        throw new Error('The class export "sheets" is reserved by native style imports');
    }
    const pattern = specifier.startsWith('.') ? `*/${specifier.replace(/^(?:\.\.?\/)+/, '')}` : specifier;
    const classes = Object.keys(module.exports).sort().map((name, index) =>
        `    const class${index}: string;\n    export { class${index} as ${JSON.stringify(name)} };`).join('\n');
    return `declare module ${JSON.stringify(pattern)} {\n${classes}\n    export const sheets: CSSStyleSheet[];\n}\n`;
}
