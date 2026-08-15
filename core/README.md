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
