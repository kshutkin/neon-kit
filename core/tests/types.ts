import {
    createTooltipController,
    readTooltipPlacement,
    readTooltipTriggerSet,
} from '@neon-kit/core/tooltip';
import {
    createMenuController,
    createMenuLabelController,
    createMenuRootController,
    getPopoverTarget,
    isOpenPopover,
} from '@neon-kit/core/menu';
import { isFocusable } from '@neon-kit/core/utils';

const triggerElement = document.createElement('button');
const tooltipElement = document.createElement('div');
const [update, destroy] = createTooltipController([
    tooltipElement,
    triggerElement,
]);

update({ placement: 'bottom', trigger: 'hover focus' });
destroy();

const placement: 'top' | 'bottom' | 'left' | 'right' = readTooltipPlacement('left');
const triggers: Set<'hover' | 'focus' | 'click'> = readTooltipTriggerSet('click');
const focusable: boolean = isFocusable(triggerElement);
const menuElement = document.createElement('div');
const menuItemElement = document.createElement('button');
const menuRootController = createMenuRootController();
const menuController = createMenuController(
    menuElement,
    () => menuRootController,
    () => [menuItemElement],
    {
        menu: '.menu',
        item: '.menu__item',
        ownedItem: ':scope .menu__item:not(:scope .menu .menu__item)',
    },
);
const menuLabelController = createMenuLabelController(menuElement);

menuController.$_refreshItems();
menuController.$_clearItems();
menuLabelController.$_sync(triggerElement);
menuLabelController.$_clear();

void placement;
void triggers;
void focusable;
void getPopoverTarget(triggerElement);
void isOpenPopover(menuElement);
