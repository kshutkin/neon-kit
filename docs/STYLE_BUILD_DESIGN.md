# @neon-kit style build for shadow-root components

Status: compiler and Vite adapter implemented through
[migration step 3](style-migration/STEP_3_BUILD.md). The accepted adapter is
`@neon-kit/vite-plugin-style-build`, using `.css?neon` named class strings and
ordered `sheets`. Broader standalone/compiler possibilities below remain future
work. The published
`@slimlib/element@0.5.0` provides the `shadowStyles()` rendering middleware
and is used by the migration fixture.

The current migration scope is defined in
[`STYLE_SYSTEM_MIGRATION_PLAN.md`](STYLE_SYSTEM_MIGRATION_PLAN.md): Vite is the
only supported bundler, its adapter is a separate package depending on
`@neon-kit/style-build`, and standalone/CDN builds and detailed slots/parts
APIs are deferred. `@neon-kit/theme` owns shared style sources;
`@neon-kit/theme-vanilla` owns its own build and selectable plain CSS outputs
for classical HTML use. The broader compiler possibilities below do not add
deliverables to that migration.

## Goal

Build an `@neon-kit` authoring and compilation layer that lets components rendered
by `@slimlib/element` use ordinary CSS files, reuse classes from other CSS
modules, and adopt only their required styles into shadow roots. A shared
compiler should define the meaning of those imports; small bundler adapters
should connect that compiler to each bundler's module graph. The published
component should need only final class strings and an ordered set of
stylesheets. It should not need a CSS Modules class map or composition metadata
at runtime. The compiled output targets native CSS module-script imports
(`with { type: 'css' }`) and excludes Safari for now.

For example, the source tree may contain:

```css
/* theme.css: adopted into each component shadow root */
:host {
    --border-color: var(--app-border-color, rebeccapurple);
}
```

```css
/* border.module.css */
@import './theme.css';
.border { border: 1px solid var(--border-color); }
```

```css
/* link.module.css */
.link {
    composes: border from './border.module.css';
    animation: enter 180ms ease;
}
@keyframes enter { from { opacity: 0; } to { opacity: 1; } }
```

```jsx
import { link, sheets } from './link.module.css?neon';
import { defineElement, shadowStyles } from '@slimlib/element';

defineElement('example-link', [shadowStyles(sheets)], () =>
    <a class={link}>Example</a>
);
```

`?neon` is the accepted opt-in import spelling. It prevents an adapter from
confusing these imports with its bundler's normal `.module.css` handling. The
public spelling was validated by the packed Vite consumer.

The application may set `--app-border-color` on `:root`, another ancestor, or
the individual host; the theme sheet's fallback works when it sets none.

## Ownership and integration

The compiler core, bundler adapters, CLI, and authoring types belong in the
`@neon-kit` workspace. `@neon-kit/style-build` is the shared core. The current
Vite adapter belongs in a separate package with the core as a normal dependency
and Vite as a peer dependency: `@neon-kit/vite-plugin-style-build`.
`@slimlib/element` remains the rendering
integration and does not own the build implementation.

`@slimlib/element` is the initial rendering target. It receives ordered native
`CSSStyleSheet` objects through `shadowStyles(sheets)` and the compiled class
strings through normal JSX attributes. It does not import `@neon-kit` packages or
participate in CSS compilation. The `@neon-kit` build output may import
`@slimlib/element`, while the runtime dependency does not point back to
`@neon-kit`.

## Scope and invariants

- Source styles remain CSS. The theme file is compiled and adopted like the
  border and leaf files. Public override variables may be declared on the
  document root or any ancestor and inherit through the shadow host; no
  global theme stylesheet is required.
- A CSS module is compiled once per source identity and configuration. Its
  generated class names are stable across every importer and entry point.
- `composes` expands the exported class string **and** adds a stylesheet
  dependency. Merely including the other class name on an element would not
  make its rule available inside the shadow root. A local, unconditional
  source `@import` also adds a stylesheet dependency, without class
  composition; this is how border styles request the theme sheet.
- Every shadow root adopts each required sheet once, in a deterministic order.
  Styles from another shadow root or the document do not leak in.
- Each reachable source CSS file produces a real compiled `.css` asset.
  Shared border rules and leaf rules remain separate assets. A bundler adapter
  must preserve this boundary rather than allow its normal CSS pipeline to
  inject, inline, or merge the styles into document CSS.
- CSS Modules names are compiler syntax. The browser does not process
  `composes`, and native CSS module-script imports do not export class maps.
- Compiled CSS assets contain valid CSS with no `composes` or `@import` rules.
  The HTML standard does not permit `@import` in CSS module scripts. The first
  compiler accepts only local, top-level, unconditional source `@import`
  rules and lowers them to separate sheet imports. Reject external URLs,
  media/supports conditions, and import layers until their dependency and
  cascade semantics are designed. Within `?neon` sources, this restricted
  `@import` is a dependency declaration: a sheet is adopted once even if
  several import paths reach it.

The initial version should include the complete CSS of each reachable source
module. Pruning unused selectors within a module is a separate optimization:
computed class access, selectors spanning several classes, global rules, and
animation references require conservative analysis. This distinction also
keeps the first build contract independent of each bundler's tree shaking.
For the first implementation, order sheets with dependencies before their
importers, preserve each source file's internal rule order, and use a stable
tie-breaker for unrelated dependencies. Conflicting declarations across
different composed modules should be diagnosed or require an explicit order;
the order of class names in an HTML attribute does not set cascade order.

## Shared compiler

The `@neon-kit/style-build` package owns a filesystem-independent core:

```ts
type CompiledStyleModule = {
    id: string;
    css: string;                         // transformed CSS for this source only
    exports: Record<string, string>;    // final class strings, including composes
    dependencies: Array<{ id: string; kind: 'import' | 'compose' }>;
    assets: string[];                   // referenced url() assets, if any
    urls: Array<{ url: string; placeholder: string; loc: SourceLocation }>;
    map?: string;                      // JSON source map with authored source text
};

compileStyle(entryId, host: {
    read(id: string): Promise<string>;
    resolve(specifier: string, importer: string): Promise<string>;
}, options?: { sourceMap?: boolean; projectRoot?: string }): Promise<CompiledStyleModule[]>;
```

The core also exports AST URL rewriting and authoring declaration helpers;
see its [current API](../style-build/README.md). The important boundary is that the core returns
transformed per-source CSS, final exports, and graph edges without deciding
how a bundler packages them. Resolution must normalize paths, honor the
adapter's aliases/package resolution, detect cycles, and report missing class
references with source locations. Cache keys must include source identity,
compiler options, and relevant target settings.

Lightning CSS is a reasonable required compiler. Its `transform` API returns
CSS Modules exports with local and cross-file `composes` references. With
dependency analysis enabled it also reports source `@import` references. The
core can resolve both edge types recursively, generate final class strings,
and order the required sheets. Plain `.css` files such as `theme.css` have no
class exports but go through the same dependency graph and native CSS asset
emission as `.module.css` files. Leave theme custom properties unscoped when
compiling module files: Lightning CSS can optionally rename dashed
identifiers, which would break references between separately emitted sheets
if enabled indiscriminately.
Its `bundle` API would inline dependencies, so it does not preserve a separate
shared border asset. A different CSS
Modules compiler is possible if it provides equivalent CSS, export, dependency,
and source-map data. There is little value in writing another CSS parser here.

Compilation also needs to handle `url()` assets and source maps. The shared
core can identify references; the adapter supplies the bundler's asset URL
resolution and emission policy. A standalone build can use its own asset
emitter. Rewrite relative URLs against the location of the emitted CSS asset,
and serve the asset with a `text/css` MIME type.

## Compiled output

The source-only `?neon` import is replaced by ordinary JS and native typed CSS
imports. A standalone build could emit the following component module and
three CSS assets in `dist/`:

```js
import themeSheet from './theme.hash.css' with { type: 'css' };
import borderSheet from './border.hash.css' with { type: 'css' };
import linkSheet from './link.hash.css' with { type: 'css' };
import { defineElement, shadowStyles } from '@slimlib/element';

const link = 'link_hash border_hash';
const sheets = [themeSheet, borderSheet, linkSheet];

defineElement('example-link', [shadowStyles(sheets)], () =>
    <a class={link}>Example</a>
);
```

`dist/theme.hash.css` contains only the shadow-root variable defaults;
`dist/border.hash.css` contains only the transformed border rules;
`dist/link.hash.css` contains only the transformed link rules and keyframes.
A compiled card imports the same theme and border asset URLs and its own card
asset. The browser module map shares a native sheet for repeated imports of
the same URL.
The JS imports are static, so a lazily loaded component requests its sheets
with that component. The runtime receives class strings and `CSSStyleSheet`
objects. It does not resolve `composes` or walk a CSS dependency graph.

The example inlines the compiled class string at its use site. An actual
adapter may retain a generated JS facade with named class-string exports; that
is still compiled data, not a runtime CSS Modules map. Source-only `?neon`
imports may remain in npm source authoring entries, but must not remain in
the final browser artifact.

An authoring import with named class exports is preferable to an opaque
`styles[name]` object for typing and future unused-export analysis. The
compiler should still support a conservative whole-module mode for dynamic
access or CSS rules whose reachability cannot be proved.

Only the optional override variable, `--app-border-color`, needs to cross the
shadow boundary. The application can set it with `:root { --app-border-color:
crimson; }`, on a closer ancestor, or on one component host. The adopted theme
sheet maps it to the internal `--border-color` and supplies the default value.
Keep the public override name distinct from the internal name so the theme's
`:host` declaration does not mask the inherited override.

## Bundler adapters

Each adapter should do only the work that cannot live in the shared core:

1. Intercept opt-in `.css?neon` and `.module.css?neon` source imports before
   the bundler's normal CSS loader.
2. Supply resolution and file watching to the shared compiler.
3. Emit one compiled CSS asset per reachable source module and rewrite the
   generated JS to import each required asset using `with { type: 'css' }`.
   Preserve those imports in final browser JS, including dynamic-entry output.
4. Prevent the normal CSS pipeline from injecting or merging these assets;
   rewrite `url()` references and ensure CSS URLs and MIME types are valid.
5. Update affected style modules during development and preserve class-name
   consistency between development and production builds.

Implement only the separate Vite adapter in the current migration. Port the
theme, shared border, and lazy
leaf scenario from the temporary Slimlib playground into integration fixtures
in the `@neon-kit` workspace. Other bundler adapters are future work; the
compiler remains independent of Vite so they can reuse its contract.
Avoid delegating shadow CSS Modules compilation to each
bundler: doing so would recreate the divergent `composes` behavior the build
layer is meant to remove.

A future CLI could use the same compiler without a bundler. Besides validating the
core, it can produce precompiled library artifacts for consumers that do not
install an adapter. Consumers of those artifacts still need a browser or
downstream bundler that preserves native typed CSS imports. An adapter should
be considered supported only after its final output is inspected and loaded
in a browser; parsing the source import alone is insufficient. Publishing raw
source CSS as the only style contract would instead require every consuming
build to understand the custom import.

## `@slimlib/element` rendering boundary

The runtime middleware accepts native `CSSStyleSheet` objects; it does not
import Lightning CSS or know about CSS Modules. The core now selects a render
root supplied by middleware, defaulting to the host. `shadowStyles(sheets)`
attaches an open shadow root during construction, adopts the ordered sheets,
and supplies that root before first render. The root and sheets survive
disconnects; render content is removed on unmount and recreated on reconnect.
Existing light-DOM components continue using the host as their render root.

The first middleware does not provide a separate policy for a shadow root
already attached by another layer. A sheet imported in one document cannot be
assumed adoptable by a shadow root in another. Cross-document moves need a
separate policy and test before claiming support.

## Future CSS Shadow Parts API

The adopted sheets define internal defaults; `part` exposes selected rendered
elements for styling by a stylesheet in the parent tree. This needs no change
to native CSS imports or the sheet dependency graph:

```jsx
<a class={link} part="link">Example</a>
```

```css
/* Consumer CSS in the parent document */
example-link::part(link) { border-color: orange; }
```

The compiled `.link` class may be renamed, but `link` in `part="link"` is a
public component API and must remain stable. The compiler must not treat part
names as CSS Modules classes, hash them, or make consumer `::part()` rules into
dependencies of an internal sheet. For nested custom elements, authors can
explicitly forward selected parts with `exportparts`, including a public-name
mapping. Normal external `::part()` declarations can override normal internal
defaults; internal `!important` declarations can prevent that override, so
their use on exposed parts needs deliberate review.

An optional later build check could validate literal `part` and `exportparts`
names against a declared public parts list and generate documentation or
types. The first implementation needs only native attributes and selectors.

## Proposed acceptance checks

- In the `@neon-kit` workspace, build a component against the packaged
  `@slimlib/element` API. Confirm that its output passes native sheets and
  class strings to `shadowStyles()` without an `@neon-kit` runtime dependency.
- Compile theme, border, link, and card fixtures with the compiler core and
  the separate Vite adapter; compare exported classes and transformed CSS.
- In a browser, mount link and card in distinct shadow roots. Verify their
  shared border style, theme fallback, root-provided override, leaf animation,
  and that the adopted sheets do not style unrelated document or shadow-root
  elements.
- Lazy-load each component and inspect the final `dist/` output: separate
  border and leaf CSS assets, typed CSS imports in the JS, no document-level
  style injection, and one shared border URL for link and card.
- Load the compiled output directly in Chromium and Firefox with a `text/css`
  server response; verify `url()` assets, production output, and development
  updates to border CSS and class names.
- Before supporting cross-document moves, check that sheets remain adoptable
  or fail clearly rather than silently rendering without styles. Server-side
  execution of native CSS imports needs a separate SSR design.
- Preserve an explicit test for unused classes, but require pruning only when
  a later compiler pass can prove it safe.
- When parts are exposed, verify that consumer `::part()` rules style only the
  named internal elements and that forwarded parts work through nested roots.

## Open decisions

- The import/API decision is settled: `.css?neon` exports named class strings
  and `sheets`; the class export `sheets` is reserved.
- Whether shadow roots need generated class names at all. Shadow DOM already
  scopes selectors, but names still help when several independently authored
  stylesheets share one root and may collide.
- Which public override variable names are part of a component's stable API,
  and whether a future type generator should list them alongside CSS parts.
- How authors declare intentional cascade order when a leaf composes from
  multiple modules. CSS Modules does not specify a reliable order for
  conflicting declarations from separate files; the compiler must not infer
  one from incidental bundler traversal.
- Whether later optimization may combine source CSS files into larger native
  CSS assets, and which shared/leaf boundaries it must preserve.
- The current migration publishes source CSS for consumer Vite builds;
  precompiled standalone web-component artifacts are deferred.
- Whether cross-document moves or server-side rendering are needed for this
  browser-targeted native import path.

## References

- [Lightning CSS Modules API](https://lightningcss.dev/css-modules.html) and
  [bundling behavior](https://lightningcss.dev/bundling.html)
- [CSS Modules composition](https://github.com/css-modules/css-modules/blob/master/docs/composition.md)
- [vanilla-extract integrations](https://vanilla-extract.style/documentation/setup/)
- [Panda CSS PostCSS integration](https://panda-css.com/docs/installation/postcss)
  and [split CSS output](https://panda-css.com/docs/references/cli#css-splitting)
- [HTML CSS module-script definition](https://html.spec.whatwg.org/multipage/webappapis.html#create-a-css-module-script)
- [CSS import attribute browser support](https://web-platform-dx.github.io/web-features-explorer/features/css-modules/)
- [MDN adopted stylesheets](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot/adoptedStyleSheets)
- [MDN custom properties and fallback values](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascading_variables/Using_custom_properties)
- [CSS shadow parts](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Shadow_parts)
  and [nested `exportparts`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/exportparts)
