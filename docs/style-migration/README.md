# Style migration baseline — step 1

Captured on 2026-10-07, before changing any theme rules or component rendering.
The accepted direction is [ADR 0002](../adr/0002-shared-css-modules-and-shadow-dom.md);
the [public CSS policy](PUBLIC_CSS_API.md) records the vanilla class contract.
This evidence records the existing implementation for comparison during
steps 2–6 of the [migration plan](../STYLE_SYSTEM_MIGRATION_PLAN.md).
The completed [step 2 proof](STEP_2_PROOF.md) records packed-consumer, shared
sheet, plain CSS, and scheme-inheritance results in Chromium and Firefox.

## Evidence

| Artifact | Contents |
| --- | --- |
| [baseline/manifest.json](baseline/manifest.json) | Source revision, capture time, tool/browser versions, viewport, fixed date, font policy, and complete screenshot list |
| [baseline/sources.json](baseline/sources.json) | Exact source text and SHA-256 hashes for theme CSS, documentation markup/scripts, component/controller sources, build config, package manifests, and lockfile |
| [baseline/inventory.json](baseline/inventory.json) | Every authored CSS rule selector, custom-property declaration, and directive with its source line and enclosing scope |
| `baseline/{light,dark}/<route>.json` | Rendered markup, used class names, computed root tokens, current host rendering mode, focus, and open popovers for that route |
| `baseline/{light,dark}/<route>.png` | Full-page idle screenshot |
| `baseline/{light,dark}/<route>-interaction.png` | Viewport screenshot after the recorded hover, focus, or click action |

The capture covers **31 routes × 2 themes**, with **96 screenshots**:
62 full-page idle views and 34 interaction views. About, Getting Started, and
the general icon browser are excluded from screenshots; their authored
section markup is still captured. The icon web-component examples are
included. Every captured route completed without an uncaught page exception.

Quick visual references:

- Buttons: [light](baseline/light/buttons.png), [dark](baseline/dark/buttons.png),
  [keyboard focus](baseline/light/buttons-interaction.png).
- Forms: [light](baseline/light/forms.png), [dark](baseline/dark/forms.png).
- Menu: [plain CSS](baseline/light/menus-interaction.png),
  [web component](baseline/dark/wc-menu-interaction.png),
  [JSX](baseline/light/jsx-menu-interaction.png).
- Tooltip: [web component](baseline/light/wc-tooltip-interaction.png),
  [JSX](baseline/dark/jsx-tooltip-interaction.png).
- Generated controls: [single combobox](baseline/light/wc-combobox-interaction.png),
  [multiple combobox](baseline/dark/wc-multicombobox-interaction.png),
  [datepicker](baseline/dark/wc-datepicker-interaction.png),
  [timepicker](baseline/light/wc-timepicker-interaction.png).

## Current style catalogue

There are 15 component stylesheets. Counts below are authored PostCSS rule
nodes, including nested selectors, rather than flattened emitted selectors.
The full theme has 309 such rules; documentation shell CSS adds eight.

| Source under `theme/` | Rules | Current responsibilities |
| --- | ---: | --- |
| `components/button.css` | 6 | `.btn`; quiet, large, CTA, grouped edges |
| `components/links.css` | 1 | `.link` |
| `components/dialog.css` | 10 | `.dialog`, header/body/footer, sizes, backdrop |
| `components/details.css` | 17 | Native disclosure, body/meta, open/focus/disabled states |
| `components/menu.css` | 17 | Menu rows, groups, shortcuts, icons, placement |
| `components/nav.css` | 17 | Navigation rows, vertical/tabs/segmented layouts, active state |
| `components/kbd.css` | 3 | Keycaps, key combinations, separators |
| `components/badge.css` | 7 | Badge, dot, semantic variants |
| `components/tag.css` | 11 | Tags, removal control, lists, semantic variants |
| `components/table.css` | 14 | Table chrome, striping, sortable headers |
| `components/forms.css` | 34 | Inputs, checkbox/radio, fieldset, field labels/hints/errors, affixes |
| `components/combobox.css` | 35 | Single/multiple fields, lists, search, values, clear/create/footer controls |
| `components/datepicker.css` | 37 | Field, navigation, day/month/year grids, range states |
| `components/timepicker.css` | 29 | Field, time/timezone lists, combined date-time layout; reuses combobox rows |
| `components/tooltip.css` | 12 | Popover, arrow, rich content, placements and flip rules |
| `utilities.css` | 28 | 14 Tailwind utility definitions and nested state/effect rules |
| `reset-normalize.css` | 23 | Document and element reset |
| `theme.css` | 4 | 57 default custom-property declarations, typography, body, links, focus ring |
| `theme-dark.css` | 4 | 41 override declarations and dark segmented-navigation treatment |

`index.css` owns imports and the cascade layer order
`theme, base, components, utilities`; `components.css` owns the 15 component
imports. The index also imports Tailwind theme/utilities and Google Fonts.
The catalogue includes rules that Tailwind emits only when found in content;
the vanilla catalogue must ship all public rules independently of content
scanning. The snapshot preserves those source declarations even if a computed
root token is empty because the current build pruned it.

### Tokens and theming

- Neutral and surface controls: `--neutral-hue`, `--neutral-chroma`,
  `--surface-chroma`, neutral/surface colors, and hover/active/disabled roles.
- Primary and accent controls: primary lightness/chroma/hue, accent hue offset,
  primary states, borders, and focus colors.
- Ink roles: primary, secondary, muted, inverse.
- State colors: success, warning, error, info, soft colors, and normalization
  controls (`--state-target-lightness`, `--state-chroma-scale`).
- Depth/effects: drop and inset shadows, embossed/debossed text, Neon effects,
  foil/metal, and animation rules.
- Component-local properties: menu placement and tooltip arrow/placement
  values. These are included with their selector scope in the inventory and
  are distinct from document tokens.

The current dark stylesheet changes both colors and numeric/whole-property
values. It also changes active segmented navigation beyond token overrides.
These differences must be translated deliberately when switching to
`light-dark()`. The snapshot captures both default light and dark rendering;
the new inherited scheme contract remains a later browser acceptance gate.

### Markup and behavior boundaries

| Renderer/component | Current DOM and styling dependency | Migration check |
| --- | --- | --- |
| WC tooltip | Host is the popover; authored content stays under its trigger; generated arrow uses a literal class | Host/trigger relationship, rich content, positioning, projected content |
| WC menu/menu item | Authored custom-element rows; host/tag selectors identify owned items and coordinate nested targets | Ordering, roving focus, target tree, event paths; detailed slot/parts design deferred |
| WC combobox/multicombobox | Authored direct `<option>` children; generated fields/lists/tags use literal class constants | Options remain readable, internal queries, selection/keyboard behavior, form internals |
| WC datepicker/timepicker | Generated fields and popovers use class constants; timepicker shares combobox option styles | Form APIs, validity anchors, ARIA targets, focus and calendar/time navigation |
| WC icon | Inline SVG in light DOM inherits color and sizing | Inherited color and sizing after moving internals |
| JSX tooltip/menu | Native elements and popovers; class strings and controller selectors use the global theme names | Component CSS imports and class maps must agree with controller selectors |
| Plain HTML | Classes plus native/ARIA attributes; generic Tailwind utilities currently supply example layout | Use the vanilla public class mapping; move example layout to site-owned CSS |

All captured Neon hosts report `shadowRoot: false`. Generated markup and
controller source are preserved so changes to IDs, query roots, ARIA
relationships, and literal class dependencies can be traced during migration.
The current menu controller already receives renderer-provided selectors;
JSX supplies `.menu`/`.menu__item` while WC supplies tag selectors. Preserve
that boundary when introducing generated class strings.

## Reproducing the capture

From the repository root, with the lockfile dependencies and Playwright
Chromium installed:

```sh
node docs/style-migration/capture-baseline.mjs /tmp/neon-style-comparison
```

The output directory must not exist. Keep `baseline/` as historical evidence;
write subsequent captures elsewhere and compare corresponding routes. The
tool uses the repo's Vite config and CSS parser, starts a local development
server, captures the sources and DOM, and closes the browser/server. Vite and
Playwright remain existing root development dependencies. The JSX menu demo
currently resolves its package `dist/menu.js`, unlike the tooltip's source
alias; that exact built file is included in the source snapshot.

Capture settings:

- Chromium 147.0.7727.15 / Playwright 1.59.1; Vite 8.0.10 / PostCSS 8.5.12.
- 1440 × 1000 viewport, device scale 1, `en-US`, Europe/Berlin timezone.
- Fixed application date: 2026-10-07 12:00 UTC; reduced motion; screenshot
  animations disabled.
- Fresh browser context per mode; explicit persisted `light`/`dark` setting;
  untouched primary color defaults.
- Google Fonts requests return empty CSS so screenshots consistently use the
  system sans-serif fallback. A loaded Hanken Grotesk font comparison remains
  a separate typography check during theme cutover.

## Validation and limits

- `pnpm build:docs` passes. Existing warnings remain for `@position-try` CSS
  optimization and icons imported both statically and dynamically.
- The baseline is development-site evidence, not packed-package or new
  native-sheet output validation. It covers representative interactions and
  authored state examples, not every keyboard, validity, or nested-menu path.
  Existing component tests remain the behavioral reference for those paths.
- Capture checks uncaught page exceptions and waits for rendered JSX/icon
  demos and open popovers; it is not an accessibility audit.
- Supported migration engines are Chromium and Firefox per ADR 0002.
  Chromium is captured here. The local Playwright Firefox executable is not
  installed; Firefox migration acceptance is still pending.
- Source hashes identify the captured implementation independently of later
  documentation edits. Runtime/theme migration starts in subsequent steps.
