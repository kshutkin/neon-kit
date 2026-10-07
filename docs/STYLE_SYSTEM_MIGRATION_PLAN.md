# Neon Kit style and rendering migration

Status: accepted migration direction. Step 1 completed on 2026-10-07;
steps 2–6 are pending.

The old global selector API does not need compatibility: Neon Kit has not yet
been released. JSX components should import their own CSS Modules through
Vite's normal handling. A separate `@neon-kit/theme-vanilla` package should
build plain CSS supporting the full current theme
for hand-written HTML, including buttons, forms, menus, and the other styled
markup. Web components can keep the Chromium and Firefox target of the native
CSS import design; Safari is outside this release target. Consumer-authored
children remain in light DOM and are projected through slots. Detailed slot
and parts APIs are deferred; they are not decisions or tooling requirements
in this plan. Vite is the only supported bundler in this migration.

## Goal

Remove Tailwind from Neon Kit's published styles and build, author reusable
component styles as CSS Modules, render web component internals in shadow DOM,
and keep JSX components in light DOM while sharing the same visual rules.

## Current constraints

- `@neon-kit/theme/index.css` imports Tailwind's theme and utilities, the
  package ships source CSS, and its component sheets use `@apply`, `@utility`,
  `@theme`, and Tailwind's `--spacing()` function. The documentation site also
  uses Tailwind utilities in HTML and CSS. Removing the dependency requires
  translating these declarations and the site markup, then comparing the
  rendered result with the current theme.
- Web and JSX components use literal class names, including names embedded in
  DOM queries and controller selectors. The web components currently render in
  light DOM. `docs/adr/0001-rendering-mode.md` explicitly chose that mode and
  must be superseded when the new behavior is accepted.
- `@neon-kit/style-build` currently compiles separate CSS assets and class
  strings, but does not emit library artifacts, JS facades, rewritten asset
  URLs, source maps, or bundler adapters. The current installed
  `@slimlib/element@0.4.1` lacks `shadowStyles()`; the local Slimlib source has
  it. A packaged version with that API is a prerequisite for a release.
- Menu and tooltip accept consumer-authored children. Comboboxes read light-DOM
  `<option>` children. Datepicker, timepicker, and combobox use form internals,
  anchor positioning, and popovers. Their shadow migration needs DOM and
  accessibility design, not only new styles.

## Style delivery choices

| Choice | JSX light DOM | Web component shadow DOM | Main tradeoff |
| --- | --- | --- | --- |
| A. Bundler-native CSS Modules for JSX (accepted) | Publish `.module.css` and let Vite's normal CSS Modules pipeline compile it | Publish source styles and use a separate Vite plugin package depending on `style-build`; exercise it first in the documentation build | Less publish-time transformation. App consumers need the web-component plugin; the docs build and packed consumer need final-output checks. |
| B. Precompile both channels with `style-build` | Publish ordinary CSS assets, generated class-string exports, and side-effect CSS imports from JSX component entries | Publish compiled CSS assets and typed CSS imports adopted by each root | One compiler contract, but current Vite still cannot consume typed CSS imports as native sheets without an adapter or deliberate externalization. Requires a light-DOM emission mode and more package asset work. |
| C. Author plain, namespaced CSS | Publish plain CSS and use stable class strings | Compile plain CSS with `style-build` into shadow sheets | Least tooling, but gives up CSS Modules composition and local names. Shared sheets and selectors need manual naming discipline. |

Choose A for the npm/Vite path. Vite already
handles JSX `.module.css` imports, while its normal CSS handling does not
necessarily preserve native typed CSS imports as `CSSStyleSheet` values.
Precompiling web components therefore does not remove the main integration
problem. For example, Vite 8.0.10 strips `with { type: 'css' }` in development
and fails to bundle a default import from the CSS file in production. The
web-component adapter should compile source styles and integrate the resulting
native sheets with Vite's development and production graphs. Other bundler
adapters are outside this plan.

The app-side configuration for A and B may both be a single adapter, but
their adapter implementations are different. A must resolve and compile
CSS Modules in the consumer graph; B can start from compiled assets but must
preserve their native import semantics and deployable URLs. Externalizing a
precompiled web-component package can avoid CSS transformation only if the
deployed browser can resolve all remaining JS and CSS imports. A small Vite
consumer proof is needed before treating either route as simple.

There is no separate CDN or browser-direct web-component build in this plan.
The documentation site already builds web-component examples with Vite, so it
is the first real browser build for the adapter. Its output should contain
final JS and CSS assets, including a shared shadow base sheet. This proves
the browser-facing sheet graph and adoption behavior, but the site currently
aliases workspace source modules and cannot by itself prove that published
package exports work; the packed Vite consumer remains a separate gate. A
future CDN distribution could reuse the compiler and component styles, but
would need its own URL, dependency, MIME-type, and import-attribute checks.
No public intermediate shadow CSS files in `@neon-kit/theme` are required.

CSS Modules are the source authoring syntax for scoped class names and
`composes`. Native CSS module scripts are a separate browser feature that
loads a compiled `.css` file as a `CSSStyleSheet`; they do not compile CSS
Modules syntax or supply a class map. Import maps only map JavaScript module
specifiers to URLs. They neither load nor apply CSS, so they are not a style
delivery mechanism for the JSX package.

## Proposed boundaries

### Package ownership

| Package | Owns | Dependency boundary |
| --- | --- | --- |
| `@neon-kit/theme` | Shared CSS Modules, token defaults, document and shadow reset sources, and visual effects | Source styles consumed by renderer packages and the vanilla build; no classical CSS bundle or public HTML class contract |
| `@neon-kit/theme-vanilla` | Its own build, public HTML class names, aggregate CSS, and selectable plain CSS entries | Consumes theme sources during its build; publishes ordinary CSS and any referenced assets, with no consumer compiler or plugin requirement |
| `@neon-kit/style-build` | Vite-independent CSS compilation, class exports, and sheet dependency graph | Does not emit Vite assets or depend on Vite |
| `@neon-kit/vite-plugin-style-build` (provisional name) | Vite resolution, watching, development updates, JS facades, CSS/URL asset emission, and final native sheet imports | Normal dependency on `@neon-kit/style-build`; peer dependency on supported Vite versions |

The existing compiler's `read`/`resolve` host and graph return value support
this separation. The Vite plugin supplies the host and emits the returned
modules into Vite's graph. No technical constraint requires it to live inside
`style-build`. The documentation application installs and configures the
plugin as build tooling; published web components do not need either compiler
package at runtime. JSX imports use Vite's normal CSS Modules handling.

The vanilla build may reuse the shared compiler where its graph and class
data are useful, but public selector generation and aggregate/selective CSS
emission belong to `theme-vanilla`. The core currently has no configurable
class naming or vanilla emitter, so this reuse needs a build proof rather
than assuming the shadow output already implements the public HTML API.
Compiler tools and theme sources are build-time dependencies of the vanilla
package; its emitted CSS must not require fetching sources from `theme`.

### Source and rendering boundaries

1. Convert Tailwind `@theme` values into normal custom-property declarations
   with both document and shadow outputs. The document owns font loading and
   its own reset. Each web component adopts a shared shadow base sheet with
   light and dark token defaults and the reset rules needed by its internal markup,
   so a component renders without the page theme CSS. The shadow
   sheet may read inherited public custom properties as optional overrides;
   keep these names distinct from the internal default variables. Do not
   inject fonts or document rules from a component.
2. Put reusable visual rules in component-level `.module.css` sources. Keep
   selectors within one styling tree where possible. Use `composes` and local,
   unconditional `@import` only where their dependency order is intentional.
   Put shadow host rules in small shadow-only sheets; put
   light-DOM root or document selectors in light-only sheets. The shared rules
   must not depend on `:host`, `::slotted`, or document-level selectors.
3. Use the consumer bundler's CSS Modules exports for JSX class strings. Use
   `style-build` for web-component class strings and dependency-ordered sheets
   adopted through `shadowStyles(sheets)`. Class names may differ between
   renderers; each must match its own emitted CSS. Keep shared source within
   the CSS Modules features both paths implement consistently, especially
   `composes`, and prove that with a cross-renderer fixture. Behavior
   controllers receive selectors from their rendering adapter rather than
   assuming literal theme class names.
4. Make each JSX component entry import its `.module.css` and use the returned
   class map. Mark CSS as a package side effect where needed and verify that
   package exports expose the source CSS required by the consumer bundler.
   Include the common token defaults needed to render that component without
   requiring the aggregate theme import; allow consumer overrides to cascade
   through normal custom properties.
5. Build the full classical HTML stylesheet in `theme-vanilla` from the same
   visual sources, with selectable CSS entries. Keep docs-only layout CSS in
   the site. Translate Neon-specific visual utilities such as foil and glow
   into shared ordinary CSS rules and expose their public forms through the
   vanilla package. Recreating Tailwind's generic utility catalogue is not
   required.
6. The separate Vite plugin preserves each required shadow sheet as a distinct
   asset and produces working native sheet imports in the documentation and
   packed-consumer browser output. Keep generated component class names
   internal. Inherited public custom properties provide the current
   customization contract; detailed slots and parts design remains future
   work. The shadow boundary changes what page CSS can style.

### Shadow base and reset

The current `reset-normalize.css` has 23 rule blocks. Nineteen use only
element or attribute selectors and can technically apply to nodes inside a
shadow root. The `*` rule also applies there after splitting out
`::backdrop`. The `:root` and `body` rules are document rules; `:host` must
carry any corresponding component defaults. Moving the entire file into each
root would leave dead rules and would still miss consumer-authored slotted
content.

| Destination | Current rules | Reason |
| --- | --- | --- |
| Shared shadow base | Internal `box-sizing` and margin reset; host line height; form-control font inheritance; SVG defaults; internal `:focus-visible` ring | Generated buttons, inputs, SVGs, and popovers need these without global CSS. Keep low-specificity reset selectors before component sheets. |
| Component sheet when used | Media alignment, headings and paragraphs, `hr`, table, fieldset, textarea, legend, picture/source/audio/iframe, sub/sup, busy and disabled cursors, popover backdrop | These are valid in shadow DOM but need only be shipped where the component actually creates such nodes. Some states also need host-specific selectors. |
| Document styles only | `:root` smoothing and viewport/text adjustment, `body` defaults and background, document focus ring, font loading | Theme owns document CSS sources; `theme-vanilla` emits their plain CSS entries. The page owns font loading. A shadow stylesheet cannot apply document rules. |
| Authored light-DOM children | No blanket shadow reset | `*` inside the shadow root does not select assigned children. `::slotted()` reaches only assigned elements, not arbitrary descendants; rich menu and tooltip content needs explicit slot styling or consumer CSS. |

Have the documentation build emit one `shadow-base.<hash>.css` asset alongside
the final web-component JS and leaf CSS assets. Each component imports and
adopts that same sheet before its own sheet. This shares one URL and
stylesheet object across components and instances while keeping their
default rendering independent of the page theme. The asset is final build
output, not an intermediate public theme file. A later CDN build can choose
its own packaging without changing the reset and token source boundaries.

The shadow base should include token defaults used by all leaf sheets. For a
public override such as `--neon-primary`, derive an internal default with
`var(--neon-primary, light-dark(<light color>, <dark color>))`; do not assign a default
to the public variable in the shadow sheet, which would mask an inherited
page override. The component's standard appearance must work with no page
variables. Page variables and host attributes can then customize
it. Font loading stays document-owned; shadow CSS can name a font family with
a reliable fallback but cannot assume the custom face was loaded.

Lit is a useful model for sharing scoped styles, but its documented theming
also uses inherited CSS custom properties with local fallbacks. The target is
self-contained default rendering with optional inheritance for customization,
not a shadow tree isolated from inherited values.

### Native color-scheme contract

Replace the current `[data-theme="dark"]` selectors and the documentation
switcher's attribute/class toggles with `color-scheme`. The document theme
declares `color-scheme: light dark` at its root to opt into the OS preference;
an explicit `light` or `dark` root value forces a mode. Web components do not
declare a scheme on their hosts; they inherit the page's used scheme. A
consumer can set `color-scheme` on one host to override it for that component
and its descendants. The documentation switcher changes the root property
between `light dark`, `light`, and `dark`, with no Neon-specific scheme
variable.

On a page that makes no scheme declaration, the browser uses its default
light scheme even if the OS prefers dark. The component follows that page
choice. This matches the drop-in goal: a component should not impose a dark
appearance on a page that has not opted into one. `light-dark()` follows the
element's used scheme; it does not decide whether the page or OS has priority.
An unconditional host `color-scheme: light dark` would override an ancestor's
forced scheme, so the shared shadow base must not add one. Do not use a
preference media query as a substitute: it would not follow a manual page or
host override.

Use `light-dark()` for semantic colors and color portions of shadows, focus
rings, and other effects. It selects by each element's used color scheme, so
it also follows an explicit host override. The current dark stylesheet has
numeric and whole-property token differences; translate those into final
color pairs where possible rather than assuming `light-dark()` can select
arbitrary numbers or declaration blocks. Reserve
`@media (prefers-color-scheme: dark)` for behavior intentionally tied to the
user preference: it does not track a manual `color-scheme: dark` on the root
or one host. Validate the translated palette against the current light and
dark snapshots.

### `@neon-kit/theme-vanilla` output and public class names

This package has its own build consuming `theme` modules. Consumers receive
ordinary stylesheets usable through `<link>` or a normal bundler CSS import.
They do not compile CSS Modules or install the web-component Vite plugin to
use this package. The aggregate entry covers the full current theme: tokens,
document reset, component markup, and Neon visual effects. Fonts remain a
document concern.

A provisional export layout, following the repo's explicit CSS subpaths, is:

| Export | Contents |
| --- | --- |
| `@neon-kit/theme-vanilla/index.css` | Full classical theme |
| `@neon-kit/theme-vanilla/theme.css` | Document token defaults and color-scheme opt-in |
| `@neon-kit/theme-vanilla/reset-normalize.css` | Document reset |
| `@neon-kit/theme-vanilla/components.css` | All public component markup styles and required shared visual rules |
| Selected `@neon-kit/theme-vanilla/components/<group>.css` entries | A small set of useful component groups, with their required style dependency closure |

The precise group list is deferred until the catalogue is inventoried. A
consumer can include the full entry or select tokens, reset, and the component
groups it needs, similar to today's theme imports. Selective component outputs
include required composed rules and defaults; global reset and document
scheme opt-in remain explicit choices. Define load order and overrides for
these entries and keep overlapping entries equivalent in cascade behavior.
Flatten local dependencies for the initial plain CSS outputs; reference only
assets shipped in this package. Native sheet chunks are a separate Vite
output contract and are not vanilla package exports.

A compiled CSS Modules sheet can contain ordinary CSS, but its generated
class names are not automatically a usable hand-authored HTML API. In
particular, `composes` makes a JS export contain several class names while
the emitted CSS keeps the rules separate. A classical CSS bundle therefore
needs a deliberate public class contract owned by `theme-vanilla`: use
predictable, documented names for public markup classes, or add explicit
aliases built from the same style sources. Keep private component classes
free to use generated names. Public classes must not have hidden `composes`
requirements. This needs a small build proof before settling the
emitter strategy. The accepted [public CSS policy](style-migration/PUBLIC_CSS_API.md)
uses the existing component/element stems and family modifier conventions,
with no required package prefix; consumer CSS collisions are accepted.
CSS Modules exports remain scoped even when components expose or consume their
class strings. Vanilla documentation examples use separate documents from
CSS Modules component examples, with no globally loaded vanilla catalogue in
the shared shell. Trial an explicit mapping from documented public classes
to source module exports, including composed rules and pseudo/state selectors.
The vanilla build must produce a complete usable public class, or document an
intentional public base-plus-variant combination; generated hashes must not
be required in hand-written markup. A compiler naming policy or generated
alias stylesheet are possibilities to validate. Do not constrain renderer
module class names to the vanilla public API before this proof. Visual
declarations stay in theme sources rather than being duplicated manually in
the vanilla package.

## Component-specific design gates

- **Tooltip:** its host is currently the popover and its content is authored
  by the consumer. Keep the authored content in light DOM and project it into
  the shadow root. Trial the host remaining the popover so its external
  trigger stays in the same tree. Check positioning and rich content.
  Detailed slot styling and API
  choices are deferred.
- **Menu and menu item:** the menu controller discovers user-authored child
  elements, and items may target popovers elsewhere in the page. Keep those
  children in light DOM and preserve ordering, nested menus,
  and focus. Slot and parts API design is deferred. A shadow sheet cannot
  select arbitrary descendants of their light-DOM markup. Keep external
  popover targets in their original tree unless explicitly redesigned.
- **Combobox, multi-combobox, datepicker, timepicker:** keep public option and
  form APIs while moving generated field and popover nodes into one shadow
  root. Verify `popovertarget`, ARIA references, anchor positioning,
  `ElementInternals.setValidity()` anchors, focus, and reset behavior in
  Chromium and Firefox. Do not assume that document-level class queries or
  selectors continue to find internal nodes.
- **Icon:** verify SVG sizing and inherited color if it becomes shadow-internal.
  A public parts API is future work.

## Staged change plan

1. **Record the baseline.** Capture the current selectors, tokens, component
   markup, and screenshots as migration evidence. Decide the new plain CSS
   class API and supported browsers. Supersede the rendering ADR with the
   accepted direction; preserving old selectors is not a requirement.
   **Completed 2026-10-07:** [baseline evidence](style-migration/README.md),
   [public CSS policy](style-migration/PUBLIC_CSS_API.md), and
   [superseding rendering ADR](adr/0002-shared-css-modules-and-shadow-dom.md).
2. **Prove one vertical slice.** Exercise a small shared style fixture with
   a generated control in a shadow web-component build and a light-DOM JSX
   build. This validates the build contracts without settling tooltip/menu
   slot or parts APIs. Include composition, inherited theme override, lazy
   loading, a classical HTML page using the vanilla package, a packed JSX
   consumer with its CSS imported by the component entry, and a Vite app
   consumer of the web
   component through the adapter. Add an isolated documentation-build fixture
   with no global Neon theme or reset; verify the web component's internal
   focus, form controls, and light colors under both OS preferences. Then opt
   the page into `color-scheme: light dark` and check both OS preferences;
   exercise forced page and per-host choices separately. Load a
   second component to verify that both use the same shadow base asset.
   Inspect final development and production browser output before choosing
   the remaining package API. Keep vanilla fixtures in a separate document
   from CSS Modules showcases; client-side route changes alone must not retain
   vanilla CSS in component examples.
3. **Extend `style-build` and add the Vite package.** Add compilation data
   needed for source maps, URL references, and typed authoring exports to the
   core. Implement Vite asset emission, URL rewriting, and integration in
   `@neon-kit/vite-plugin-style-build`, depending on the shared core.
   Build and test this plugin against published source package exports;
   account for dependency prebundling, lazy entries, development updates, and
   final CSS asset URLs. Keep the compiler as the authority for
   web-component class strings and sheet dependencies. Use the documentation
   Vite build as the first end-to-end asset graph and browser test.
4. **Translate theme CSS and add `theme-vanilla`.** Replace Tailwind directives
   and functions with ordinary CSS. Keep tokens, document/shadow reset sources,
   component modules, and effects in `theme`. Give `theme-vanilla` its own
   build producing the aggregate and selected plain CSS exports, including
   its public class mapping and composed dependencies. Replace the separate
   attribute-driven dark stylesheet with
   `light-dark()` color pairs and the inherited scheme contract. Move docs-site
   utility markup to site-owned styles, and migrate the documentation switcher
   from `data-theme` to root `color-scheme`. Compare
   automatic and forced light/dark states, as well as interactive states,
   against the baseline.
5. **Migrate components in dependency order.** Move generated-control
   components first, then tooltip and menu once their slot and external-target
   contracts are settled in follow-up design work. Slots and parts are not
   build-tooling gates. Migrate JSX components to bundler-provided class maps
   and native CSS Modules imports. Preserve form behavior and keyboard
   interaction with browser tests after each component.
6. **Publish and cut over.** Build and pack all affected packages. Verify an
   isolated Vite consumer can load JSX styles and web components using the
   separately installed plugin, that a plain HTML page can use both the
   aggregate and selected `theme-vanilla` CSS entries, that web-component CSS
   stays inside its root, and that shared sheets have stable URLs. No Tailwind
   directives should remain in published CSS. Source CSS Modules and the
   provisional `?neon` import may remain in npm authoring entries; they must
   not remain in the final browser JS/CSS. Remove Tailwind dependencies only
   after the site and package checks pass. Document the CSS and shadow DOM
   migration for consumers and release the packages with appropriate
   Changesets. A standalone CDN build is outside this migration.

## Decisions to settle

1. Which emitter strategy should implement the accepted public class mapping
   and composition contract in `theme-vanilla`? Validate state selectors,
   composition, and collisions in the first slice.
2. Which small set of selective CSS groups should `theme-vanilla` export, and
   how should their load order and overlap behave?
3. Settle the Vite plugin's final package name and opt-in import API after the
   packed-consumer proof. Vite is the only adapter in scope.

Detailed slots and parts contracts, other bundler adapters, and a standalone
CDN build remain future work.

## Remaining browser validation

Validate scheme inheritance in Chromium and Firefox: unstyled page under a
dark OS preference, page opt-in under both preferences, forced root
light/dark, per-host override, and nested web components. Chromium has a
local proof; Firefox still needs a browser test.

## References

- [Vite CSS handling](https://vite.dev/guide/features.html#css) and
  [library CSS output](https://vite.dev/guide/build#css-support)
- [Vite import attributes design discussion](https://github.com/vitejs/vite/discussions/18534)
- [Lightning CSS Modules composition](https://lightningcss.dev/css-modules.html)
- [CSS module scripts and MIME type](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import/with#css_modules_type_css)
- [Popover targets must be in one tree](https://html.spec.whatwg.org/dev/popover.html#the-popover-target-attributes)
- [Shadow DOM style boundaries](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM)
- [Lit shared styles and theming](https://lit.dev/docs/components/styles/)
- [CSS shadow selectors and slots](https://drafts.csswg.org/css-shadow-1/)
- [CSS color-scheme and used scheme](https://drafts.csswg.org/css-color-adjust-1/)
- [CSS light-dark()](https://drafts.csswg.org/css-color-5/#light-dark)
- [Slot styling scope](https://drafts.csswg.org/css-shadow-1/#slotted-pseudo)
- [CSS import attribute browser support](https://web-platform-dx.github.io/web-features-explorer/features/css-modules/)
