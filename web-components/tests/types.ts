// biome-ignore-all lint: test file

import * as wc from '@neon-kit/web-components';
import { NeonTooltipElement, registerTooltip } from '@neon-kit/web-components/tooltip';
import { NeonMenuElement, registerMenu } from '@neon-kit/web-components/menu';
import { NeonComboboxElement, registerCombobox } from '@neon-kit/web-components/combobox';
import { NeonMulticomboboxElement, registerMulticombobox } from '@neon-kit/web-components/multicombobox';
import { NeonDatepickerElement, registerDatepicker } from '@neon-kit/web-components/datepicker';
import { NeonTimepickerElement, registerTimepicker } from '@neon-kit/web-components/timepicker';
import { NeonIconElement, registerIcon, setIconLoader } from '@neon-kit/web-components/icon';
import bars3Outline from '@neon-kit/icons/outline/bars-3';

void wc;

registerTooltip();
registerTooltip('app-tooltip');
registerMenu();
registerMenu('app-menu');
registerCombobox();
registerCombobox('app-combobox');
registerMulticombobox();
registerMulticombobox('app-multicombobox');
registerDatepicker();
registerDatepicker('app-datepicker');
registerTimepicker();
registerTimepicker('app-timepicker');
registerIcon();
registerIcon('app-icon');
setIconLoader(async (name) => bars3Outline);

const icon = new NeonIconElement();
icon.icon = bars3Outline;
icon.icon = null;
void icon;

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

declare const multi: NeonMulticomboboxElement;
const mvs: string[] = multi.values;
void mvs;
multi.values = ['a', 'b'];
multi.values = new Set(['a']);
const msel: HTMLOptionElement[] = multi.selectedOptions;
void msel;
const mvalue: string = multi.value;
void mvalue;
const mok: boolean = multi.checkValidity();
void mok;

// @ts-expect-error - values must be an iterable of strings, not a single string assignment
multi.values = 'us';

// @ts-expect-error - tag name must be a string
registerMulticombobox(123);

declare const datepicker: NeonDatepickerElement;
const dv: string = datepicker.value;
void dv;
datepicker.value = '2026-04-15';
datepicker.readOnly = true;
datepicker.step = 7;
const dn: number = datepicker.valueAsNumber;
void dn;
datepicker.valueAsNumber = 1776211200000;
const dd: Date | null = datepicker.valueAsDate;
void dd;
datepicker.valueAsDate = new Date(0);
datepicker.stepUp();
datepicker.stepDown(2);
const dok: boolean = datepicker.checkValidity();
void dok;

// @ts-expect-error - tag name must be a string
registerDatepicker(123);

declare const timepicker: NeonTimepickerElement;
const tv: string = timepicker.value;
void tv;
timepicker.value = '09:30';
timepicker.seconds = true;
timepicker.readOnly = true;
timepicker.step = 900;
const tn: number = timepicker.valueAsNumber;
void tn;
timepicker.valueAsNumber = 34200000;
const td: Date | null = timepicker.valueAsDate;
void td;
timepicker.valueAsDate = new Date(0);
timepicker.stepUp();
timepicker.stepDown(2);
const tl: HTMLDataListElement | null = timepicker.list;
void tl;
const tok: boolean = timepicker.checkValidity();
void tok;

// @ts-expect-error - tag name must be a string
registerTimepicker(123);
