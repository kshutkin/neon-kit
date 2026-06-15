// Append a single HTMLElementTagNameMap augmentation to the
// freshly-generated types/index.d.ts so consumers see typed
// `document.createElement('neon-x')` / `querySelector('neon-x')`.
//
// Idempotent within a single build run (types/index.d.ts is regenerated
// each build).

import { readFileSync, writeFileSync } from 'node:fs';

const TARGET = 'types/index.d.ts';
const MARKER = '// neon-kit:tag-name-map';

const block = `
${MARKER}
interface HTMLElementTagNameMap {
    'neon-combobox': import('@neon-kit/web-components/combobox').NeonComboboxElement;
    'neon-multicombobox': import('@neon-kit/web-components/multicombobox').NeonMulticomboboxElement;
    'neon-datepicker': import('@neon-kit/web-components/datepicker').NeonDatepickerElement;
    'neon-timepicker': import('@neon-kit/web-components/timepicker').NeonTimepickerElement;
    'neon-icon': import('@neon-kit/web-components/icon').NeonIconElement;
    'neon-menu': import('@neon-kit/web-components/menu').NeonMenuElement;
    'neon-menu-item': import('@neon-kit/web-components/menu').NeonMenuItemElement;
    'neon-tooltip': import('@neon-kit/web-components/tooltip').NeonTooltipElement;
}
`;

const current = readFileSync(TARGET, 'utf8');
if (current.includes(MARKER)) process.exit(0);
writeFileSync(TARGET, current + block);
