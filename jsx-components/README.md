# @neon-kit/jsx-components

JSX components implementing the Neon Kit theme.

## Install

```sh
pnpm add @neon-kit/jsx-components
```

## Menu

```jsx
import { Menu, MenuItem } from '@neon-kit/jsx-components/menu';

<Menu
    content={
        <div class="menu__group">
            <MenuItem onClick={createFile}>New file</MenuItem>
            <MenuItem disabled>Delete</MenuItem>
        </div>
    }
>
    <button type="button" class="btn">Actions</button>
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
