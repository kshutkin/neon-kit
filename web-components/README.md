# @neon-kit/web-components

Native custom elements implementing parts of the [`@neon-kit/theme`](../theme) design system.

The package ships unbundled JavaScript with JSDoc types — types are produced by
[`dts-buddy`](https://github.com/Rich-Harris/dts-buddy) and the published layout
is flattened by `pkgprn` at pack time.

## Components

- `@neon-kit/web-components/tooltip` - `<neon-tooltip>`
- `@neon-kit/web-components/jsx-tooltip` - `Tooltip` JSX component
- `@neon-kit/web-components/menu` - `<neon-menu>` and `<neon-menu-item>`
- `@neon-kit/web-components/combobox` - `<neon-combobox>`
- `@neon-kit/web-components/multicombobox` - `<neon-multicombobox>`
- `@neon-kit/web-components/datepicker` - `<neon-datepicker>`
- `@neon-kit/web-components/timepicker` - `<neon-timepicker>`
- `@neon-kit/web-components/icon` - `<neon-icon>`

## `<neon-icon>`

Light-DOM custom element that renders an icon by `name`. Icon data
lives in [`@neon-kit/icons`](../icons); this package only ships the element.

The rendered SVG is always `1em × 1em`; size it via CSS `font-size` on
the host (or any ancestor).

### Dynamic loading via `name`

`<neon-icon name="<variant>/<icon>">` lazy-loads the icon module on demand
via `import('@neon-kit/icons/<name>')`. The component marks that call
`/* @vite-ignore */`, so the dynamic specifier reaches the host runtime
verbatim. It resolves in Node ESM and any runtime that resolves bare
specifiers without bundler intervention (e.g. a browser configured with
an import map, Deno).

Bundlers (Vite, Rollup, esbuild, webpack) cannot rewrite a dynamic
specifier they're explicitly told to ignore, and browsers without an
import map cannot resolve `@neon-kit/icons/<name>` either. In those
environments, drive the element from outside: either follow the
`import.meta.glob` + `MutationObserver` hydrator pattern in
[`site/icons.js`](../site/icons.js), or set `el.icon = importedDef`
directly from a static import (see below).

#### Bundler-agnostic, tree-shakeable

Assigning the `icon` property bypasses the dynamic import entirely and is
the most tree-shake-friendly path — only the icons you statically import
are shipped:

```js
import bars from '@neon-kit/icons/outline/bars-3';
const el = document.querySelector('neon-icon');
el.icon = bars;
```
