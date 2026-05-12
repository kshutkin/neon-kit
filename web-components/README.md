# @neon-kit/web-components

Native custom elements implementing parts of the [`@neon-kit/theme`](../theme) design system.

The package ships unbundled JavaScript with JSDoc types — types are produced by
[`dts-buddy`](https://github.com/Rich-Harris/dts-buddy) and the published layout
is flattened by `pkgprn` at pack time.

## Components

- `@neon-kit/web-components/tooltip` - `<neon-tooltip>`
- `@neon-kit/web-components/menu` - `<neon-menu>`
- `@neon-kit/web-components/combobox` - `<neon-combobox>`
- `@neon-kit/web-components/multicombobox` - `<neon-multicombobox>`
- `@neon-kit/web-components/datepicker` - `<neon-datepicker>`
- `@neon-kit/web-components/timepicker` - `<neon-timepicker>`
- `@neon-kit/web-components/icon` - `<neon-icon>`
- `@neon-kit/web-components/icon-vite-loader` - side-effect: wires `<neon-icon>` to `@neon-kit/icons` via `import.meta.glob` (Vite only)

## `<neon-icon>`

Light-DOM custom element that renders a registered icon by `name`. Icon data
lives in [`@neon-kit/icons`](../icons); this package only ships the element.
Register the icons you use so bundlers can tree-shake the rest:

```js
import { defineIcons, registerIcon } from '@neon-kit/web-components/icon';
import { outline } from '@neon-kit/icons';

defineIcons({ menu: outline['bars-3'] });
registerIcon();
```

```html
<neon-icon name="menu" size="20"></neon-icon>
<neon-icon name="menu" aria-label="Open menu"></neon-icon>
```

### Dynamic loading via `name`

`<neon-icon name="<variant>/<icon>">` lazy-loads the icon module on demand.
The default loader runs `import('@neon-kit/icons/<name>')`, which works in
runtimes that resolve dynamic bare specifiers (Node ESM, native browser
ESM, esbuild).

#### Vite (and Vitest browser mode)

Vite cannot statically analyze that dynamic specifier, so add the bundled
Vite adapter as a one-shot side-effect import. It wires
`import.meta.glob` against `@neon-kit/icons` and feeds the result to
`setIconLoader`, code-splitting each icon into its own lazy chunk:

```js
import '@neon-kit/web-components/icon';
import '@neon-kit/web-components/icon-vite-loader';
```

#### Other bundlers

For non-Vite toolchains, swap the loader yourself:

```js
import { setIconLoader } from '@neon-kit/web-components/icon';

setIconLoader(async (name) => (await import(`./icons/${name}.js`)).default);
```

#### Bundler-agnostic, tree-shakeable

Assigning the `icon` property bypasses the loader entirely and is the
most tree-shake-friendly path — only the icons you statically import are
shipped:

```js
import bars from '@neon-kit/icons/outline/bars-3';
const el = document.querySelector('neon-icon');
el.icon = bars;
```
