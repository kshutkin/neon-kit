// biome-ignore-all lint: test file

import '@neon-kit/web-components';
import '@neon-kit/web-components/tooltip';
import '@neon-kit/web-components/menu';
import '@neon-kit/web-components/combobox';
import '@neon-kit/web-components/multicombobox';
import '@neon-kit/web-components/datepicker';
import '@neon-kit/web-components/timepicker';
import '@neon-kit/web-components/icon';
import bars3Outline from '@neon-kit/icons/outline/bars-3';

const icon = document.createElement('neon-icon');
icon.icon = bars3Outline;
icon.icon = null;
void icon;

const menu = document.createElement('neon-menu');
const items: HTMLElement[] = menu.items;
void items;

const tooltip = document.createElement('neon-tooltip');
tooltip.showTooltip();
tooltip.hideTooltip();

const combobox = document.createElement('neon-combobox');
const v: string = combobox.value;
void v;
combobox.value = 'x';
const opts: HTMLOptionElement[] = combobox.options;
void opts;
const ok: boolean = combobox.checkValidity();
void ok;
const qcb = document.querySelector('neon-combobox');
if (qcb) {
    const v2: string = qcb.value;
    void v2;
}

const multi = document.createElement('neon-multicombobox');
const mvs: string[] = multi.values;
void mvs;
multi.values = ['a', 'b'];
const msel: HTMLOptionElement[] = multi.selectedOptions;
void msel;
const mvalue: string = multi.value;
void mvalue;
const mok: boolean = multi.checkValidity();
void mok;

// @ts-expect-error - values must be an iterable of strings, not a single string assignment
multi.values = 'us';

const datepicker = document.createElement('neon-datepicker');
const dv: string = datepicker.value;
void dv;
datepicker.value = '2026-04-15';
datepicker.readOnly = true;
datepicker.step = '7';
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

const timepicker = document.createElement('neon-timepicker');
const tv: string = timepicker.value;
void tv;
timepicker.value = '09:30';
timepicker.seconds = true;
timepicker.readOnly = true;
timepicker.step = '900';
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
