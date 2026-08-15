import { Menu, MenuItem, Tooltip } from '@neon-kit/jsx-components';
import { Menu as MenuFromSubpath, MenuItem as MenuItemFromSubpath } from '@neon-kit/jsx-components/menu';
import { Tooltip as TooltipFromSubpath } from '@neon-kit/jsx-components/tooltip';

const triggerElement = document.createElement('button');
const itemElement: HTMLButtonElement = MenuItem({
    children: 'Open',
    disabled: false,
    onClick: (event) => event.preventDefault(),
});
const menu = Menu({
    children: triggerElement,
    content: itemElement,
    placement: 'inline-end',
});

void menu;
void Menu;
void MenuFromSubpath;
void MenuItem;
void MenuItemFromSubpath;
void Tooltip;
void TooltipFromSubpath;
