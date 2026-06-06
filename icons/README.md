# @neon-kit/icons

Tree-shakeable SVG icon primitives for the Neon Kit theme, generated
from [heroicons](https://heroicons.com/). Every icon ships in four
variants:

| Variant   | Heroicons source | viewBox     | Style                       |
| --------- | ---------------- | ----------- | --------------------------- |
| `outline` | `24/outline`     | `0 0 24 24` | stroked, 1.5px line         |
| `solid`   | `24/solid`       | `0 0 24 24` | filled                      |
| `mini`    | `20/solid`       | `0 0 20 20` | filled, optimized for ~20px |
| `micro`   | `16/solid`       | `0 0 16 16` | filled, optimized for ~16px |

ESM only. Type declarations are emitted by `dts-buddy`.

## Install

```sh
pnpm add @neon-kit/icons
```

## Usage

There are three usage paths. Pick the one that matches your delivery
constraints.

### 1. Subpath import (recommended for tree-shaking)

Each icon lives at `@neon-kit/icons/<variant>/<name>` and is its own
module. Only the icons you import end up in your bundle:

```js
import menu from '@neon-kit/icons/outline/bars-3';      // outline (24×24, stroke 1.5)
import menuSolid from '@neon-kit/icons/solid/bars-3';   // 24×24 filled
import menuMini from '@neon-kit/icons/mini/bars-3';     // 20×20 filled
import menuMicro from '@neon-kit/icons/micro/bars-3';   // 16×16 filled

menu[0];   // width: 24
menu[1];   // height: 24
menu[2];   // SVG attrs: { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' }
menu[3];   // shared path attrs: { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
menu[4];   // first path data string
```

Need a stringified `<svg>` for direct HTML injection? Use the shared
`serialize()` helper (see below) instead of a per-icon string export.

### 2. Aggregate import

For ergonomics when bundler tree-shaking is not a concern, the root
package exposes one object per variant, keyed by kebab-case name:

```js
import { outline, solid, mini, micro } from '@neon-kit/icons';

const menu = outline['bars-3'];
const menuFilled = solid['bars-3'];
```

Single-variant aggregates are also available as `default` imports:

```js
import outlineIcons from '@neon-kit/icons/outline';
outlineIcons['bars-3'];
```

Each variant aggregate also re-exports every icon under a camelCase
named binding (e.g. `bars3`).

### 3. `<neon-icon>` custom element

The `<neon-icon>` element lives in
[`@neon-kit/web-components/icon`](../web-components/README.md) — it
consumes the `IconDef` values exported here.

### `serialize()`

For environments without a DOM (SSR, static generation, edge handlers)
or for direct HTML injection, `serialize(iconDef, opts?)` produces an
SVG string. It honors the same shell/path attribute defaults the
custom element uses, so output stays in lockstep with what
`<neon-icon>` would render:

```js
import bars from '@neon-kit/icons/outline/bars-3';
import { serialize } from '@neon-kit/icons';

serialize(bars);
// '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" …>…</svg>'

serialize(bars, { size: 24, ariaLabel: 'Open menu' });
// width/height="24px", role="img", inline <title>Open menu</title>
```

- `size`: number → `<n>px`, otherwise passed through (`1.25rem`,
  `2em`). Defaults to `1em`.
- `ariaLabel`: when present, emits a `<title>` child and
  `role="img"`. Otherwise the SVG gets `aria-hidden="true"`.

## Available icons

The icon set is generated from the installed `heroicons` package file
tree. Each Neon variant emits every SVG present in its matching
heroicons source directory, so variants do not need to have identical
name sets:

```sh
pnpm --filter @neon-kit/icons run gen
```

The generator rewrites `src/<variant>/<name>.js`, the variant index
files, `src/index.js`, and the `exports` map in `package.json`.
Re-runs are deterministic.

## Package internals

Per-icon modules are intentionally minimal — each one is a two-line
file that calls a per-variant factory:

```js
// src/outline/bars-3.js
import { icon } from './_variant.js';
export default icon(['M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5']);
```

The factory (`src/<variant>/_variant.js`) bakes in the viewBox, shell
attrs, and per-path attrs for that variant. The generator samples each
factory, then validates heroicons source SVGs against those defaults
while rebuilding.

The exported runtime `IconDef` is a compact tuple:

```js
[width, height, svgAttrs, pathAttrs, ...paths]
```

All paths in a generated icon share the same `pathAttrs` object.

The `_variant.js` modules are package-internal — they are not exposed
via `exports` in `package.json` and consumers should not import them.

## Licensing

This package is MIT licensed.

SVG path data is derived from
[heroicons](https://github.com/tailwindlabs/heroicons) (MIT,
© Tailwind Labs). heroicons is a build-time-only dependency; nothing
from it ships in this package's runtime — the icon data is inlined as
plain ES modules.
