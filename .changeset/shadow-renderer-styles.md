---
"@neon-kit/web-components": minor
"@neon-kit/jsx-components": minor
"@neon-kit/core": minor
"@neon-kit/theme": minor
"@neon-kit/theme-vanilla": minor
"@neon-kit/style-build": minor
"@neon-kit/vite-plugin-style-build": minor
---

Migrate web components to open shadow roots with native CSS Modules and shared
adopted sheets. Preserve form APIs, external labels, keyboard navigation, light
options, and composed input/change events. Menu and tooltip hosts remain external
popover targets and project authored light-DOM content through default slots.

Import ordinary CSS Modules from JSX entries and use their scoped, composed
classes. Add controller class bindings and composed-class selectors. Restore menu
focus before native closing can clear it in Firefox.

Add compiler/Vite host-root projection with separate variants and preserved base
sheet sharing, nesting, pseudo-elements, and source maps. Supply shadow-only form
and icon layout sources, and use fixed tooltip positioning for fixed and scrolled
triggers in Chromium and Firefox.
