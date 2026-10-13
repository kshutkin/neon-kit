# @neon-kit/theme-vanilla

Ordinary CSS for hand-written Neon Kit markup. No CSS Modules compiler, runtime
loader, or Vite plugin is required. This package builds the same visual sources
used by renderer packages in `@neon-kit/theme`.

```js
import '@neon-kit/theme-vanilla/index.css';
```

```html
<button class="btn cta">Save</button>
<input class="input" placeholder="Name">
<ul class="nav -vertical">
  <li><a class="nav__item -active" href="/">Home</a></li>
</ul>
```

For a classical `<link>`, use the package's `dist/index.css` file. Subpath exports
are available for CSS-aware bundlers; every output is flattened ordinary CSS.

## Selective entries

| Entry | Contents |
| --- | --- |
| `theme.css` | Public document tokens, font family fallback, page colors/focus, OS scheme opt-in |
| `reset-normalize.css` | Document reset |
| `components.css` | Complete component/helper/effect catalogue with required token defaults |
| `effects.css` | Shared surface/state helpers, metal, foil, and Neon glow effects |
| `components/button.css` | Buttons and variants |
| `components/forms.css` | Input, select, textarea, checkbox, radio, field, fieldset, and affixes |
| `components/overlays.css` | Dialog, details, menu, and tooltip |
| `components/navigation.css` | Vertical, tab, and segmented navigation |
| `components/labels.css` | Keyboard nameplates, badges, and tags |
| `components/pickers.css` | Combobox, datepicker, timepicker, and referenced form styles |
| `components/table.css` | Tables, stripes, and sortable header states |
| `components/links.css` | Links |

Selective component entries include their composed rules and token defaults.
They do not opt the document into an OS scheme or apply a document reset. Those
are explicit imports; the aggregate includes them. Cascade order is declared as
`neon.theme`, `neon.reset`, `neon.components`. Overlapping entries retain the same
class semantics in either order. Unlayered application CSS can override them.

Public names use existing stems (`btn`, `menu__item`, `nav -tabs`). Modifiers need
the documented base class; composed hashes are never required in HTML. See the
[full public class policy](../docs/style-migration/PUBLIC_CSS_API.md).

## Customization

Public properties use `--neon-*`. Internal `--_*` values are implementation details.
Menu item padding and tooltip delay/width settings also use this public prefix.
Their private defaults allow public values to inherit from an ancestor.


```css
:root { color-scheme: dark; --neon-primary-hue: 320; }
.my-panel { --neon-color-surface: oklch(95% 0.02 80); }
.my-glow { --neon-glow-color: oklch(88% 0.15 202); }
.my-tube { --neon-border-color: oklch(88% 0.25 148); }
.my-foil { --neon-foil-border-width: 3px; }
```

Use `color-scheme: light dark` to follow the OS, or `light`/`dark` to force a mode.
Colors and shadow pigments use `light-dark()`. Fonts are named with a sans-serif
fallback; load a custom font in the document. Generic spacing, palette, and grid
utilities are not part of this package. Documentation owns its `docs-` helpers.

## Build and verification

```sh
pnpm --filter @neon-kit/theme-vanilla build
pnpm --filter @neon-kit/theme-vanilla test
node docs/style-migration/verify-theme.mjs
node docs/style-migration/verify-theme-watch.mjs
```

The emitter owns the explicit public mapping and expands compositions through
`style-build`. CSS AST rewriting preserves states, pseudo elements, combinators,
and modifier contexts. Conflicting independent owners fail the build. Selective
outputs remove unrelated rules and unused keyframes. Local URL assets are copied
into this package, retaining query and fragment suffixes. Published CSS has no
runtime or compiler dependencies. Authored sources use unprefixed CSS; browser
compatibility transforms belong to the consumer pipeline. The documentation development server rebuilds
this output when theme sources change and updates the browser styles.
