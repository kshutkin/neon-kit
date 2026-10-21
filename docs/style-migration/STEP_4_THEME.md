# Step 4: shared theme modules and classical CSS

Completed 2026-10-10. Steps 5 and 6 remain pending.

Naming follow-up, 2026-10-21: public inputs use `--neon-*`, internal defaults
and working values use unprefixed names such as `--color-border`, and authored
CSS has no browser prefixes. Palette names use `--neon-color-blue` rather than
repeating `neon`. The historical step 4
capture artifacts retain their original property names; the executable palette
proof maps those names to the current API before comparison. Current checks are
recorded in [packed-browser results](property-api/summary.json),
[source naming contract](property-api/source-contract.json),
[watching results](property-api/watch.json), and
[catalogue comparison](property-api/image-comparison.json). The follow-up captured
96 screenshots without page errors; all image dimensions match the prior step 4
capture. Removing the vendor-only font-smoothing rule changes text rendering.

## Ownership and sources

`@neon-kit/theme` now contains 15 component CSS Modules, shared helpers/effects,
ordinary token defaults, and separate document and shadow reset sources. There
are no Tailwind directives, functions, or `--tw-*` properties in those sources.
Visual declarations are authored here; the vanilla package owns its public
selector mapping and output build.

`tokens.css` defines private defaults at `:root` and `:host`. Component declarations
read public properties such as `--neon-color-surface` with a private fallback.
`theme.css` applies the document's page colors, font family, and
`color-scheme: light dark`. Semantic colors and shadow pigments use
`light-dark()`. Numeric dark-state lightness is folded into the corresponding
color branches rather than using `light-dark()` for a number.

`shadow-base.css` supplies host font/color/line height, internal box sizing and
margins, form font inheritance, SVG defaults, focus indicators, and token defaults.
It does not assign a host scheme, load a font, or reset consumer-authored children.
The document owns font loading; the documentation loads its font explicitly.

The scheme contract is unchanged from the accepted design:

- No page declaration: components follow the browser's light default, including
  under a dark OS preference.
- `color-scheme: light dark`: opt into the OS preference.
- Root `light` or `dark`: force that mode.
- A host override applies to that host and nested shadow components.
- Public custom properties remain optional overrides, including on a host.

The obsolete separate dark stylesheet and theme aggregate entry are removed.
Classical consumers use `theme-vanilla/index.css`. The stale theme-local npm lock
and Tailwind formatter configuration are replaced by the workspace pnpm lock
and ordinary CSS formatting.

## Plain CSS output

The new `@neon-kit/theme-vanilla` package owns its build and public class catalogue.
It consumes `theme` and `style-build` as development dependencies and publishes
ordinary CSS with no runtime dependencies or required consumer plugin.

| Entry | Contents |
| --- | --- |
| `index.css` | Full document theme, reset, component markup, helpers, and effects |
| `tokens.css` | Shared token defaults and optional public overrides |
| `theme.css` | Page defaults and OS scheme opt-in |
| `reset-normalize.css` | Document reset |
| `components.css` | Complete visual catalogue |
| `effects.css` | Shared surface/state helpers and metal, foil, and glow effects |
| `components/button.css` | Buttons and variants |
| `components/forms.css` | Controls, field/fieldset, labels, hints/errors, and affixes |
| `components/overlays.css` | Dialog, details, menu, and tooltip |
| `components/navigation.css` | Vertical, tabs, and segmented navigation |
| `components/labels.css` | Keycaps, badges, and tags |
| `components/pickers.css` | Combobox, datepicker, timepicker, and referenced form rules |
| `components/table.css` | Table chrome, striping, and sorting states |
| `components/links.css` | Links |

Selective entries require one `tokens.css` import for their shared defaults.
The aggregate includes those defaults exactly once. Document theme styles and
reset remain optional imports when selecting components individually.

The build expands the core composition graph into explicit public selector aliases
using a selector AST. It rewrites classes inside nested pseudo selectors as well
as ordinary combinators, preserves contextual modifiers, and rejects independent
owners of the same public role. Public names use existing stems without a package
prefix. Consumers need no hidden composed hashes.

Selective entries include their required composed rules and default tokens,
remove unrelated selectors and unused animations, and leave document reset and
scheme opt-in explicit. All entries declare the same layer order:
`neon.theme`, `neon.reset`, `neon.components`. Aggregate/selective overlaps retain
the same class semantics in either order. Unlayered application CSS can override
them. Local URL assets are copied with package-relative URLs and preserved query
and fragment suffixes. No local source imports remain in emitted CSS.

Published files remain under `dist/`, with explicit CSS subpath exports. The
packed-consumer check runs the actual `pkgprn` prepack operation and verifies every
export target. `pkgprn --flatten dist` moves CSS without adjusting these string
exports, so this package uses the existing theme convention of plain `pkgprn`.

## Documentation and interim renderer state

The main documentation now imports the vanilla output and a finite site-owned
layout/palette helper sheet. Generic spacing, grid, and palette utilities are not
published as theme API. Effect examples use CSS properties for backgrounds and
`--neon-glow-color`, `--neon-border-color`, and `--neon-foil-border-width` customization.
The switcher cycles automatic/light/dark by changing the root's `color-scheme`,
persists explicit choices, and follows live OS changes in automatic mode.

The documentation development server rebuilds vanilla output on theme source
changes and updates browser styles. Vite uses its native Oxc JSX configuration
and restricts dependency scanning to the documentation entry.

The existing renderer catalogue still uses literal classes and light DOM. Its
main documentation temporarily uses vanilla CSS until step 5 migrates the
renderers and isolates their showcases. The already separate style-slice document
continues to demonstrate the CSS Modules boundary. Step 4's real-theme consumer
proof exercises ordinary CSS Modules and native shadow sheets directly; it does
not claim that the production renderer packages have migrated.

Tailwind's root dependencies remain for removal at the step 6 cutover. Its plugin
is removed from the main documentation build. No standalone CDN build was added.

## Validation and evidence

```sh
pnpm --filter @neon-kit/theme-vanilla build
pnpm --filter @neon-kit/theme-vanilla test
pnpm --filter @neon-kit/theme test
node docs/style-migration/verify-theme.mjs /tmp/neon-theme-proof
node docs/style-migration/verify-theme-watch.mjs /tmp/neon-theme-watch.json
pnpm build:docs

# Always capture into a new directory; preserve the historical baseline.
node docs/style-migration/capture-baseline.mjs /tmp/neon-theme-catalogue
node docs/style-migration/compare-captures.mjs /tmp/neon-theme-catalogue /tmp/neon-theme-comparison.json
```

Passed:

- Three vanilla build tests: full/selective native CSS and public selectors
  (including nested `:has()`), conflict detection, and copied URL assets.
- Three existing theme menu tests; 27 JSX and 159 web-component browser tests.
- Packed npm theme/vanilla consumers in Chromium **147.0.7727.15** and Firefox
  **148.0.2**, using Vite **8.0.10**, in development and production under both OS
  preferences. Aggregate, selected, reversed selected, ordinary CSS Modules,
  and native sheets agree on button idle/hover/focus/disabled appearance.
- Forty resolved semantic color tokens exactly match each baseline palette in
  both browsers and both schemes. Forced root modes, host overrides, nested
  inheritance, bare-page defaults, and shared sheet identity pass.
- Switcher automatic mode, saved forced modes, live OS changes, zero-valued
  primary controls, and reset pass across the same browser/build combinations.
- Documentation source editing updates the generated stylesheet and browser.
- The complete docs production build and `git diff --check`.

[Packed browser results](step-4/summary.json),
[documentation watching](step-4/watch.json),
[catalogue capture manifest](step-4/catalogue-manifest.json), and
[pixel comparison](step-4/image-comparison.json), and
[source hashes](step-4/source-hashes.json) record the checks.
Selected current views: [light button focus](step-4/light/buttons-interaction.png),
[dark button focus](step-4/dark/buttons-interaction.png), and
[dark datepicker states](step-4/dark/datepicker-interaction.png).

The catalogue comparison covers the baseline's **31 routes × 2 schemes** and
**96 screenshots**, including interaction captures, with no uncaught page errors.
Dimensions match in 94 images; the two utility-page heights change because their
usage snippets were rewritten as plain CSS. Pixel metrics include those text
changes and are a review aid, not a pixel-perfect assertion. Native dark controls
now follow the root scheme, and dark segmented navigation applies its intended
primary thumb rule in the component layer; the old dark rule was in the lower
priority theme layer. Dark shadow pigments also follow the translated token pairs.
Outside the two explanatory showcase pages, the largest changed-pixel fraction
is 2.091%, on the typography page with native controls. Picker disabled states
were checked after fixing generated names inside vanilla `:has()` selectors.

Vite still reports the existing static/dynamic icon import warnings and preserves
`@position-try` rules with Lightning CSS's unknown-at-rule warning. These are not
build failures. Component-specific shadow/form/accessibility gates remain step 5.
