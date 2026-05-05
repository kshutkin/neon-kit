// biome-ignore-all lint: test file

import * as wc from '@neon-kit/web-components';
import { NeonTooltipElement, registerTooltip } from '@neon-kit/web-components/tooltip';
import { NeonMenuElement, registerMenu } from '@neon-kit/web-components/menu';

void wc;

registerTooltip();
registerTooltip('app-tooltip');
registerMenu();
registerMenu('app-menu');

const menu = new NeonMenuElement();
const items: HTMLElement[] = menu.items;
void items;

declare const tooltip: NeonTooltipElement;
tooltip.showTooltip();
tooltip.hideTooltip();

// @ts-expect-error - tag name must be a string
registerMenu(123);

// @ts-expect-error - tag name must be a string
registerTooltip(123);
