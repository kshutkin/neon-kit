# @neon-kit/core

Framework-agnostic behavior and DOM primitives for Neon Kit.

## Install

```sh
pnpm add @neon-kit/core
```

## Tooltip controller

`@neon-kit/core/tooltip` provides the shared tooltip behavior used by
the Neon Kit web component and JSX component:

```js
import { createTooltipController } from '@neon-kit/core/tooltip';
```

The controller accepts positional class bindings as its fifth option:
`[rootClass, placementClasses]`, where `placementClasses` maps `top`, `bottom`,
`left`, and `right` to CSS Modules class strings. Composed strings are split into
individual classes. Omitting these bindings retains the plain CSS class defaults.
`classSelector()` from `@neon-kit/core/utils` converts a composed class string
into a selector matching all its classes.

## Menu controllers

`@neon-kit/core/menu` provides selector-configured menu navigation, popover
labelling, and menu-tree coordination shared by the Neon Kit web component and
JSX components:

```js
import {
    createMenuController,
    createMenuLabelController,
    createMenuRootController,
} from '@neon-kit/core/menu';
```

Adapters wire `handleBeforeToggle` to `beforetoggle` as well as wiring
`handleToggle` to `toggle`. Focus restoration runs before native closing can
clear focus; open-menu coordination continues through the queued toggle event.
