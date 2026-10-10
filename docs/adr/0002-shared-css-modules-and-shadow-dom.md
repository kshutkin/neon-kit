# 0002 — Shared CSS Modules and shadow DOM rendering

- Status: accepted; implementation in progress
- Date: 2026-10-07
- Supersedes: [0001 — Rendering mode](0001-rendering-mode.md)

## Context

Neon Kit has not been released, so the old selector and light-DOM rendering
contracts do not need a compatibility layer. We want to remove Tailwind,
share visual rules between web components and JSX components, and offer plain
CSS for hand-written HTML. The documentation application is the first real
browser build; a separate CDN distribution is future work.

## Decision

Use CSS Modules as the shared authoring format in `@neon-kit/theme`.
Web components render generated internals in shadow DOM and adopt their
dependency-ordered native `CSSStyleSheet` objects through
`@slimlib/element`'s `shadowStyles(sheets)`. JSX components remain in light DOM,
import their own `.module.css` sources, and consume Vite's normal class maps.
Each renderer uses the class strings emitted by its own compiler path.

`@neon-kit/style-build` owns Vite-independent compilation and sheet graph
semantics. A separate Vite plugin package depends on that core and owns
resolution, development integration, and final browser assets. Vite is the
only supported bundler in this migration. Native CSS module-script imports
are the web-component output contract; their source syntax is distinct from
CSS Modules authoring syntax.

`@neon-kit/theme-vanilla` has its own build consuming theme sources. It owns
the documented public class names and publishes aggregate and selectable
ordinary CSS entries. Its consumers use a stylesheet link or an ordinary CSS
import. The [public CSS policy](../style-migration/PUBLIC_CSS_API.md) defines
the names and the composition contract; the emitter is proved in step 2.
Renderer module names do not become public HTML classes automatically.

Every web component adopts a shared shadow base sheet containing local token
fallbacks and the internal reset it needs. Components render with no global
Neon theme stylesheet. Public custom properties can inherit as optional
overrides; local default names must not mask those overrides. Fonts remain
document-owned and have usable fallbacks. Document reset and page styles are
separate from the shadow reset.

Hosts inherit `color-scheme` without declaring their own default. An unstyled
page remains light, including under a dark OS preference. A page opts into
automatic mode with `color-scheme: light dark`, or forces a mode with `light`
or `dark`; an explicit host declaration can override its inherited choice.
Semantic colors use `light-dark()` so they follow that used scheme. Replace
the documentation switcher's `data-theme` and `dark` class toggles with this
native scheme contract during theme migration.

Consumer-authored children stay in light DOM and are projected into shadow
roots. Detailed slots and parts APIs are deferred. External popover targets,
focus, form internals, and ARIA relationships need browser checks when the
affected components migrate.

## Browser policy

The supported migration targets are evergreen Chromium and Firefox with the
native APIs required by the affected components and the compiled style path.
Safari is outside the web-component release target. No CSS import polyfill is
part of this plan. Final native sheet imports, adopted sheets, lazy entries,
color-scheme inheritance, focus, and form behavior must be exercised in both
target engines before claiming migration acceptance. This is a target policy,
not a claim that the current baseline has passed Firefox checks.

## Consequences

- Web-component styling follows the shadow boundary; page selectors cannot
  reach generated internals. Public customization uses inherited properties
  and host attributes, with parts to be designed later.
- JSX consumers use normal Vite CSS Modules support; web-component consumers
  configure the separate plugin. The compiler stays build tooling.
- Vanilla consumers receive stable existing-style class names and complete plain CSS;
  they do not need compiler-generated class strings or the plugin.
- Public vanilla names have no mandatory package prefix; consumer CSS
  collisions are accepted. Exported CSS Modules classes remain scoped in
  component output. Documentation showcases vanilla in separate documents
  from CSS Modules components, with no shared global vanilla catalogue.
- Shared theme sources remain the authority for visual declarations across
  all three outputs. Class names can differ without duplicating those rules.
- A packaged Slimlib release exposing `shadowStyles()` and final browser
  output checks are prerequisites for the shadow migration. The runtime
  prerequisite is satisfied by `@slimlib/element@0.5.0`.

## Implementation record

Step 1 captures the existing light-DOM implementation in the
[migration baseline](../style-migration/README.md). That historical behavior
remains the running implementation until later steps migrate each component.
The [migration plan](../STYLE_SYSTEM_MIGRATION_PLAN.md) governs those steps;
this ADR replaces the old parallel light-DOM/CDN entry-point direction.
