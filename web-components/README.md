# @neon-kit/web-components

Native custom elements implementing parts of the [`@neon-kit/theme`](../theme) design system.

The package ships unbundled JavaScript with JSDoc types — types are produced by
[`dts-buddy`](https://github.com/Rich-Harris/dts-buddy) and the published layout
is flattened by `pkgprn` at pack time.

## Styles and Vite

```sh
pnpm add @neon-kit/web-components
pnpm add -D @neon-kit/vite-plugin-style-build
```

```js
// vite.config.js
import { defineConfig } from 'vite';
import { styleBuild } from '@neon-kit/vite-plugin-style-build';

export default defineConfig({
    plugins: [styleBuild()],
    build: { cssTarget: ['chrome128', 'firefox128'] },
});

// Application entry: registers the selected element and imports its sheets.
import '@neon-kit/web-components/combobox';
```

Generated controls and icons render into open shadow roots with shared adopted
stylesheets. The native sheet path targets Chromium and Firefox. A document
stylesheet is unnecessary for their internal visuals. The document loads fonts;
components inherit its `color-scheme` and public `--neon-*` properties. An unstyled
page stays light. Set `:root { color-scheme: light dark; }` for OS mode, or force
`light` / `dark` on the root or an individual host.

Combobox options remain light-DOM children and can be changed dynamically.
Generated inputs, listboxes, popovers, and their ARIA references share the
component's shadow root. Form submission, validation, reset, external labels,
and `focus()` / `blur()` operate through the host. Input and change events cross
an enclosing application shadow root.

Menu and menu-item hosts project authored children through a default slot.
Tooltip hosts project their authored content and render the arrow internally.
The menu or tooltip host remains the popover in its original tree, preserving
external `popovertarget`, `aria-labelledby`, and `aria-describedby` relationships.
Detailed named slots and parts remain deferred. Consumer-authored rich content
uses document styles: import ordinary theme CSS Modules for labels, shortcuts,
and other helper roles, then apply their class maps to those light-DOM nodes.

`<neon-menu placement="block-start">` also accepts `block-end` (default),
`inline-start`, and `inline-end`. Component root classes and placement classes
are owned by the component; consumers do not need to supply them.

## Components

- `@neon-kit/web-components/tooltip` - `<neon-tooltip>`
- `@neon-kit/web-components/menu` - `<neon-menu>` and `<neon-menu-item>`
- `@neon-kit/web-components/combobox` - `<neon-combobox>`
- `@neon-kit/web-components/multicombobox` - `<neon-multicombobox>`
- `@neon-kit/web-components/datepicker` - `<neon-datepicker>`
- `@neon-kit/web-components/timepicker` - `<neon-timepicker>`
- `@neon-kit/web-components/icon` - `<neon-icon>`

The JSX tooltip component is available from
`@neon-kit/jsx-components/tooltip`.

## `<neon-icon>`

Shadow-DOM custom element that renders an icon by `name`. Icon data
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
