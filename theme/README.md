# @neon-kit/theme

Shared style sources for Neon Kit. Component visuals are authored as CSS Modules;
there is no Tailwind requirement and no public HTML class bundle in this package.

- `components/<family>.module.css`: button, links, dialog, details, menu, nav,
  kbd, badge, tag, table, forms, combobox, datepicker, timepicker, and tooltip.
- `shared.module.css`: composed surfaces, state treatments, and Neon effects.
- `tokens.css`: defaults for document and shadow styling roots. Optional public
  overrides use `--neon-*` names, such as `--neon-color-border` and
  `--neon-primary-hue`; `--_*` names are internal defaults and working values.
- `theme.css`: document token defaults and `color-scheme: light dark` opt-in.
- `reset-normalize.css`: document reset.
- `shadow-base.css`: internal reset, font fallback, focus, and token defaults.
  It inherits the page's scheme and never loads a font.

Authored CSS uses standard, unprefixed properties and selectors. The consumer
build pipeline owns browser compatibility transformations. `dashedIdents` stays
disabled: custom-property names remain stable across separately adopted sheets.
The external `interestfor` polyfill bridge keeps its required `--interest-delay`
name; Neon timing inputs are `--neon-tooltip-open-delay` and
`--neon-tooltip-close-delay`.

Vite's ordinary CSS Modules handling supplies light-DOM class maps. The separate
`@neon-kit/vite-plugin-style-build` handles `.css?neon` class strings and ordered
native sheets for shadow roots. Renderer migration is the next plan step.

Use [`@neon-kit/theme-vanilla`](../theme-vanilla/README.md) for classical HTML.
The page owns font loading. A page with no color-scheme declaration stays light;
`light dark` follows the OS, while `light` or `dark` forces that mode.

## Customization names

```css
:root {
    --neon-primary-hue: 320;
    --neon-color-border: oklch(60% 0.05 320);
}
.my-menu {
    --neon-menu-item-padding-inline: 1.25rem;
}
.my-tooltip-region {
    --neon-tooltip-open-delay: 250ms;
    --neon-tooltip-close-delay: 400ms;
    --neon-tooltip-max-inline-size: 20rem;
}
```

The matching internal defaults are `--_color-border`,
`--_menu-item-padding-inline`, and `--_tooltip-max-inline-size`. Components read
public inputs with private fallbacks; these private names are not customization
API. Palette inputs include `--neon-color-blue`, `--neon-color-green`, and
`--neon-color-pink`.
