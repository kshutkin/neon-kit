// biome-ignore-all lint: test file

import * as wc from '@neon-kit/web-components';
import { NeonTooltipElement, registerTooltip } from '@neon-kit/web-components/tooltip';
import { NeonMenuElement, registerMenu } from '@neon-kit/web-components/menu';
import { NeonComboboxElement, registerCombobox } from '@neon-kit/web-components/combobox';

void wc;

registerTooltip();
registerTooltip('app-tooltip');
registerMenu();
registerMenu('app-menu');
registerCombobox();
registerCombobox('app-combobox');

const menu = new NeonMenuElement();
const items: HTMLElement[] = menu.items;
void items;

declare const tooltip: NeonTooltipElement;
tooltip.showTooltip();
tooltip.hideTooltip();

declare const combobox: NeonComboboxElement;
const v: string = combobox.value;
void v;
combobox.value = 'x';
const opts: HTMLOptionElement[] = combobox.options;
void opts;
const ok: boolean = combobox.checkValidity();
void ok;

// @ts-expect-error - tag name must be a string
registerMenu(123);

// @ts-expect-error - tag name must be a string
registerTooltip(123);

// @ts-expect-error - tag name must be a string
registerCombobox(123);
