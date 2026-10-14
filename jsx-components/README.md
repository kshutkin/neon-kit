# @neon-kit/jsx-components

JSX components implementing the Neon Kit theme.

## Install

```sh
pnpm add @neon-kit/jsx-components
```

## Styles

Each component imports its ordinary CSS Module. Vite's built-in CSS Modules
support supplies the classes and document CSS; the native-sheet plugin is only
needed when the application also uses Neon web components. JSX renders in light
DOM and uses the same theme sources as those components.

Fonts, document resets, and `color-scheme` belong to the page. Preserve native
`light-dark()` when building CSS (for example, Vite
`build.cssTarget: ['chrome128', 'firefox128']`). Public customization uses
`--neon-*` properties. Import theme modules explicitly for consumer-authored
markup such as trigger buttons, menu groups, and rich tooltip content.

## Menu

```jsx
import { Menu, MenuItem } from '@neon-kit/jsx-components/menu';
import menus from '@neon-kit/theme/components/menu.module.css';
import buttons from '@neon-kit/theme/components/button.module.css';

<Menu
    content={
        <div class={menus.menu__group}>
            <MenuItem onClick={createFile}>New file</MenuItem>
            <MenuItem disabled>Delete</MenuItem>
        </div>
    }
>
    <button type="button" class={buttons.btn}>Actions</button>
</Menu>
```

`Menu` renders the trigger and popover as siblings and wires their native
`popovertarget` relationship. `MenuItem` renders a button with menu-item
semantics; its `disabled` prop uses `aria-disabled` so disabled rows remain in
arrow-key navigation.

## Tooltip

```jsx
import { Tooltip } from '@neon-kit/jsx-components/tooltip';

<Tooltip content="Persists the current draft.">
    <button type="button">Save</button>
</Tooltip>
```
