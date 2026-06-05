# 0001 — Rendering mode for `@neon-kit/web-components`

- Status: accepted
- Date: 2026-05-05

## Context

`@neon-kit/web-components` ships custom elements that mirror parts of the
`@neon-kit/theme` design system. There are two viable rendering strategies:

1. **Light DOM** — components author into the host document. Styling is
   delivered by the host application's Tailwind / `@neon-kit/theme` build,
   so consumers control the CSS pipeline and tokens.
2. **Shadow DOM** — components encapsulate their own styles. The library
   ships pre-bundled CSS chunks alongside each component so that consumers
   can drop a `<script type="module" src="…cdn…/tooltip.js">` and have it
   render correctly without any build step.

These modes are not mutually exclusive: many WC libraries support both via
a build-time toggle or two parallel entry points.

## Decision

Start with **Light DOM only**. Consumers must include `@neon-kit/theme`
(or a theme-equivalent stylesheet) in their app for components to render
correctly. Components manipulate their own children and document-level
popovers but never attach a shadow root.

Light-DOM components must still work when consumers place them inside an
open shadow root. Code that reads document state (for example focus) must
prefer the component's own root over `document` globals when the value can
differ across shadow boundaries.

A future Shadow-DOM / CDN-friendly mode is on the roadmap. When added it
will be opt-in (likely via a parallel entry point such as
`@neon-kit/web-components/cdn/tooltip` that bundles its CSS chunk) so the
Light-DOM API stays untouched.

## Consequences

- **Pro:** zero CSS shipped from this package today. The Tailwind layer in
  the consumer app remains the single source of truth for tokens, dark
  mode, and overrides.
- **Pro:** components compose naturally with theme-styled markup that
  apps already use.
- **Con:** consumers must wire up the theme build. A `<script>`-only
  consumption mode is not yet possible — tracked for the Shadow-DOM mode.
- **Con:** style isolation is the consumer's responsibility; nothing
  prevents global cascade leaks until Shadow-DOM mode lands.

## Roadmap

When Shadow-DOM / CDN mode is implemented:

- Each component module in `src/<name>.js` stays Light-DOM and unchanged.
- A parallel `src/cdn/<name>.js` (or similar) attaches a shadow root and
  injects the relevant CSS chunk extracted from `@neon-kit/theme`.
- The CSS chunks are produced by a small build that consumes
  `@neon-kit/theme/components/<name>.css` and emits a CSSStyleSheet via
  `new CSSStyleSheet()` + `adoptedStyleSheets`.
- Both entry points coexist; consumers pick per-import.
