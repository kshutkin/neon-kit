# @neon-kit/style-build

Shared compiler for CSS modules intended for `@slimlib/element` shadow roots.
It transforms each source sheet separately and returns dependency ordered CSS,
final class strings, and `url()` asset references. The package has no runtime
dependency on `@slimlib/element`.

```js
import { compileStyle } from '@neon-kit/style-build';

const modules = await compileStyle(entryId, {
    read: (id) => readSource(id),
    resolve: (specifier, importer) => resolveStyle(specifier, importer),
});
```

`read` returns source CSS. `resolve` returns a canonical source ID for a local
`@import` or a `composes ... from` reference. The final array contains one
module per source ID, with dependencies before importers. Each module has
`id`, transformed `css`, final `exports`, `dependencies`, and `assets` fields.

Only local, unconditional `@import` rules are accepted. `.module.css` files
use CSS Modules syntax; plain `.css` files keep global selectors and custom
properties. `url()` references remain relative to their source, so an adapter
must emit the asset and rewrite the CSS URL for its output location. The core
does not emit files, JS facades, native typed imports, or source maps yet.
Those tasks belong to the planned adapters and CLI described in
[the design](../STYLE_BUILD_DESIGN.md).
