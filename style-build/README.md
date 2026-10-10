# @neon-kit/style-build

Filesystem-independent compiler for shared shadow-root CSS Modules. Each source
sheet stays separate. The compiler returns final class strings, dependency edges,
URL references, and optional source maps. It has no rendering-runtime dependency.

```js
import { compileStyle } from '@neon-kit/style-build';

const modules = await compileStyle(entryId, {
    read: (id) => readSource(id),
    resolve: (specifier, importer) => resolveStyle(specifier, importer),
}, { sourceMap: true, projectRoot });
```

The host supplies canonical source IDs. Each result has `id`, `css`, `exports`,
`dependencies`, and `assets`, plus `urls` with original URL spellings, compiler
placeholders, and source locations. Optional `map` is a JSON source-map string
including authored source text. `projectRoot` makes compiler names and map sources
relative to a common root without changing host identities.

Only local, unconditional `@import` rules are accepted. They retain their authored
order; unrelated composition dependencies use stable ID order. Every reachable
sheet appears once, before its importer. Conflicting composed declarations still
need an explicit source ordering policy. `.module.css` uses scoped classes;
plain `.css` keeps global selectors. Custom properties remain unscoped.

## Output helpers

```js
import { rewriteStyleUrls, createStyleDeclaration } from '@neon-kit/style-build';

const output = rewriteStyleUrls(module, {
    './image.svg?v=1#icon': './image.hash.svg?v=1#icon',
});
const declaration = createStyleDeclaration('@neon-kit/theme/button.module.css?neon', module);
```

`rewriteStyleUrls` replaces URL values through the CSS AST and composes the input
map, preserving original source text. Lightning CSS supplies rule-level mappings.
The caller resolves and emits assets; the core never reads or writes files.

`createStyleDeclaration` emits named string exports and `sheets: CSSStyleSheet[]`.
Keyframes are excluded and the name `sheets` is reserved. Relative imports become
suffix patterns because TypeScript disallows relative ambient module names.
Declaration hosts must reject collisions between distinct sources sharing a
pattern. Package-qualified imports give exact names. Include generated declarations
in the authoring TypeScript project; arbitrary string export names need TypeScript
5.6 or later.

`CompiledStyleModule`, `StyleHost`, `StyleDependency`, `StyleUrl`, and
`CompileStyleOptions` are exported types.

See [the design](../docs/STYLE_BUILD_DESIGN.md) and the separate
[Vite adapter](../vite-plugin-style-build/README.md).
