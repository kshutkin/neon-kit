import {
    createTooltipController,
    readTooltipPlacement,
    readTooltipTriggerSet,
} from '@neon-kit/core/tooltip';
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

void placement;
void triggers;
void focusable;
