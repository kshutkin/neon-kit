# Shared style slice — step 2

Completed on 2026-10-09. This proves the delivery contracts in
[the migration plan](../STYLE_SYSTEM_MIGRATION_PLAN.md) with a small field/button
and a lazily loaded card. The full theme and component catalogue migrate in
later steps.

## Implementation

| Location | Responsibility |
| --- | --- |
| [`vite-plugin-style-build/`](../../vite-plugin-style-build/README.md) | Initial separate Vite package; normal dependency on `style-build`, Vite peer dependency |
| [`tests/fixtures/theme/`](../../vite-plugin-style-build/tests/fixtures/theme/) | Shared surface/control/card CSS Modules and a shadow-only base/reset |
| [`tests/fixtures/jsx/`](../../vite-plugin-style-build/tests/fixtures/jsx/) | Packed JSX component entry imports ordinary CSS Modules; renders in light DOM |
| [`tests/fixtures/web/`](../../vite-plugin-style-build/tests/fixtures/web/) | Packed source web components use `?neon` class exports and ordered sheets with `shadowStyles()` |
| [`tests/fixtures/vanilla/`](../../vite-plugin-style-build/tests/fixtures/vanilla/) | Separate fixture package with its own build; emits aggregate and selective plain CSS |
| [`tests/style-slice.mjs`](../../vite-plugin-style-build/tests/style-slice.mjs) | Packs and installs an isolated consumer, inspects assets, runs browser assertions |
| [`site/style-slice/`](../../site/style-slice/) and [`vite.style-slice.config.mjs`](../../vite.style-slice.config.mjs) | Separate documentation build with no document Neon theme or reset |

The renderer and theme packages above are private proof fixtures. The plugin is
a new workspace package with the repo's source exports, declaration build, and
packing conventions. The compiler core required no changes for this slice.

## Proven package and import contract

Retain the name `@neon-kit/vite-plugin-style-build` and the `styleBuild()` plugin
factory. Retain `.css?neon` as the native-sheet opt-in: named CSS Modules class
strings plus an ordered `sheets` export. Reserve `sheets` as a class export name.
JSX uses ordinary `.module.css` default imports and needs no native-sheet plugin.

The packed consumer installs theme, JSX, web, vanilla, compiler, plugin, and
runtime tarballs. Its primary build uses package exports without workspace
source aliases. A second JSX-only configuration passes without `styleBuild()`.
Separate watching and documentation fixtures use source aliases intentionally;
they do not substitute for the packed-consumer gate.

`@slimlib/element@0.4.1` in the current registry lacks `shadowStyles()`. The proof
packs the local Slimlib candidate from `../slimlib/element`, replacing workspace
peer ranges with the concrete installed JSX/store versions in the temporary
copy. A published runtime with that API remains a release prerequisite. No
runtime source is copied into Neon or modified by this proof.

## Final browser assets

A production build emits this graph (hashes and ordinary Vite chunk names vary):

```text
assets/
  shadow-base.<hash>.css
  surface.module.<hash>.css
  control.module.<hash>.css
  card.module.<hash>.css
  <entry>.styles.<hash>.js       # native CSS imports + class strings + sheets
  <entry>.styles.<hash>.js
  <entry>.styles.<hash>.js
  main-<hash>.js
  card-<hash>.js                # lazy component
  main-<hash>.css               # normal JSX CSS Modules output
  vanilla-<hash>.css            # separate HTML entry only
```

Exactly **four native CSS assets** are referenced. A control adopts base,
surface, and control sheets; a card adopts the same base and surface objects
plus its card sheet. Instances and lazy/nested components share these objects.
Shadow rules are absent from document stylesheets. Final native CSS contains
neither `composes` nor `@import`; final browser JS contains no `?neon` or internal
adapter markers.

Vite strips native CSS import attributes when it processes JavaScript facades
as regular modules. The adapter therefore emits those facades as raw JavaScript
assets, preserving typed imports and relative CSS URLs. Development serves raw
JavaScript/CSS endpoints with the correct MIME types. The browser does the
native sheet loading; there is no runtime compiler or composition traversal.

For ordinary JSX CSS, use `build.cssTarget: ['chrome128', 'firefox128']` in this
proof. Vite's default CSS lowering replaces `light-dark()` with helper variables;
the dynamically inherited `color-scheme` contract then fails in production.
Preserving the native function passes the same scheme assertions in both
renderers. Native-source packages are excluded from dependency prebundling;
broader optimizer integration remains step 3 work.

## Vanilla emitter finding

The separate vanilla fixture builds from the same module graphs. Its explicit
mapping is `control → field`, `input → input`, `action → btn`, and `card → panel`.
It aliases **every class in each expanded composed export**, rather than only
the leaf class. Shared rules use `:is()` over the mapped public roles, preserving
class specificity for these single-class names. State and descendant selectors
remain selectors over public classes. No generated names are needed in HTML.

The aggregate deduplicates the shared module. `control.css` and `card.css` include
their dependency closures and only their selected public roles. Overlapping
shared declarations are identical for this graph. Duplicate public-role mappings
to different exports are rejected. Visual declarations stay in the theme sources.

This validates alias generation as an emitter approach for **single public
classes and this composition/state graph**. The full catalogue's base-plus-variant
combinations, private helpers, complex selectors, layers, and selective group
ordering still need step 4 policy and tests. The fixture is not the production
`theme-vanilla` catalogue package.

Vanilla examples have their own HTML document. The packed CSS also passes when
served verbatim through a `<link>` without Vite or JavaScript, including selective
CSS that leaves an unselected card unstyled. No vanilla stylesheet is loaded by
the shared CSS Modules documentation fixture.

## Browser acceptance

Vite **8.0.10**, Playwright **1.59.1**, Chromium **147.0.7727.15**, Firefox
**148.0.2**. The automated checks pass in development and production:

| Gate | Result |
| --- | --- |
| Cross-file composition in shadow and ordinary JSX CSS Modules | Pass |
| JSX component entry imports CSS; JSX-only app has no native-sheet plugin | Pass |
| Correct native CSS MIME types and deployable relative asset references | Pass |
| Shared base/surface assets and sheet objects across instances and lazy entries | Pass |
| No global theme/reset required; shadow CSS does not leak into document styles | Pass |
| Unstyled page stays light under light and dark OS preferences | Pass |
| Root `light dark` follows both preferences; forced root light/dark wins | Pass |
| Forced host choice and nested shadow inheritance | Pass |
| Inherited public border override | Pass |
| Internal form-control font inheritance and keyboard focus ring | Pass |
| Focus-within descendant selector; unrelated JSX control unaffected | Pass |
| Vanilla composed styles, hover, disabled, descendant state selectors | Pass |
| Aggregate/selective packed vanilla CSS through a plain `<link>` | Pass |
| Filesystem edit refreshes native and JSX styles (Chromium development) | Pass |
| Isolated documentation output, both engines and both OS preferences | Pass |

Screenshots below show the end of the checks: root forced dark, first host forced
light, an inherited border override, and lazy/nested cards. They are fixture
evidence, not replacement snapshots for the current Neon theme.

- [Documentation fixture, Chromium](step-2/docs-chromium-dark.png)
- [Documentation fixture, Firefox](step-2/docs-firefox-dark.png)
- [Classical CSS with focus/disabled state, Firefox](step-2/classical-firefox-vanilla.png)
- [Recorded browser/output versions](step-2/summary.json)

## Reproduce

```sh
pnpm install
pnpm exec playwright install chromium firefox
pnpm test:style-slice
pnpm dev:style-slice
pnpm build:style-slice-docs
```

The latter two commands use the dedicated documentation fixture at
`/neon-kit/style-slice/`. Set `NEON_SLIMLIB_ELEMENT` to a candidate package
directory if it is not at the default sibling path. The test preserves tarballs,
the installed consumer, output assets, logs, and screenshots in its reported
temporary directory. It uses registry access for the isolated install.
This proof has its own `test:style-slice` script so the normal recursive test
command does not acquire a dependency on the unpublished sibling runtime.

The regular `build:docs` still builds the current documentation. Its existing
CSS optimization and static/dynamic icon import warnings remain. No standalone
CDN distribution is introduced here.

## Remaining work

Step 3 extends the initial plugin/core boundary with asset URL rewriting,
source maps, typed authoring exports, and more complete optimizer/development
integration. The initial adapter rejects asset `url()` references and SSR, and
uses full-page reloads for native style edits. Step 4 generalizes the vanilla
emitter and translates the real theme; step 5 changes actual component rendering.
Full component accessibility, form internals, slots, parts, and popover behavior
are not demonstrated by this small generated-control fixture.
